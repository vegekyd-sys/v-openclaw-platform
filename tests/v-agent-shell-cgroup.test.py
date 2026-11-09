#!/usr/bin/env python3
"""Offline tests for scripts/v-agent-shell-cgroup.py against a fake /proc and a fake cgroup tree.

The process tree is V's own (2026-11-10, Gateway pid 1992119): Workers and Chrome under the
Gateway, OpenClaw exec relays (relay -> group anchor -> command), the shared Codex app-server
with a shell it started and its hook relay.
"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from io import StringIO

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("agentshell", os.path.join(HERE, "..", "scripts", "v-agent-shell-cgroup.py"))
agentshell = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agentshell)

NODE = "/opt/node-v22.23.1/bin/node"
CORE = "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist"
CODEX = "/opt/codex-0.159.2-v/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex"

TREE = {
    # pid: (ppid, argv)
    100: (1, [NODE, "--max-old-space-size=12288", f"{CORE}/index.js", "gateway", "--port", "22793"]),
    101: (100, [NODE, "--max-old-space-size=12288", f"{CORE}/worker.js"]),
    110: (100, [NODE, f"{CORE}/process/supervisor/service-child-relay.js"]),
    111: (110, [NODE, f"{CORE}/process/supervisor/service-child-group-anchor.js"]),
    112: (111, ["grep", "-rl", "NIGHTSHIFT_URL", "/home/openclaw/.openclaw"]),
    120: (101, [NODE, f"{CORE}/process/supervisor/service-child-relay.js"]),  # exec inside a Worker
    121: (120, [NODE, f"{CORE}/process/supervisor/service-child-group-anchor.js"]),
    122: (121, ["ffmpeg", "-i", "in.mp4", "out.mp4"]),
    130: (100, [CODEX, "-c", "x=1", "app-server", "--listen", "stdio://"]),
    131: (130, ["/bin/bash", "-lc", "grep -rl chengpian-daily /home/openclaw/.openclaw"]),
    132: (131, ["grep", "-rl", "chengpian-daily", "/home/openclaw/.openclaw"]),
    133: (130, [NODE, f"{CORE}/index.js", "hooks", "relay", "--provider", "codex"]),
    140: (100, ["/usr/bin/google-chrome", "--remote-debugging-port=22804"]),
    141: (140, ["/opt/google/chrome/chrome", "--type=renderer"]),
}


def fake_proc(root, tree):
    for pid, (ppid, argv) in tree.items():
        d = os.path.join(root, str(pid))
        os.makedirs(d)
        comm = os.path.basename(argv[0])[:15]
        with open(os.path.join(d, "stat"), "w") as f:
            f.write(f"{pid} ({comm} (x)) S {ppid} {pid} {pid} 0 -1\n")
        with open(os.path.join(d, "cmdline"), "wb") as f:
            f.write(b"\0".join(a.encode() for a in argv) + b"\0")


def fake_cgroup(root, members, controllers="cpuset cpu io memory pids", enabled="memory"):
    service = os.path.join(root, "openclaw-gateway.service")
    fg = os.path.join(service, "foreground")
    os.makedirs(fg)
    for name, value in [("cgroup.controllers", controllers), ("cgroup.subtree_control", enabled), ("cgroup.procs", "")]:
        with open(os.path.join(service, name), "w") as f:
            f.write(value + "\n")
    with open(os.path.join(fg, "cgroup.procs"), "w") as f:
        f.write("\n".join(str(p) for p in members) + "\n")
    return service


class FakeCgroupFs(agentshell.AgentShellCgroup):
    """cgroup.procs in a real cgroupfs moves the pid; a plain file only records the last write."""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.writes = []

    def _write(self, path, value):
        self.writes.append((os.path.relpath(path, self.service), value))
        if self.dry_run:
            return
        if path.endswith("cgroup.subtree_control"):
            with open(path) as f:
                cur = f.read().split()
            with open(path, "w") as f:
                f.write(" ".join(sorted(set(cur) | {value.lstrip("+")})) + "\n")
            return
        if path.endswith("cgroup.procs"):
            src = os.path.join(self.source_dir, "cgroup.procs")
            with open(src) as f:
                left = [p for p in f.read().split() if p != value]
            with open(src, "w") as f:
                f.write("\n".join(left) + "\n")
        super()._write(path, value)


class AgentShellTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.proc_root = os.path.join(self.tmp.name, "proc")
        fake_proc(self.proc_root, TREE)
        self.proc = agentshell.Proc(self.proc_root)
        self.out = StringIO()
        self._stdout, sys.stdout = sys.stdout, self.out

    def tearDown(self):
        sys.stdout = self._stdout
        self.tmp.cleanup()

    def events(self, kind):
        return [json.loads(l) for l in self.out.getvalue().splitlines() if json.loads(l)["event"] == f"agent-shell-cgroup.{kind}"]

    def test_plan_moves_exec_relays_and_codex_commands_only(self):
        moves = agentshell.plan_moves(sorted(TREE), self.proc)
        moved = {pid: why for pid, why, _ in moves}
        self.assertEqual(moved, {
            110: "openclaw-exec", 111: "openclaw-exec", 112: "openclaw-exec",
            120: "openclaw-exec", 121: "openclaw-exec", 122: "openclaw-exec",
            131: "codex-command", 132: "codex-command",
        })
        for pid in (100, 101, 130, 133, 140, 141):  # Gateway, Worker, app-server, hook relay, Chrome
            self.assertNotIn(pid, moved)

    def test_tick_creates_group_enables_io_sets_limits_and_moves(self):
        service = fake_cgroup(os.path.join(self.tmp.name, "cg"), sorted(TREE))
        group = FakeCgroupFs(service, memory_high=4 * 1024**3, io_read_bps=80 * 1024**2,
                             io_write_bps=80 * 1024**2, io_paths=[self.tmp.name], proc=self.proc)
        moved = group.tick()
        self.assertEqual(sorted(moved), [110, 111, 112, 120, 121, 122, 131, 132])
        with open(os.path.join(service, "cgroup.subtree_control")) as f:
            self.assertIn("io", f.read().split())
        with open(os.path.join(service, "agent-shell", "memory.high")) as f:
            self.assertEqual(f.read(), str(4 * 1024**3))
        with open(os.path.join(service, "foreground", "cgroup.procs")) as f:
            self.assertEqual(sorted(int(p) for p in f.read().split()), [100, 101, 130, 133, 140, 141])
        self.assertEqual(len(self.events("moved")), 8)
        # A second pass finds nothing left to move and does not re-apply the limits.
        writes = len(group.writes)
        self.assertEqual(group.tick(), [])
        self.assertEqual(len(group.writes), writes)

    def test_gateway_not_running_is_a_no_op(self):
        group = FakeCgroupFs(os.path.join(self.tmp.name, "missing.service"), proc=self.proc)
        self.assertEqual(group.tick(), [])
        self.assertEqual(group.writes, [])

    def test_dry_run_changes_nothing(self):
        service = fake_cgroup(os.path.join(self.tmp.name, "cg"), sorted(TREE))
        group = FakeCgroupFs(service, proc=self.proc, dry_run=True)
        group.tick()
        self.assertFalse(os.path.exists(os.path.join(service, "agent-shell")))
        with open(os.path.join(service, "foreground", "cgroup.procs")) as f:
            self.assertEqual(len(f.read().split()), len(TREE))
        self.assertEqual(len(self.events("moved")), 8)

    def test_parse_size(self):
        self.assertEqual(agentshell.parse_size("4G"), 4 * 1024**3)
        self.assertEqual(agentshell.parse_size("80M"), 80 * 1024**2)
        self.assertEqual(agentshell.parse_size("80MiB"), 80 * 1024**2)
        self.assertIsNone(agentshell.parse_size("max"))


if __name__ == "__main__":
    unittest.main()
