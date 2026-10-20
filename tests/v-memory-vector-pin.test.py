#!/usr/bin/env python3
"""Offline tests for scripts/v-memory-vector-pin.py.

A fake agent DB carries the sqlite-vec shadow tables (plain tables on disk) next to other
data. A fake libc records what would be mapped and locked; one test uses the real libc
on a small DB where mlock is allowed.
"""
import importlib.util
import io
import json
import os
import sqlite3
import sys
import tempfile
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("pin", os.path.join(HERE, "..", "scripts", "v-memory-vector-pin.py"))
pin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pin)


def make_agent_db(state, chunk_rows=40):
    path = os.path.join(state, "agents", "makaron", "agent", "openclaw-agent.sqlite")
    os.makedirs(os.path.dirname(path))
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("CREATE TABLE memory_index_chunks (id TEXT PRIMARY KEY, text TEXT)")
    db.execute('CREATE TABLE "memory_index_chunks_vec_info" (key text primary key, value any)')
    db.execute('CREATE TABLE "memory_index_chunks_vec_rowids"(rowid INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,chunk_id INTEGER,chunk_offset INTEGER)')
    db.execute('CREATE TABLE "memory_index_chunks_vec_vector_chunks00"(rowid PRIMARY KEY,vectors BLOB NOT NULL)')
    for i in range(1, chunk_rows + 1):
        # interleave other data so the vector pages are scattered, as on V
        db.execute("INSERT INTO memory_index_chunks VALUES (?, ?)", (f"c{i}", "x" * 3000))
        db.execute("INSERT INTO memory_index_chunks_vec_vector_chunks00 VALUES (?, ?)", (i, os.urandom(10_000)))
        db.execute("INSERT INTO memory_index_chunks_vec_rowids (id, chunk_id, chunk_offset) VALUES (?, ?, 0)", (f"c{i}", i))
    db.commit()
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    return path, db


def expected_pages(path):
    db = sqlite3.connect(path)
    names = [r[0] for r in db.execute("SELECT name FROM sqlite_schema WHERE name LIKE 'memory_index_chunks_vec_%' AND type='table'")]
    pages = sorted({r[0] for n in names for r in db.execute("SELECT pageno FROM dbstat WHERE name=?", (n,))})
    other = sorted({r[0] for r in db.execute("SELECT pageno FROM dbstat WHERE name='memory_index_chunks'")})
    psz = db.execute("PRAGMA page_size").fetchone()[0]
    db.close()
    return psz, pages, other


class FakeLibc:
    def __init__(self, resident_all=False, lock_ok=True):
        self.calls, self.next_addr, self.resident_all, self.lock_ok = [], 1 << 40, resident_all, lock_ok

    def map_read_only(self, fd, size):
        addr = self.next_addr
        self.next_addr += 1 << 36
        self.calls.append(("map", addr, size))
        return addr

    def unmap(self, addr, size):
        self.calls.append(("unmap", addr, size))

    def lock(self, addr, length):
        self.calls.append(("lock", addr, length))
        return self.lock_ok

    def resident(self, addr, size):
        n = (size + 4095) // 4096
        return (b"\x01" if self.resident_all else b"\x00") * n


def quiet(fn, *a):
    out = io.StringIO()
    with redirect_stdout(out):
        r = fn(*a)
    return r, [json.loads(l) for l in out.getvalue().splitlines() if l.strip()]


def meminfo(state, available_mb):
    path = os.path.join(state, f"meminfo-{available_mb}")
    with open(path, "w") as f:
        f.write(f"MemTotal: 31457280 kB\nMemAvailable: {available_mb * 1024} kB\n")
    return path


def test_page_runs():
    assert pin.page_runs([]) == []
    assert pin.page_runs([3, 4, 5, 9, 11, 12]) == [[3, 5], [9, 9], [11, 12]]


def test_locks_exactly_the_vector_pages():
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state)
        psz, pages, other = expected_pages(path)
        libc = FakeLibc()
        p = pin.Pinner(path, libc)
        _, out = quiet(p.pin)
        [(_, base, size)] = [c for c in libc.calls if c[0] == "map"]
        locked = set()
        for _, addr, length in (c for c in libc.calls if c[0] == "lock"):
            first = (addr - base) // psz + 1
            locked.update(range(first, first + length // psz))
        assert locked == set(pages), (sorted(locked)[:5], pages[:5])
        assert not locked & set(other), "must not lock the rest of the agent DB"
        assert out[0]["event"] == "vector-pin" and out[0]["pages"] == len(pages) and out[0]["failedMB"] == 0, out
        assert out[0]["cachedPct"] == 0.0, out
        writer.close()


def test_refresh_locks_the_new_mapping_before_dropping_the_old():
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state)
        libc = FakeLibc(resident_all=True)
        p = pin.Pinner(path, libc)
        quiet(p.pin)
        first = p.mapping
        writer.execute("INSERT INTO memory_index_chunks_vec_vector_chunks00 VALUES (999, ?)", (os.urandom(50_000),))
        writer.commit()
        # Pages still only in the WAL lie past the main file's end: neither locked nor cached.
        writer.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        _, out = quiet(p.pin)
        kinds = [c[0] for c in libc.calls]
        second_map = kinds.index("map", 1)
        old_unmap = kinds.index("unmap")
        assert second_map < old_unmap and all(k == "lock" for k in kinds[second_map + 1:old_unmap]), kinds
        assert libc.calls[old_unmap][1:] == first and p.mapping != first
        assert out[0]["cachedPct"] == 100.0, out
        writer.close()


def test_low_memory_releases_and_resumes_only_with_headroom():
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state)
        p = pin.Pinner(path, FakeLibc())
        quiet(p.pin)
        assert p.mapping
        pin.MEMINFO = meminfo(state, 1900)
        ok, out = quiet(p.check_memory)
        assert ok is False and p.mapping is None
        assert out == [{"event": "vector-release", "reason": "low-memory", "memAvailableMb": 1900}], out
        pin.MEMINFO = meminfo(state, 2500)  # above the floor but below the resume mark
        ok, out = quiet(p.check_memory)
        assert ok is False and out == [], out
        pin.MEMINFO = meminfo(state, 3200)
        ok, _ = quiet(p.check_memory)
        assert ok is True
        writer.close()


def test_run_once_does_not_pin_under_low_memory():
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state)
        pin.STATE_DIR, pin.MEMINFO = state, meminfo(state, 1000)
        orig = pin.Libc
        pin.Libc = FakeLibc
        try:
            p, out = quiet(pin.run, "makaron", True)
        finally:
            pin.Libc = orig
        assert p.mapping is None and [o["event"] for o in out] == ["vector-release"], out
        writer.close()


def test_too_large_is_not_locked():
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state)
        libc = FakeLibc()
        saved = pin.MAX_PIN_MB
        pin.MAX_PIN_MB = 0
        try:
            _, out = quiet(pin.Pinner(path, libc).pin)
        finally:
            pin.MAX_PIN_MB = saved
        assert out[0]["event"] == "vector-pin-skipped" and out[0]["reason"] == "too-large", out
        assert not [c for c in libc.calls if c[0] in ("map", "lock")]
        writer.close()


def test_pages_past_the_end_of_a_shrunk_file_are_not_locked():
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state)
        psz, pages, _ = expected_pages(path)
        size = os.path.getsize(path)
        libc = FakeLibc()
        real = pin.vector_pages
        pin.vector_pages = lambda _p: (psz, pages + [size // psz + 10])
        try:
            _, out = quiet(pin.Pinner(path, libc).pin)
        finally:
            pin.vector_pages = real
        [(_, base, _)] = [c for c in libc.calls if c[0] == "map"]
        assert all(addr - base + length <= size for _, addr, length in (c for c in libc.calls if c[0] == "lock"))
        writer.close()


def test_missing_db_or_table_is_skipped():
    with tempfile.TemporaryDirectory() as state:
        _, out = quiet(pin.Pinner(os.path.join(state, "absent.sqlite"), FakeLibc()).pin)
        assert out[0] == {"event": "vector-pin-skipped", "reason": "no agent database"}, out
        path = os.path.join(state, "plain.sqlite")
        sqlite3.connect(path).execute("CREATE TABLE t (x)").connection.commit()
        _, out = quiet(pin.Pinner(path, FakeLibc()).pin)
        assert out[0] == {"event": "vector-pin-skipped", "reason": "no vector table"}, out


def test_real_mlock_keeps_the_vector_pages_resident():
    with tempfile.TemporaryDirectory() as state:
        path, writer = make_agent_db(state)
        psz, pages, _ = expected_pages(path)
        try:
            libc = pin.Libc()
        except OSError:
            print("skip: no C library")
            return
        p = pin.Pinner(path, libc)
        _, out = quiet(p.pin)
        if out[0].get("failedMB"):
            print("skip: mlock not permitted here", out)
            p.release()
            return
        addr, size = p.mapping
        resident = libc.resident(addr, size)
        import mmap
        assert all(resident[((pg - 1) * psz) // mmap.PAGESIZE] & 1 for pg in pages)
        p.release()
        assert p.mapping is None
        writer.close()


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            saved = (pin.MEMINFO, pin.STATE_DIR)
            try:
                fn()
                print(f"ok {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL {name}: {e}")
            finally:
                pin.MEMINFO, pin.STATE_DIR = saved
    sys.exit(1 if failures else 0)
