#!/usr/bin/env python3
"""Keep the shell commands V's agents run in their own cgroup next to the Gateway's.

Why (docs/incidents/2026-11-09-recursive-scan.md): an agent's `grep -r` over ~/.openclaw ran in
the Gateway's own cgroup. It read tens of GB, its page cache pushed the Gateway's database pages
out, and the Gateway froze (89 s, 52 s). Nothing is wrong with an agent searching; it should only
slow itself down.

How: the Gateway unit is already delegated (94-verifier-resource-group: Delegate=memory,
DelegateSubgroup=foreground), and the Gateway already moves its database verifier into a sibling
cgroup the same way. This sidecar runs as the service user and, about once a second, moves into a
sibling `agent-shell` cgroup:

  * every shell OpenClaw exec starts (the Gateway or a Worker runs `/bin/bash --noprofile --norc -c`
    for each exec call), with its descendants;
  * every OpenClaw service relay (core/dist/process/supervisor/service-child-relay.js) with its
    descendants: long-running services agents start (watchers, bridges) run under one;
  * every process the Codex app-server starts, with its descendants, except Codex's own hook relay
    (`openclaw hooks relay`), which must answer within Codex's 10 s hook budget.

The Gateway, its Workers, the Codex app-server itself and Chrome stay where they are. A process
started inside agent-shell stays there (children inherit their cgroup).

Limits on agent-shell:
  memory.high  (default 12G): page cache the agent's commands pull in is charged to agent-shell and
               reclaimed there first, so a whole-disk scan cannot push the Gateway's pages out.
               Above it the kernel throttles the group instead of killing it.
  io.max       (when the unit also delegates the io controller): read/write bandwidth per disk, so
               a scan cannot saturate the disks the Gateway writes to.

Nothing is refused and nothing is killed; commands that stay under the limits run as before.

Usage (systemd: systemd/v-agent-shell-cgroup.service):
  v-agent-shell-cgroup.py --service-cgroup /sys/fs/cgroup/system.slice/openclaw-gateway.service
  ... --once            one pass, then exit
  ... --dry-run         report what it would move and set, change nothing
Logs one JSON line per move or limit change to stdout (the journal).
"""

from __future__ import annotations

import argparse
import errno
import json
import os
import signal
import sys
import time

RELAY_MARK = "/process/supervisor/service-child-relay.js"
DEFAULT_GROUP = "agent-shell"
DEFAULT_SOURCE = "foreground"


def parse_size(text: str | None) -> int | None:
    if text is None or text == "" or text == "max":
        return None
    units = {"k": 1024, "m": 1024**2, "g": 1024**3, "t": 1024**4}
    t = text.strip().lower().rstrip("b").rstrip("i")
    if t and t[-1] in units:
        return int(float(t[:-1]) * units[t[-1]])
    return int(t)


def log(event: str, **fields) -> None:
    sys.stdout.write(json.dumps({"event": f"agent-shell-cgroup.{event}", **fields}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


class Proc:
    """Reads /proc. A separate class so the tests can hand in a fake tree."""

    def __init__(self, root: str = "/proc"):
        self.root = root

    def ppid(self, pid: int) -> int | None:
        try:
            with open(f"{self.root}/{pid}/stat", "rb") as fh:
                data = fh.read().decode("utf-8", "replace")
        except OSError:
            return None
        # comm may contain spaces and parentheses: fields after the last ')' are fixed.
        rest = data[data.rfind(")") + 2 :].split()
        try:
            return int(rest[1])
        except (IndexError, ValueError):
            return None

    def argv(self, pid: int) -> list[str]:
        try:
            with open(f"{self.root}/{pid}/cmdline", "rb") as fh:
                raw = fh.read()
        except OSError:
            return []
        return [part.decode("utf-8", "replace") for part in raw.split(b"\0") if part]


def is_relay(argv: list[str]) -> bool:
    return any(RELAY_MARK in arg for arg in argv[:3])


def is_codex_app_server(argv: list[str]) -> bool:
    return bool(argv) and os.path.basename(argv[0]) == "codex" and "app-server" in argv


SHELLS = {"bash", "sh", "zsh", "dash"}


def is_openclaw_exec_shell(argv: list[str], parent_argv: list[str]) -> bool:
    # OpenClaw exec (Gateway-hosted or in a Worker) runs each command as
    # `/bin/bash --noprofile --norc -c <script>`, a direct child of a node process.
    return (bool(argv) and os.path.basename(argv[0]) in SHELLS and "--noprofile" in argv and "--norc" in argv
            and "-c" in argv and bool(parent_argv) and os.path.basename(parent_argv[0]).startswith("node"))


def is_codex_hook_relay(argv: list[str]) -> bool:
    # Codex runs `<node> <openclaw entry> hooks relay ...` for every hooked tool call.
    return "hooks" in argv and "relay" in argv


def plan_moves(pids: list[int], proc: Proc) -> list[tuple[int, str, list[str]]]:
    """The processes of `pids` (one cgroup's members) that belong in agent-shell, with why."""
    members = set(pids)
    parent = {pid: proc.ppid(pid) for pid in pids}
    argv = {pid: proc.argv(pid) for pid in pids}
    roots: dict[int, str] = {}
    for pid in pids:
        a = argv[pid]
        if not a:
            continue
        if is_relay(a):
            roots[pid] = "openclaw-service"
            continue
        pp = parent[pid]
        if pp in members and is_openclaw_exec_shell(a, argv.get(pp, [])):
            roots[pid] = "openclaw-exec"
            continue
        if pp in members and is_codex_app_server(argv.get(pp, [])) and not is_codex_app_server(a) and not is_codex_hook_relay(a):
            roots[pid] = "codex-command"
    moves = []
    for pid in pids:
        cur, seen = pid, 0
        while cur is not None and seen < 64:
            if cur in roots:
                moves.append((pid, roots[cur], argv[pid]))
                break
            cur = parent.get(cur) if cur in members else None
            seen += 1
    return moves


def disk_of(path: str, sysfs: str = "/sys") -> str | None:
    """MAJ:MIN of the whole disk holding `path` (io.max takes disks, not partitions)."""
    try:
        dev = os.stat(path).st_dev
    except OSError:
        return None
    node = f"{sysfs}/dev/block/{os.major(dev)}:{os.minor(dev)}"
    try:
        real = os.path.realpath(node)
        if os.path.exists(os.path.join(real, "partition")):
            real = os.path.dirname(real)
        with open(os.path.join(real, "dev")) as fh:
            return fh.read().strip()
    except OSError:
        return None


class AgentShellCgroup:
    def __init__(self, service: str, group: str = DEFAULT_GROUP, source: str = DEFAULT_SOURCE,
                 memory_high: int | None = 12 * 1024**3, memory_max: int | None = None,
                 io_read_bps: int | None = None, io_write_bps: int | None = None,
                 io_paths: list[str] | None = None, dry_run: bool = False, proc: Proc | None = None,
                 sysfs: str = "/sys"):
        self.service = service.rstrip("/")
        self.group_dir = os.path.join(self.service, group)
        self.source_dir = os.path.join(self.service, source)
        self.memory_high = memory_high
        self.memory_max = memory_max
        self.io_read_bps = io_read_bps
        self.io_write_bps = io_write_bps
        self.io_paths = io_paths or []
        self.dry_run = dry_run
        self.proc = proc or Proc()
        self.sysfs = sysfs
        self.prepared_inode: int | None = None

    # -- setup -------------------------------------------------------------------------------
    def _read(self, name: str, base: str | None = None) -> str:
        with open(os.path.join(base or self.service, name)) as fh:
            return fh.read().strip()

    def _write(self, path: str, value: str) -> None:
        if self.dry_run:
            return
        with open(path, "w") as fh:
            fh.write(value)

    def prepare(self) -> bool:
        """Create agent-shell and apply its limits. False when the Gateway is not running."""
        if not os.path.isdir(self.source_dir):
            return False
        try:
            inode = os.stat(self.service).st_ino
        except OSError:
            return False
        if self.prepared_inode == inode and os.path.isdir(self.group_dir):
            return True
        available = self._read("cgroup.controllers").split()
        enabled = self._read("cgroup.subtree_control").split()
        for controller in ("memory", "io"):
            if controller in available and controller not in enabled:
                # Allowed only while the service cgroup itself holds no process (DelegateSubgroup
                # put them all in foreground).
                self._write(os.path.join(self.service, "cgroup.subtree_control"), f"+{controller}")
                log("controller", controller=controller, dryRun=self.dry_run)
        if not os.path.isdir(self.group_dir) and not self.dry_run:
            os.mkdir(self.group_dir)
        limits = []
        if os.path.isdir(self.group_dir) or self.dry_run:
            limits.append(("memory.high", str(self.memory_high) if self.memory_high else "max"))
            limits.append(("memory.max", str(self.memory_max) if self.memory_max else "max"))
            io_enabled = "io" in (self._read("cgroup.subtree_control").split() if not self.dry_run else available)
            if io_enabled and (self.io_read_bps or self.io_write_bps):
                for disk in sorted({d for d in (disk_of(p, self.sysfs) for p in self.io_paths) if d}):
                    rb = self.io_read_bps or "max"
                    wb = self.io_write_bps or "max"
                    limits.append(("io.max", f"{disk} rbps={rb} wbps={wb}"))
        for name, value in limits:
            self._write(os.path.join(self.group_dir, name), value)
        log("prepared", group=self.group_dir, limits=dict((n, v) for n, v in limits if n != "io.max"),
            io=[v for n, v in limits if n == "io.max"], dryRun=self.dry_run)
        self.prepared_inode = inode
        return True

    # -- moving ------------------------------------------------------------------------------
    def members(self) -> list[int]:
        try:
            with open(os.path.join(self.source_dir, "cgroup.procs")) as fh:
                return [int(x) for x in fh.read().split()]
        except OSError:
            return []

    def tick(self) -> list[int]:
        if not self.prepare():
            return []
        moved = []
        for pid, why, argv in plan_moves(self.members(), self.proc):
            try:
                self._write(os.path.join(self.group_dir, "cgroup.procs"), str(pid))
            except OSError as error:
                if error.errno in (errno.ESRCH, errno.ENOENT):
                    continue  # it exited
                log("move-failed", pid=pid, error=str(error))
                continue
            moved.append(pid)
            log("moved", pid=pid, why=why, cmd=" ".join(argv)[:160], dryRun=self.dry_run)
        return moved


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--service-cgroup", required=True)
    ap.add_argument("--group", default=DEFAULT_GROUP)
    ap.add_argument("--source", default=DEFAULT_SOURCE)
    ap.add_argument("--memory-high", default="12G")
    ap.add_argument("--memory-max", default="max")
    ap.add_argument("--io-read-bps", default=None, help="e.g. 80M; needs the io controller delegated")
    ap.add_argument("--io-write-bps", default=None)
    ap.add_argument("--io-path", action="append", default=[], help="a path on each disk to limit")
    ap.add_argument("--interval", type=float, default=1.0)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    group = AgentShellCgroup(
        args.service_cgroup, group=args.group, source=args.source,
        memory_high=parse_size(args.memory_high), memory_max=parse_size(args.memory_max),
        io_read_bps=parse_size(args.io_read_bps), io_write_bps=parse_size(args.io_write_bps),
        io_paths=args.io_path, dry_run=args.dry_run)
    stop = {"now": False}
    signal.signal(signal.SIGTERM, lambda *_: stop.__setitem__("now", True))
    while True:
        try:
            group.tick()
        except Exception as error:  # never die on one bad pass; systemd would restart-loop
            log("error", error=repr(error))
        if args.once or stop["now"]:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
