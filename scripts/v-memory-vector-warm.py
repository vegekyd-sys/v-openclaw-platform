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

Brakes, so it never makes a bad moment worse:
- MemAvailable below 4 GiB: skip the round. On 2026-10-19 21:10 V was down to 3.7 GB
  and the Gateway stalled 30 s; re-reading 743 MB then only fights reclaim for memory and IO.
- IO pressure (/proc/pressure/io full avg10 above 5 %): skip the round.
- 10 s spent in one pass: stop between two batches and remember the last rowid; the next
  round resumes there. A cold pass is ~23 s of random reads, so cold it takes 2-3 rounds.
- Cannot stay cached: when a pass from the start runs out of time right after a completed
  cycle, the pages were evicted while it went round (2026-10-20 16:19: page cache down to
  4 GB, 27 % of the table left right after a pass). Back off 5, 10, 20, 40, 60 minutes
  instead of re-reading 400 MB of cold data every minute; a pass that finishes from the
  start in time resets it.

  v-memory-vector-warm.py [agent...]     default makaron; one JSON line per agent:
    {"MB", "ms"[, "resumed": true]}                    a pass reached the end of the table
    {"skipped": "low-memory", "memAvailableMb"}        memory brake
    {"skipped": "io-pressure", "ioFullAvg10"}          IO brake
    {"skipped": "backoff", "backoffMin", "untilEpoch"} still backing off
    {"aborted": "time-budget", "ms", "touchedMB", "resumeAfterRowid"}   time brake, resumes
    {"aborted": "time-budget", "ms", "touchedMB", "backoffMin"}         cannot stay cached
  STATE_DIR=<dir>                        default /home/openclaw/.openclaw
  WARM_STATE_DIR=<dir>                   resume point and backoff, default /var/lib/v-memory-vector-warm
  MIN_AVAILABLE_MB, MAX_IO_FULL_AVG10, TIME_BUDGET_MS, MEMINFO, IO_PRESSURE   overrides (tests)
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
MAX_IO_FULL_AVG10 = float(os.environ.get("MAX_IO_FULL_AVG10", 5.0))
IO_PRESSURE = os.environ.get("IO_PRESSURE", "/proc/pressure/io")
WARM_STATE_DIR = os.environ.get("WARM_STATE_DIR", "/var/lib/v-memory-vector-warm")
BACKOFF_MIN, BACKOFF_MAX_MIN = 5, 60


class OverBudget(Exception):
    def __init__(self, touched, table=None, last=None):
        self.touched, self.table, self.last = touched, table, last


def io_full_avg10():
    """'full avg10' from /proc/pressure/io in percent, or None where PSI is unavailable."""
    try:
        with open(IO_PRESSURE) as f:
            for line in f:
                if line.startswith("full "):
                    return float(dict(kv.split("=") for kv in line.split()[1:])["avg10"])
    except (OSError, KeyError, ValueError):
        return None
    return None


def state_path(agent):
    return os.path.join(WARM_STATE_DIR, f"{agent}.json")


def load_state(agent):
    try:
        with open(state_path(agent)) as f:
            state = json.load(f)
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError):
        return {}


def save_state(agent, state):
    """Best effort: without a writable state dir every round starts at the beginning."""
    try:
        os.makedirs(WARM_STATE_DIR, exist_ok=True)
        tmp = state_path(agent) + ".tmp"
        with open(tmp, "w") as f:
            json.dump(state, f)
        os.replace(tmp, state_path(agent))
    except OSError:
        pass


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


def read_vector_chunks(db, table, deadline=None, touched_before=0, after=None):
    """Read the vector blobs by rowid in batches (after `after` when resuming): each batch is
    its own short read transaction. Past the deadline, stop between two batches; OverBudget
    carries the bytes read so far and the last rowid read."""
    touched, last = 0, after
    while True:
        if deadline is not None and time.monotonic() >= deadline:
            raise OverBudget(touched_before + touched, table, last)
        if last is None:
            rows = db.execute(f'SELECT rowid, vectors FROM "{table}" ORDER BY rowid LIMIT ?', (BATCH_ROWS,)).fetchall()
        else:
            rows = db.execute(f'SELECT rowid, vectors FROM "{table}" WHERE rowid > ? ORDER BY rowid LIMIT ?', (last, BATCH_ROWS)).fetchall()
        if not rows:
            return touched
        for rowid, vectors in rows:
            touched += len(vectors or b"")
            last = rowid


def warm(agent, now=None):
    path = agent_db(agent)
    started = time.monotonic()
    now = time.time() if now is None else now
    result = {"event": "vector-warm", "agent": agent}
    if not os.path.exists(path):
        return {**result, "skipped": "no agent database"}
    state = load_state(agent)
    if state.get("backoffUntil", 0) > now:
        return {**result, "skipped": "backoff", "backoffMin": state.get("backoffMin"), "untilEpoch": round(state["backoffUntil"])}
    available = mem_available_mb()
    if available is not None and available < MIN_AVAILABLE_MB:
        return {**result, "skipped": "low-memory", "memAvailableMb": available}
    pressure = io_full_avg10()
    if pressure is not None and pressure > MAX_IO_FULL_AVG10:
        return {**result, "skipped": "io-pressure", "ioFullAvg10": pressure}
    elapsed = lambda: round((time.monotonic() - started) * 1000)
    resume = state.get("resume") or {}
    db = connect_read_only(path)
    try:
        small, chunks = shadow_tables(db)
        if not chunks:
            return {**result, "skipped": "no vector table"}
        touched = sum(read_all(db, t) for t in small)
        deadline = started + TIME_BUDGET_MS / 1000
        todo = [t for t in chunks if t >= resume.get("table", "")] if resume.get("table") in chunks else chunks
        for t in todo:
            after = resume.get("after") if t == resume.get("table") else None
            touched += read_vector_chunks(db, t, deadline, touched, after)
    except OverBudget as stop:
        out = {**result, "aborted": "time-budget", "ms": elapsed(), "touchedMB": round(stop.touched / 2**20, 1)}
        if not resume and state.get("cycleDone"):
            # From the start, right after a completed cycle, and out of time again: what the
            # last cycle read did not stay cached. Re-reading every minute only adds cold IO.
            minutes = min(BACKOFF_MAX_MIN, max(BACKOFF_MIN, 2 * state.get("backoffMin", 0)))
            save_state(agent, {"backoffMin": minutes, "backoffUntil": now + minutes * 60})
            return {**out, "backoffMin": minutes}
        save_state(agent, {**{k: state[k] for k in ("backoffMin",) if k in state},
                           "resume": {"table": stop.table, "after": stop.last}})
        return {**out, "resumeAfterRowid": stop.last}
    finally:
        db.close()
    out = {**result, "tables": len(small) + len(chunks), "MB": round(touched / 2**20, 1), "ms": elapsed()}
    if resume:
        # End reached by resuming: the next pass starts over and shows whether it all stayed.
        save_state(agent, {**{k: state[k] for k in ("backoffMin",) if k in state}, "cycleDone": True})
        return {**out, "resumed": True}
    save_state(agent, {})
    return out


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
