#!/usr/bin/env python3
"""V restarting itself must never leave production down: changes are validated
before the Gateway stops, a Gateway that does not come back gets its old config
and another start, and only stale Codex registrations are removed."""
import importlib.util
import json
import os
import pwd
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("v_self_restart", os.path.join(HERE, "..", "scripts", "v-self-restart.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class FakeHost:
    """systemctl, journalctl and `openclaw config set` against in-memory state."""

    def __init__(self, config_path, ready=True, crash=False, bad_paths=()):
        self.config_path = config_path
        self.ready = ready
        self.crash = crash
        self.bad_paths = set(bad_paths)
        self.active = True
        self.pid = 100
        self.invocation = "inv0"
        self.restarts = 0
        self.journal = {}
        self.calls = []
        self.launched = []
        self.wakes = []
        self.no_channel = False

    def result(self, out="", rc=0, err=""):
        return subprocess.CompletedProcess([], rc, out, err)

    def sh(self, argv, timeout=60, input_text=None, check=False):
        if argv[:1] == ["runuser"]:
            argv = argv[argv.index("--") + 1:]
            while argv and "=" in argv[0] and not argv[0].startswith("/"):
                argv = argv[1:]
            if argv[:1] == ["env"]:
                argv = [a for a in argv[1:] if "=" not in a or a.startswith("/")]
        self.calls.append(argv)
        if argv[0] == "systemctl":
            return self.systemctl(argv[1:])
        if argv[0] == "journalctl":
            inv = argv[1].split("=", 1)[1]
            return self.result(self.journal.get(inv, ""))
        if argv[0] == "systemd-run":
            self.launched.append(argv)
            return self.result()
        if argv[0] == "timeout":  # wake
            self.wakes.append(argv)
            if "--deliver" in argv and self.no_channel:
                return self.result("", 1, "Reason: Channel is required (no configured channels detected).")
            return self.result('{"ok":true}')
        if argv[0] == "python3":  # orphan cleanup as the run-as user
            return self.result('{"deleted": [], "kept": []}')
        if argv[1:3] == ["config", "set"]:
            path, value = argv[3], argv[4]
            if path in self.bad_paths:
                return self.result("", 1, "Error: unknown key %s" % path)
            if "--dry-run" in argv:
                return self.result("Dry run successful: 1 update(s) validated")
            with open(self.config_path) as f:
                cfg = json.load(f)
            cfg[path] = json.loads(value)
            with open(self.config_path, "w") as f:
                json.dump(cfg, f)
            return self.result("Updated %s. Restart the gateway to apply." % path)
        raise AssertionError("unexpected command %r" % argv)

    def systemctl(self, args):
        if args[0] == "show":
            prop = args[3]
            return self.result({"MainPID": str(self.pid if self.active else 0), "InvocationID": self.invocation,
                                "NRestarts": str(self.restarts)}[prop])
        if args[0] == "is-active":
            if args[1] != mod.UNIT:
                return self.result("inactive", 3)
            return self.result("active" if self.active else "inactive")
        if args[0] == "stop":
            self.active = False
            return self.result()
        if args[0] == "start":
            self.active = True
            self.pid += 1
            self.invocation = "inv%d" % self.pid
            if self.crash:
                self.restarts += 1
            elif self.ready:
                self.journal[self.invocation] = "... [gateway] starting...\n2026 [gateway] ready\n"
            return self.result()
        raise AssertionError("unexpected systemctl %r" % args)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = os.path.join(self.tmp.name, "openclaw.json")
        with open(self.config, "w") as f:
            json.dump({"keep": 1}, f)
        self.patches = [
            mock.patch.object(mod, "CONFIG", self.config),
            mock.patch.object(mod, "STATE_DIR", os.path.join(self.tmp.name, "state")),
            mock.patch.object(mod, "RUN_AS", pwd.getpwuid(os.getuid()).pw_name),
            mock.patch.object(mod.time, "sleep", lambda s: None),
            mock.patch.object(mod, "log", lambda m: None),
            mock.patch.object(mod.os, "geteuid", lambda: 0),
            mock.patch.object(mod.os, "chown", lambda *a: None),
            mock.patch.object(mod, "notify", lambda rec, text: None),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def host(self, **kw):
        h = FakeHost(self.config, **kw)
        p = mock.patch.object(mod, "sh", h.sh)
        p.start()
        self.patches.append(p)
        return h

    def read_config(self):
        with open(self.config) as f:
            return json.load(f)

    def request(self, *extra):
        return mod.main(["--reason", "test", "--requested-by", "unit test", *extra])

    def run_last(self):
        rid = mod.all_records()[-1]["id"]
        mod.execute(rid)
        return mod.load(rid)


class Request(Base):
    def test_bad_change_is_refused_before_anything_stops(self):
        h = self.host(bad_paths={"plugins.x"})
        self.assertEqual(self.request("--set", 'plugins.x={"a":1}'), 3)
        self.assertEqual(h.launched, [])
        self.assertNotIn(["systemctl", "stop", "--no-block", mod.UNIT], h.calls)

    def test_launches_outside_the_gateway_and_returns(self):
        h = self.host()
        self.assertEqual(self.request("--set", 'a.b={"x":1}', "--delay", "5"), 0)
        self.assertEqual(len(h.launched), 1)
        argv = h.launched[0]
        self.assertIn("--collect", argv)
        self.assertEqual(argv[-2:], ["--run", mod.all_records()[-1]["id"]])
        self.assertNotIn(["systemctl", "stop", "--no-block", mod.UNIT], h.calls)  # the request itself never stops anything

    def test_check_changes_nothing(self):
        h = self.host()
        self.assertEqual(self.request("--set", 'a.b=1', "--check"), 0)
        self.assertEqual(h.launched, [])
        self.assertEqual(mod.all_records(), [])

    def test_unquoted_string_is_rejected(self):
        self.host()
        self.assertEqual(self.request("--set", "a.b=hello"), 2)

    def test_value_from_file(self):
        f = os.path.join(self.tmp.name, "v.json")
        with open(f, "w") as fh:
            json.dump({"tianyi-mac": {"adminUrl": "http://127.0.0.1:23953"}}, fh)
        self.assertEqual(mod.parse_set("p.targets=@" + f)[0], "p.targets")

    def test_second_restart_within_ten_minutes_needs_force(self):
        self.host()
        self.assertEqual(self.request(), 0)
        self.run_last()
        self.assertEqual(self.request(), 4)
        self.assertEqual(self.request("--force"), 0)

    def test_bad_chat_and_session_key(self):
        self.host()
        self.assertEqual(self.request("--chat", "group1"), 2)
        self.assertEqual(self.request("--session-key", "main"), 2)


class Execute(Base):
    def test_deactivating_process_never_gets_config_writes_or_a_parallel_start(self):
        h = self.host()
        original = h.systemctl
        def delayed_stop(args):
            if args[0] == "stop":
                return h.result("", 1, "stop job canceled; old process is still exiting")
            return original(args)
        h.systemctl = delayed_stop
        self.request("--set", 'plugins.t={"mac":1}')
        with mock.patch.object(mod, "unit_active", return_value="deactivating"), mock.patch.object(mod, "STOP_TIMEOUT_S", 0):
            rec = self.run_last()
        self.assertEqual(rec["outcome"], "stop-pending")
        self.assertEqual(self.read_config(), {"keep": 1})
        self.assertFalse(any(c[0] == "systemctl" and c[1] == "start" for c in h.calls))
        self.assertFalse(any(c[1:3] == ["config", "set"] and "--dry-run" not in c for c in h.calls))
        self.assertFalse(any(x["step"] == "stopped" for x in rec["steps"]))

    def test_stop_timeout_retains_existing_config_without_attempting_a_second_start(self):
        h = self.host()
        original = h.systemctl
        def timed_out_stop(args):
            if args[0] == "stop":
                raise subprocess.TimeoutExpired(["systemctl", "stop", "--no-block", mod.UNIT], mod.STOP_TIMEOUT_S)
            return original(args)
        h.systemctl = timed_out_stop
        self.request("--set", 'plugins.t={"mac":1}')
        with mock.patch.object(mod, "unit_active", return_value="deactivating"), mock.patch.object(mod, "STOP_TIMEOUT_S", 0):
            rec = self.run_last()
        self.assertEqual(rec["outcome"], "stop-pending")
        self.assertEqual(self.read_config(), {"keep": 1})
        self.assertFalse(any(c[0] == "systemctl" and c[1] == "start" for c in h.calls))

    def test_deactivating_stop_waits_for_pid_zero_before_config_write(self):
        h = self.host()
        self.request("--set", 'plugins.t={"mac":1}')
        with mock.patch.object(mod, "unit_active", side_effect=["deactivating", "inactive", "active", "active"]):
            rec = self.run_last()
        self.assertEqual(rec["outcome"], "ok", rec)
        self.assertEqual(self.read_config()["plugins.t"], {"mac": 1})

    def test_start_dispatch_is_nonblocking_and_ready_budget_owns_wait(self):
        h = self.host()
        rec = {"id": "20261016-010101-aabb", "readyTimeoutS": 1200}
        with mock.patch.object(mod, "wait_ready", return_value=(True, "ready")) as wait:
            ok, _ = mod.start_unit(rec, "start")
        self.assertTrue(ok)
        self.assertIn(["systemctl", "start", "--no-block", mod.UNIT], h.calls)
        wait.assert_called_once_with(1200, "0")

    def test_happy_path_order(self):
        h = self.host()
        self.request("--set", 'plugins.t={"mac":1}', "--session-key", "agent:makaron:feishu:group:oc_" + "a" * 32)
        rec = self.run_last()
        self.assertEqual(rec["outcome"], "ok", rec)
        ops = [c[:2] for c in h.calls if c[0] == "systemctl" and c[1] in ("stop", "start")]
        self.assertEqual(ops, [["systemctl", "stop"], ["systemctl", "start"]])
        stop_i = h.calls.index(["systemctl", "stop", "--no-block", mod.UNIT])
        write_i = next(i for i, c in enumerate(h.calls) if c[1:3] == ["config", "set"] and "--dry-run" not in c)
        start_i = h.calls.index(["systemctl", "start", "--no-block", mod.UNIT])
        self.assertLess(stop_i, write_i)   # never written into a running Gateway (it would hot-reload)
        self.assertLess(write_i, start_i)
        self.assertEqual(self.read_config(), {"keep": 1, "plugins.t": {"mac": 1}})
        self.assertTrue(os.path.exists(rec["configBackup"]))
        self.assertTrue(any(c[0] == "timeout" and "agent" in c for c in h.calls))  # woke the session

    def test_not_ready_restores_config_and_starts_again(self):
        h = self.host(ready=False)
        self.request("--set", 'plugins.t={"mac":1}', "--ready-timeout", "60")
        with mock.patch.object(mod, "wait_ready", side_effect=[(False, "readiness budget expired"), (True, "ready")]):
            # first start never logs ready; let the rollback start succeed
            orig_start = h.systemctl

            def systemctl(args):
                r = orig_start(args)
                if args[0] == "start" and h.pid >= 102:
                    h.journal[h.invocation] = "[gateway] ready\n"
                return r
            h.systemctl = systemctl
            rec = self.run_last()
        self.assertEqual(rec["outcome"], "rolled-back", rec)
        self.assertEqual(self.read_config(), {"keep": 1})
        self.assertTrue(h.active)

    def test_wake_falls_back_when_delivery_cannot_be_routed(self):
        h = self.host()
        h.no_channel = True
        self.request("--session-key", "agent:makaron:drill")
        rec = self.run_last()
        self.assertEqual(rec["wake"]["rc"], 0)
        self.assertEqual(rec["wake"]["attempts"], 2)
        self.assertEqual(["--deliver" in w for w in h.wakes], [True, False])

    def test_coloured_journal_still_counts_as_ready(self):
        h = self.host()
        orig = h.systemctl

        def systemctl(args):
            r = orig(args)
            if args[0] == "start":
                h.journal[h.invocation] = "\x1b[36m[gateway]\x1b[39m \x1b[36mready\x1b[39m\n"
            return r
        h.systemctl = systemctl
        self.request()
        self.assertEqual(self.run_last()["outcome"], "ok")

    def test_crash_loop_is_detected_without_waiting_out_the_timeout(self):
        self.host(crash=True)
        self.request()
        rec = self.run_last()
        self.assertNotEqual(rec["outcome"], "ok")
        self.assertIn("NRestarts", json.dumps(rec["steps"]))

    def test_dry_run_failing_after_the_delay_keeps_the_gateway_up(self):
        h = self.host()
        self.request("--set", 'plugins.t=1')
        h.bad_paths.add("plugins.t")
        rec = self.run_last()
        self.assertEqual(rec["outcome"], "failed")
        self.assertNotIn(["systemctl", "stop", "--no-block", mod.UNIT], h.calls)
        self.assertTrue(h.active)


class CodexOrphans(unittest.TestCase):
    def test_only_rows_with_both_pids_dead_are_deleted(self):
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "s.sqlite")
            con = sqlite3.connect(db)
            con.execute("CREATE TABLE plugin_state_entries (plugin_id TEXT, namespace TEXT, value_json TEXT)")
            dead = 2 ** 22 + 12345
            rows = [("codex", "app-server-processes", json.dumps({"parent": {"pid": dead}, "child": {"pid": dead + 1}})),
                    ("codex", "app-server-processes", json.dumps({"parent": {"pid": dead}, "child": {"pid": os.getpid()}})),
                    ("other", "app-server-processes", json.dumps({"parent": {"pid": dead}, "child": {"pid": dead}}))]
            con.executemany("INSERT INTO plugin_state_entries VALUES (?,?,?)", rows)
            con.commit()
            con.close()
            with mock.patch.object(mod, "pid_alive", lambda p: p == os.getpid()):
                out = mod.clear_codex_orphans(db)
            self.assertEqual(len(out["deleted"]), 1)
            con = sqlite3.connect(db)
            left = con.execute("SELECT plugin_id, value_json FROM plugin_state_entries").fetchall()
            con.close()
            self.assertEqual(len(left), 2)
            self.assertTrue(any(str(os.getpid()) in v for _, v in left))


if __name__ == "__main__":
    unittest.main()
