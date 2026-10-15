"""Shared helpers: throttled IO and a Gateway liveness guard.

The guard pauses work while the Gateway reports clearly more liveness delays
than its background. Background on 2026-10-15 23:24 - 10-16 00:13, before any of
this ran: 27 delays in 50 minutes (about 3 per 5 minutes), overdue mostly
1.2-5 s, worst 9.0 s. Pause above 8 per 5 minutes or any single delay over 15 s.
"""
import re
import subprocess
import sys
import time

LIVENESS_RE = re.compile(r"liveness heartbeat delayed: overdue=(\d+)ms")


def liveness(window="-5min"):
    out = subprocess.run(
        ["journalctl", "-u", "openclaw-gateway", "--since", window, "--no-pager", "-o", "cat"],
        capture_output=True, text=True, timeout=60,
    ).stdout
    overdue = [int(m) for m in LIVENESS_RE.findall(out)]
    return len(overdue), max(overdue or [0])


class Guard:
    """Call tick() often; it blocks while the Gateway looks unhealthy."""

    def __init__(self, max_count=8, max_overdue_ms=15000, every_s=30, give_up_s=1800, log=sys.stderr):
        self.max_count, self.max_overdue_ms = max_count, max_overdue_ms
        self.every_s, self.give_up_s, self.log = every_s, give_up_s, log
        self.next_check = 0
        self.paused_s = 0

    def healthy(self):
        n, worst = liveness()
        return n <= self.max_count and worst <= self.max_overdue_ms, n, worst

    def tick(self):
        if time.monotonic() < self.next_check:
            return
        self.next_check = time.monotonic() + self.every_s
        started = None
        while True:
            ok, n, worst = self.healthy()
            if ok:
                if started is not None:
                    print("guard: resumed after %ds (liveness %d in 5 min, worst %d ms)"
                          % (time.monotonic() - started, n, worst), file=self.log, flush=True)
                return
            if started is None:
                started = time.monotonic()
                print("guard: paused (liveness %d in 5 min, worst %d ms)" % (n, worst),
                      file=self.log, flush=True)
            if time.monotonic() - started > self.give_up_s:
                print("guard: Gateway still unhealthy after %ds; stopping" % self.give_up_s,
                      file=self.log, flush=True)
                sys.exit(3)
            time.sleep(60)


class Throttle:
    """Token bucket in bytes per second."""

    def __init__(self, rate_bps):
        self.rate = rate_bps
        self.t0 = time.monotonic()
        self.sent = 0

    def take(self, n):
        self.sent += n
        ahead = self.sent / self.rate - (time.monotonic() - self.t0)
        if ahead > 0:
            time.sleep(ahead)
