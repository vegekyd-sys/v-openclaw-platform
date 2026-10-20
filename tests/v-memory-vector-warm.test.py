#!/usr/bin/env python3
"""Offline tests for scripts/v-memory-vector-warm.py.

A fake agent DB carries the sqlite-vec shadow tables memory_search reads (as plain
tables, which is what they are on disk). The warmer must read every vector byte, leave
the database byte-identical, and never hold a read snapshot across batches while the
Gateway keeps writing.
"""
import hashlib
import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "scripts", "v-memory-vector-warm.py")
spec = importlib.util.spec_from_file_location("warm", SCRIPT)
warm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(warm)

CHUNK_BYTES = 64 * 16 * 4  # 64 vectors of 16 floats per chunk row


def make_agent_db(state, agent="makaron", chunk_rows=100, vectors=True):
    path = os.path.join(state, "agents", agent, "agent", "openclaw-agent.sqlite")
    os.makedirs(os.path.dirname(path))
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("CREATE TABLE memory_index_chunks (id TEXT PRIMARY KEY, text TEXT)")
    if vectors:
        db.execute('CREATE TABLE "memory_index_chunks_vec_info" (key text primary key, value any)')
        db.execute('CREATE TABLE "memory_index_chunks_vec_chunks"(chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,size INTEGER NOT NULL,validity BLOB NOT NULL,rowids BLOB NOT NULL)')
        db.execute('CREATE TABLE "memory_index_chunks_vec_rowids"(rowid INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,chunk_id INTEGER,chunk_offset INTEGER)')
        db.execute('CREATE TABLE "memory_index_chunks_vec_vector_chunks00"(rowid PRIMARY KEY,vectors BLOB NOT NULL)')
        db.execute("INSERT INTO memory_index_chunks_vec_info VALUES ('CREATE_VERSION', 'v0.1.6')")
        for i in range(1, chunk_rows + 1):
            db.execute("INSERT INTO memory_index_chunks_vec_chunks VALUES (?, 64, ?, ?)", (i, b"\xff" * 8, b"\0" * 512))
            db.execute("INSERT INTO memory_index_chunks_vec_vector_chunks00 VALUES (?, ?)", (i, os.urandom(CHUNK_BYTES)))
            db.execute("INSERT INTO memory_index_chunks_vec_rowids (id, chunk_id, chunk_offset) VALUES (?, ?, 0)", (f"c{i}", i))
    db.commit()
    return path, db  # keep the connection open: on V the Gateway always holds the DB


def digest(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def run(state, *agents):
    env = {**os.environ, "STATE_DIR": state}
    p = subprocess.run([sys.executable, SCRIPT, *agents], env=env, capture_output=True, text=True, timeout=60)
    return p.returncode, [json.loads(line) for line in p.stdout.splitlines() if line.strip()], p.stderr


def test_reads_every_vector_byte_and_changes_nothing():
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state, chunk_rows=100)
        before = digest(path)
        code, out, err = run(state)
        assert code == 0, err
        [r] = out
        assert r["agent"] == "makaron" and r["tables"] == 4, r
        assert r["MB"] >= round(100 * CHUNK_BYTES / 2**20, 1), r
        assert digest(path) == before, "warming must not write the agent DB"
        writer.close()


def test_batches_do_not_pin_a_snapshot():
    # Rows a writer commits between two batches must be visible to later batches:
    # a single long read transaction would hide them (and block WAL checkpoints on V).
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state, chunk_rows=warm.BATCH_ROWS + 1)
        db = warm.connect_read_only(path)
        seen = []
        orig = db.execute

        class Spy:
            def __init__(self, inner):
                self.inner = inner

            def execute(self, sql, params=()):
                cur = orig(sql, params)
                if "vectors" in sql and not seen:
                    seen.append(True)
                    writer.execute("INSERT INTO memory_index_chunks_vec_vector_chunks00 VALUES (?, ?)", (10_000, b"x" * 1000))
                    writer.commit()
                return cur

        touched = warm.read_vector_chunks(Spy(db), "memory_index_chunks_vec_vector_chunks00")
        assert touched == (warm.BATCH_ROWS + 1) * CHUNK_BYTES + 1000, touched
        assert not db.in_transaction
        db.close()
        writer.close()


def test_missing_agent_or_table_is_skipped_not_failed():
    with tempfile.TemporaryDirectory() as state:
        _, writer = make_agent_db(state, agent="plain", vectors=False)
        code, out, err = run(state, "plain", "absent")
        assert code == 0, err
        assert out[0] == {"event": "vector-warm", "agent": "plain", "skipped": "no vector table"}, out
        assert out[1] == {"event": "vector-warm", "agent": "absent", "skipped": "no agent database"}, out
        writer.close()


def test_unreadable_database_reports_and_fails():
    with tempfile.TemporaryDirectory() as state:
        path = os.path.join(state, "agents", "makaron", "agent", "openclaw-agent.sqlite")
        os.makedirs(os.path.dirname(path))
        with open(path, "wb") as f:
            f.write(b"not a database" * 100)
        code, out, _ = run(state)
        assert code == 1 and "error" in out[0], out


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL {name}: {e}")
    sys.exit(1 if failures else 0)
