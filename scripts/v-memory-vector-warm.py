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

  v-memory-vector-warm.py [agent...]     default makaron; one JSON line per agent
  STATE_DIR=<dir>                        default /home/openclaw/.openclaw
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


def read_vector_chunks(db, table):
    """Read the vector blobs by rowid in batches: each batch is its own short read transaction."""
    touched, last = 0, None
    while True:
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
    db = connect_read_only(path)
    try:
        small, chunks = shadow_tables(db)
        if not chunks:
            return {**result, "skipped": "no vector table"}
        touched = sum(read_all(db, t) for t in small)
        touched += sum(read_vector_chunks(db, t) for t in chunks)
    finally:
        db.close()
    return {**result, "tables": len(small) + len(chunks), "MB": round(touched / 2**20, 1),
            "ms": round((time.monotonic() - started) * 1000)}


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
