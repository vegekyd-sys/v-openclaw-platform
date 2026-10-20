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


def meminfo(state, available_kb):
    path = os.path.join(state, f"meminfo-{available_kb}")
    with open(path, "w") as f:
        f.write(f"MemTotal:       31457280 kB\nMemFree:         1048576 kB\nMemAvailable:   {available_kb} kB\n")
    return path


def pressure(state, full_avg10):
    path = os.path.join(state, f"io-{full_avg10}")
    with open(path, "w") as f:
        f.write(f"some avg10={full_avg10 + 1:.2f} avg60=1.00 avg300=1.00 total=1\nfull avg10={full_avg10:.2f} avg60=1.00 avg300=1.00 total=1\n")
    return path


class Rounds:
    """Run warm.warm() in-process on a fake clock that advances 1 s per reading: with a
    2.5 s budget each round reads exactly two batches, then stops."""

    def __init__(self, state, budget_ms=2500):
        self.saved = {k: getattr(warm, k) for k in ("STATE_DIR", "WARM_STATE_DIR", "MEMINFO", "IO_PRESSURE", "TIME_BUDGET_MS")}
        warm.STATE_DIR, warm.WARM_STATE_DIR = state, os.path.join(state, "warm")
        warm.MEMINFO, warm.IO_PRESSURE = meminfo(state, 16 * 2**20), pressure(state, 0.0)
        warm.TIME_BUDGET_MS = budget_ms
        self.tick, self.real = 0.0, warm.time.monotonic
        warm.time.monotonic = self.clock

    def clock(self):
        self.tick += 1
        return self.tick

    def run(self, now):
        return warm.warm("makaron", now=now)

    def close(self):
        warm.time.monotonic = self.real
        for k, v in self.saved.items():
            setattr(warm, k, v)


def run(state, *agents, **extra):
    # A roomy fake /proc/meminfo unless a test sets its own: the CI host's memory is not the point.
    env = {**os.environ, "STATE_DIR": state, "MEMINFO": meminfo(state, 16 * 2**20),
           "IO_PRESSURE": pressure(state, 0.0), "WARM_STATE_DIR": os.path.join(state, "warm"), **extra}
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


def test_low_memory_skips_the_round_without_opening_the_db():
    # 2026-10-19 21:10 V had 3.7 GB available and the Gateway stalled: do not add 743 MB of reads then.
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state)
        writer.close()
        os.chmod(path, 0)  # opening it would fail: the brake must come first
        try:
            code, out, err = run(state, MEMINFO=meminfo(state, 3_800_000))
        finally:
            os.chmod(path, 0o600)
        assert code == 0, err
        assert out == [{"event": "vector-warm", "agent": "makaron", "skipped": "low-memory", "memAvailableMb": 3710}], out


def test_enough_memory_warms():
    with tempfile.TemporaryDirectory() as state:
        _, writer = make_agent_db(state)
        code, out, err = run(state, MEMINFO=meminfo(state, 4 * 2**20 + 1024))
        assert code == 0 and "MB" in out[0] and "skipped" not in out[0], (out, err)
        writer.close()


def test_time_budget_stops_between_batches_and_says_so():
    # A cold pass is ~23 s of random reads on V; past the budget it stops and reports
    # "aborted" (not a plain slow pass), and the next round starts over.
    with tempfile.TemporaryDirectory() as state:
        _, writer = make_agent_db(state, chunk_rows=warm.BATCH_ROWS * 3)
        code, out, err = run(state, TIME_BUDGET_MS="0")
        assert code == 0, err
        [r] = out
        assert r["aborted"] == "time-budget" and "MB" not in r, r
        assert isinstance(r["ms"], int) and r["touchedMB"] < round(warm.BATCH_ROWS * 3 * CHUNK_BYTES / 2**20, 1), r
        writer.close()


def test_time_budget_counts_bytes_already_read():
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state, chunk_rows=warm.BATCH_ROWS * 2)
        db = warm.connect_read_only(path)
        clock = iter([0.0, 99.0])  # first batch in budget, second check past it
        real = warm.time.monotonic
        warm.time.monotonic = lambda: next(clock)
        try:
            warm.read_vector_chunks(db, "memory_index_chunks_vec_vector_chunks00", deadline=1.0, touched_before=7)
            raise AssertionError("expected OverBudget")
        except warm.OverBudget as stop:
            assert stop.touched == 7 + warm.BATCH_ROWS * CHUNK_BYTES, stop.touched
        finally:
            warm.time.monotonic = real
            db.close()
            writer.close()


def test_io_pressure_skips_the_round():
    with tempfile.TemporaryDirectory() as state:
        _, writer = make_agent_db(state)
        code, out, err = run(state, IO_PRESSURE=pressure(state, 9.4))
        assert code == 0, err
        assert out == [{"event": "vector-warm", "agent": "makaron", "skipped": "io-pressure", "ioFullAvg10": 9.4}], out
        code, out, err = run(state, IO_PRESSURE=pressure(state, 4.9))
        assert code == 0 and "MB" in out[0], (out, err)
        writer.close()


def test_cold_table_is_read_across_rounds_from_the_resume_point():
    # 2026-10-20 16:11: every pass restarted at rowid 1, used its 10 s on the first ~400 MB
    # and never reached the end. Each round must continue where the last one stopped.
    with tempfile.TemporaryDirectory() as state:
        _, writer = make_agent_db(state, chunk_rows=warm.BATCH_ROWS * 5)
        r = Rounds(state)
        try:
            a = r.run(now=1000)
            assert a["aborted"] == "time-budget" and a["resumeAfterRowid"] == 2 * warm.BATCH_ROWS, a
            b = r.run(now=1060)
            assert b["resumeAfterRowid"] == 4 * warm.BATCH_ROWS, b
            c = r.run(now=1120)
            assert c.get("resumed") is True and "aborted" not in c, c
        finally:
            r.close()
            writer.close()


def test_backs_off_when_what_it_read_does_not_stay_cached():
    # A pass from the start that runs out of time right after a completed cycle means the
    # pages were evicted meanwhile (16:19: 27 % of the table left right after a pass).
    with tempfile.TemporaryDirectory() as state:
        _, writer = make_agent_db(state, chunk_rows=warm.BATCH_ROWS * 3)
        r = Rounds(state)
        try:
            assert "resumeAfterRowid" in r.run(now=0)
            assert r.run(now=60).get("resumed") is True
            d = r.run(now=120)
            assert d["aborted"] == "time-budget" and d["backoffMin"] == 5 and "resumeAfterRowid" not in d, d
            e = r.run(now=120 + 4 * 60)
            assert e == {"event": "vector-warm", "agent": "makaron", "skipped": "backoff", "backoffMin": 5, "untilEpoch": 420}, e
            # After the pause it tries a whole cycle again; failing again doubles the pause.
            assert "resumeAfterRowid" in r.run(now=421)
            assert r.run(now=481).get("resumed") is True
            assert r.run(now=541)["backoffMin"] == 10
        finally:
            r.close()
            writer.close()


def test_a_pass_that_finishes_from_the_start_clears_resume_and_backoff():
    with tempfile.TemporaryDirectory() as state:
        _, writer = make_agent_db(state, chunk_rows=warm.BATCH_ROWS * 3)
        r = Rounds(state)
        try:
            r.run(now=0); r.run(now=60); r.run(now=120)  # resume, cycle, backoff 5
            warm.TIME_BUDGET_MS = 10**9
            f = r.run(now=10_000)
            assert "MB" in f and "resumed" not in f and "aborted" not in f, f
            assert warm.load_state("makaron") == {}, warm.load_state("makaron")
        finally:
            r.close()
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
