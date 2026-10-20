#!/usr/bin/env python3
"""Keep V's memory_search vectors in the page cache (outside the Gateway).

memory_search ranks by a brute-force KNN over the whole sqlite-vec table
(memory_index_chunks_vec_vector_chunks00, ~750 MB on V's makaron agent in 2026-10).
V's agent DB is ~20 GB with ~12 GB of page cache to share with the Gateway and its
workers, and real searches are rare (a few dozen a day), so between two searches
the vector pages are evicted. The table is also scattered across the file
(56,061 runs of 190,150 pages on 2026-10-20), so a cold scan is ~190k random reads:
~27 s, past the tool's fixed 25 s deadline. The search then returns
"memory_search timed out" and the tool refuses retries for a minute. Voice calls
hit this first: the caller hears 25 s of silence and gets no memory.

This reads the vector tables front to back from a read-only connection, in short
autocommit batches (no long read snapshot, no write lock, no Gateway call), so the
next search finds them in the cache. Run it often enough that the pages never age
out (systemd/v-memory-vector-warm.timer). A warm pass is ~1 s of CPU at nice 19.

Two brakes keep it from making a bad moment worse:
- MemAvailable below 4 GiB: skip the round. On 2026-10-19 21:10 V was down to 3.7 GB
  and the Gateway stalled 30 s; re-reading 743 MB then only fights reclaim for memory and IO.
- 10 s spent in one pass: stop between two batches. A cold pass is ~23 s of random reads;
  the next round starts over, and the part already read is cached, so it gets further.

  v-memory-vector-warm.py [agent...]     default makaron; one JSON line per agent:
    {"MB", "ms", ...}                                  a full pass
    {"skipped": "low-memory", "memAvailableMb"}        memory brake
    {"aborted": "time-budget", "ms", "touchedMB"}      time brake (ms is past the budget)
  STATE_DIR=<dir>                        default /home/openclaw/.openclaw
  MIN_AVAILABLE_MB=<n>, TIME_BUDGET_MS=<n>, MEMINFO=<path>   overrides (tests)
"""
import json
import os
import sqlite3
import sys
import time

STATE_DIR = os.environ.get("STATE_DIR", "/home/openclaw/.openclaw")
VECTOR_TABLE = "memory_index_chunks_vec"
# vec0 shadow tables a KNN query reads; the vector chunks are nearly all of it.
SMALL_TABLES = ("_info", "_chunks", "_rowids")
VECTOR_CHUNKS = "_vector_chunks"
BATCH_ROWS = 32  # vector chunk rows per statement: 32 x 64 x 3072 floats = 24 MB
MIN_AVAILABLE_MB = int(os.environ.get("MIN_AVAILABLE_MB", 4096))
TIME_BUDGET_MS = int(os.environ.get("TIME_BUDGET_MS", 10_000))
MEMINFO = os.environ.get("MEMINFO", "/proc/meminfo")


class OverBudget(Exception):
    def __init__(self, touched):
        self.touched = touched


def mem_available_mb():
    """MemAvailable from /proc/meminfo in MiB, or None where there is no such file."""
    try:
        with open(MEMINFO) as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except OSError:
        return None
    return None


def agent_db(agent):
    return os.path.join(STATE_DIR, "agents", agent, "agent", "openclaw-agent.sqlite")


def connect_read_only(path):
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
    db.execute("PRAGMA query_only = ON")
    return db


def shadow_tables(db):
    names = [r[0] for r in db.execute(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE ? ESCAPE '\\'",
        (VECTOR_TABLE.replace("_", "\\_") + "\\_%",))]
    small = [VECTOR_TABLE + s for s in SMALL_TABLES if VECTOR_TABLE + s in names]
    chunks = sorted(n for n in names if n.startswith(VECTOR_TABLE + VECTOR_CHUNKS))
    return small, chunks


def read_all(db, table):
    """Read every column of every row; returns bytes touched."""
    touched = 0
    for row in db.execute(f'SELECT * FROM "{table}"'):
        for value in row:
            touched += len(value) if isinstance(value, (bytes, str)) else 8
    return touched


def read_vector_chunks(db, table, deadline=None, touched_before=0):
    """Read the vector blobs by rowid in batches: each batch is its own short read transaction.
    Past the deadline, stop between two batches (OverBudget carries the bytes read so far)."""
    touched, last = 0, None
    while True:
        if deadline is not None and time.monotonic() >= deadline:
            raise OverBudget(touched_before + touched)
        if last is None:
            rows = db.execute(f'SELECT rowid, vectors FROM "{table}" ORDER BY rowid LIMIT ?', (BATCH_ROWS,)).fetchall()
        else:
            rows = db.execute(f'SELECT rowid, vectors FROM "{table}" WHERE rowid > ? ORDER BY rowid LIMIT ?', (last, BATCH_ROWS)).fetchall()
        if not rows:
            return touched
        for rowid, vectors in rows:
            touched += len(vectors or b"")
            last = rowid


def warm(agent):
    path = agent_db(agent)
    started = time.monotonic()
    result = {"event": "vector-warm", "agent": agent}
    if not os.path.exists(path):
        return {**result, "skipped": "no agent database"}
    available = mem_available_mb()
    if available is not None and available < MIN_AVAILABLE_MB:
        return {**result, "skipped": "low-memory", "memAvailableMb": available}
    elapsed = lambda: round((time.monotonic() - started) * 1000)
    db = connect_read_only(path)
    try:
        small, chunks = shadow_tables(db)
        if not chunks:
            return {**result, "skipped": "no vector table"}
        touched = sum(read_all(db, t) for t in small)
        deadline = started + TIME_BUDGET_MS / 1000
        for t in chunks:
            touched += read_vector_chunks(db, t, deadline, touched)
    except OverBudget as stop:
        return {**result, "aborted": "time-budget", "ms": elapsed(), "touchedMB": round(stop.touched / 2**20, 1)}
    finally:
        db.close()
    return {**result, "tables": len(small) + len(chunks), "MB": round(touched / 2**20, 1), "ms": elapsed()}


def main(argv):
    status = 0
    for agent in argv or ["makaron"]:
        try:
            print(json.dumps(warm(agent)), flush=True)
        except sqlite3.Error as err:
            # Busy or mid-rebuild: the next timer run tries again; searches are only slower meanwhile.
            print(json.dumps({"event": "vector-warm", "agent": agent, "error": str(err)}), flush=True)
            status = 1
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
