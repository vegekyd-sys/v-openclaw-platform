#!/usr/bin/env python3
"""Pin V's memory_search vector pages in RAM (mlock), outside the Gateway.

memory_search brute-forces the sqlite-vec table (memory_index_chunks_vec_*, ~760 MB on
V's makaron agent, 2026-10-20) and the table is scattered across the 20 GB agent DB
(56k runs). When the page cache is tight the table is evicted between searches and a
cold scan takes 27-45 s: past the tool's 25 s deadline. Re-reading it on a timer did not
help: with 4 GB of page cache the pages were gone again within the same pass. Locking
them does: on 2026-10-20 19:29 a first version of this brought searches back to 1.7 s.

The DB file is mapped PROT_READ/MAP_SHARED and only the vector tables' page ranges are
mlock'ed, so their page-cache pages cannot be reclaimed. Nothing is written; SQLite
writing those pages updates the same cached pages. The page list comes from dbstat
through a read-only connection and is refreshed every few minutes (the indexer moves
and adds pages): a new mapping is locked first, then the old one is unmapped, so there
is no gap. Exiting releases everything.

Brakes:
- MemAvailable below 2 GiB: release everything (the locked pages cannot be reclaimed,
  and on 2026-10-19 21:10 the Gateway stalled at 3.7 GB). Pin again only once it is back
  above 3 GiB. memory_search then falls back to keyword results after its 8 s vector
  budget (#444) instead of failing.
- The tables grew past 1.5 GB: do not lock (log "too-large"), so a growing index cannot
  quietly take more and more RAM.

One JSON line per event (journald):
  {"event":"vector-pin","pages","runs","lockedMB","failedMB","cachedPct","ms","memAvailableMb"}
      cachedPct: share of the vector pages that were already cached before this round,
      i.e. what a search would have found (100 once pinned, lower right after an
      indexer write moved pages, low after a release).
  {"event":"vector-release","reason":"low-memory","memAvailableMb"}
  {"event":"vector-pin-skipped","reason":"too-large"|"no vector table"|"no agent database"|error}

  v-memory-vector-pin.py [agent]          default makaron; runs until stopped
  v-memory-vector-pin.py --once [agent]   one round, then release and exit (tests, checks)
  STATE_DIR, REFRESH_SECONDS (300), CHECK_SECONDS (30), MIN_AVAILABLE_MB (2048),
  RESUME_AVAILABLE_MB (3072), MAX_PIN_MB (1536), MEMINFO
"""
import ctypes
import ctypes.util
import json
import mmap
import os
import sqlite3
import sys
import time

STATE_DIR = os.environ.get("STATE_DIR", "/home/openclaw/.openclaw")
REFRESH_SECONDS = float(os.environ.get("REFRESH_SECONDS", 300))
CHECK_SECONDS = float(os.environ.get("CHECK_SECONDS", 30))
MIN_AVAILABLE_MB = int(os.environ.get("MIN_AVAILABLE_MB", 2048))
RESUME_AVAILABLE_MB = int(os.environ.get("RESUME_AVAILABLE_MB", 3072))
MAX_PIN_MB = int(os.environ.get("MAX_PIN_MB", 1536))
MEMINFO = os.environ.get("MEMINFO", "/proc/meminfo")
VECTOR_TABLE_PATTERN = "memory\\_index\\_chunks\\_vec\\_%"


def log(event, **fields):
    print(json.dumps({"event": event, **fields}), flush=True)


def agent_db(agent):
    return os.path.join(STATE_DIR, "agents", agent, "agent", "openclaw-agent.sqlite")


def mem_available_mb():
    try:
        with open(MEMINFO) as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except OSError:
        return None
    return None


def vector_pages(path):
    """(page size, sorted page numbers of the sqlite-vec shadow tables) via dbstat, read-only."""
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
    try:
        page_size = db.execute("PRAGMA page_size").fetchone()[0]
        names = [r[0] for r in db.execute(
            "SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE ? ESCAPE '\\'", (VECTOR_TABLE_PATTERN,))]
        pages = set()
        for name in names:
            pages.update(r[0] for r in db.execute("SELECT pageno FROM dbstat WHERE name = ?", (name,)))
        return page_size, sorted(pages)
    finally:
        db.close()


def page_runs(pages):
    """Contiguous [first, last] runs of sorted page numbers."""
    runs = []
    for p in pages:
        if runs and p == runs[-1][1] + 1:
            runs[-1][1] = p
        else:
            runs.append([p, p])
    return runs


class Libc:
    """The four calls this needs, from the C library."""

    def __init__(self):
        lib = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
        lib.mmap.restype = ctypes.c_void_p
        lib.mmap.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_long]
        lib.munmap.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
        lib.mlock.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
        lib.mincore.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_char_p]
        self.lib = lib

    def map_read_only(self, fd, size):
        addr = self.lib.mmap(None, size, mmap.PROT_READ, mmap.MAP_SHARED, fd, 0)
        if addr in (None, ctypes.c_void_p(-1).value):
            raise OSError(ctypes.get_errno(), "mmap failed")
        return addr

    def unmap(self, addr, size):
        self.lib.munmap(ctypes.c_void_p(addr), size)

    def lock(self, addr, length):
        return self.lib.mlock(ctypes.c_void_p(addr), length) == 0

    def resident(self, addr, size):
        vec = ctypes.create_string_buffer((size + mmap.PAGESIZE - 1) // mmap.PAGESIZE)
        if self.lib.mincore(ctypes.c_void_p(addr), size, vec) != 0:
            raise OSError(ctypes.get_errno(), "mincore failed")
        return vec.raw


class Pinner:
    def __init__(self, path, libc=None, clock=time.monotonic):
        self.path, self.libc, self.clock = path, libc or Libc(), clock
        self.mapping = None  # (addr, size) holding the current locks
        self.released_for_memory = False

    def release(self):
        if self.mapping:
            self.libc.unmap(*self.mapping)
            self.mapping = None

    def pin(self):
        """One round: re-read the page list, lock it in a fresh mapping, drop the old one."""
        started = self.clock()
        if not os.path.exists(self.path):
            self.release()
            return log("vector-pin-skipped", reason="no agent database")
        page_size, pages = vector_pages(self.path)
        if not pages:
            self.release()
            return log("vector-pin-skipped", reason="no vector table")
        total_mb = round(len(pages) * page_size / 2**20, 1)
        if total_mb > MAX_PIN_MB:
            self.release()
            return log("vector-pin-skipped", reason="too-large", MB=total_mb, maxMB=MAX_PIN_MB)
        fd = os.open(self.path, os.O_RDONLY)
        try:
            size = os.fstat(fd).st_size
            addr = self.libc.map_read_only(fd, size)
        finally:
            os.close(fd)
        runs = page_runs(pages)
        resident = self.libc.resident(addr, size)
        cached = sum(1 for p in pages if ((p - 1) * page_size) // mmap.PAGESIZE < len(resident)
                     and resident[((p - 1) * page_size) // mmap.PAGESIZE] & 1)
        locked = failed = 0
        for first, last in runs:
            offset, length = (first - 1) * page_size, (last - first + 1) * page_size
            if offset + length > size:  # the file shrank since dbstat: nothing to lock there
                continue
            if self.libc.lock(addr + offset, length):
                locked += length
            else:
                failed += length
        self.release()  # the new mapping holds the locks now; dropping the old one leaves no gap
        self.mapping = (addr, size)
        return log("vector-pin", pages=len(pages), runs=len(runs), lockedMB=round(locked / 2**20, 1),
                   failedMB=round(failed / 2**20, 1), cachedPct=round(100 * cached / len(pages), 1),
                   ms=round((self.clock() - started) * 1000), memAvailableMb=mem_available_mb())

    def check_memory(self):
        """Release under memory pressure; True when pinning is allowed."""
        available = mem_available_mb()
        if available is None:
            return True
        if available < MIN_AVAILABLE_MB:
            if self.mapping or not self.released_for_memory:
                self.release()
                log("vector-release", reason="low-memory", memAvailableMb=available)
            self.released_for_memory = True
            return False
        if self.released_for_memory and available < RESUME_AVAILABLE_MB:
            return False
        self.released_for_memory = False
        return True


def run(agent, once=False, sleep=time.sleep):
    pinner = Pinner(agent_db(agent))
    next_pin = 0.0
    try:
        while True:
            now = time.monotonic()
            if pinner.check_memory() and (pinner.mapping is None or now >= next_pin):
                try:
                    pinner.pin()
                except (sqlite3.Error, OSError) as err:
                    log("vector-pin-skipped", reason=str(err))
                next_pin = now + REFRESH_SECONDS
            if once:
                return pinner
            sleep(CHECK_SECONDS)
    finally:
        if not once:
            pinner.release()


if __name__ == "__main__":
    args = sys.argv[1:]
    once = "--once" in args
    args = [a for a in args if a != "--once"]
    p = run(args[0] if args else "makaron", once=once)
    if once and p:
        p.release()
