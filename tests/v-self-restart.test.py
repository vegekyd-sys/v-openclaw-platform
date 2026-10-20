#!/usr/bin/env python3
"""V restarting itself must never leave production down: changes are validated
before the Gateway stops, a Gateway that does not come back gets its old config
and another start, and only stale Codex registrations are removed. It must not
cut off somebody else's turn either: it waits for V to be idle first, and after
the start it checks that stream crons and the Worker pool came back."""
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
REAL_NOTIFY = mod.notify


class FakeClock:
    """time.sleep advances the clock, so waits with deadlines finish at once."""

    def __init__(self):
        self.now = 0.0
        self.epoch0 = 1792240000.0

    def sleep(self, s):
        self.now += max(0, s)

    def monotonic(self):
        return self.now

    def time(self):
        return self.epoch0 + self.now


STREAM = {"id": "42775b92", "name": "GrokBot bridge", "enabled": True, "kind": "stream",
          "runningAtMs": None, "streamStatus": "running"}


def idle_workers(*active, queued=0, pending=0, min_workers=1):
    return {"minWorkers": min_workers, "pending": pending, "workers": [
        {"slot": 0, "ready": True, "retiring": False, "activeCount": len(active), "queued": queued,
         "active": [{"sessionKey": k, "kind": "agent"} for k in active]}]}


class FakeHost:
    """systemctl, journalctl, `openclaw config set/validate` and the Gateway's
    read-only RPC against in-memory state."""

    def __init__(self, config_path, ready=True, crash=False, bad_paths=(), clock=None):
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
        self.clock = clock
        self.recent = []          # [(epoch, message)] for journalctl -u
        self.busy_until = None    # clock time until which `busy_query` is answered
        self.busy_query = None
        self.queries = 0
        self.streams_after_start = ["running"]  # streamStatus per poll after a start; last repeats
        self.stream_polls = 0
        self.last_env = {}

    def gateway_query(self):
        self.queries += 1
        if not self.active:
            return {"error": "Gateway endpoint unknown (unit inactive)"}
        if self.busy_query is not None and (self.busy_until is None or self.clock.now < self.busy_until):
            return self.busy_query
        status = STREAM["streamStatus"]
        if self.pid > 100:  # restarted at least once
            seq = self.streams_after_start
            status = seq[min(self.stream_polls, len(seq) - 1)]
            self.stream_polls += 1
        return {"workers": idle_workers(), "cron": {"jobs": [dict(STREAM, streamStatus=status)]}}

    def result(self, out="", rc=0, err=""):
        return subprocess.CompletedProcess([], rc, out, err)

    def sh(self, argv, timeout=60, input_text=None, check=False):
        if argv[:1] == ["runuser"]:
            argv = argv[argv.index("--") + 1:]
            if argv[:1] == ["env"]:
                argv = argv[1:]
            self.last_env = {}
            while argv and "=" in argv[0] and not argv[0].startswith("/"):
                k, v = argv[0].split("=", 1)
                self.last_env[k] = v
                argv = argv[1:]
        self.calls.append(argv)
        if argv[0] == "systemctl":
            return self.systemctl(argv[1:])
        if argv[0] == "journalctl":
            if argv[1] == "-u":
                since = float(argv[argv.index("--since") + 1][1:])
                return self.result("".join("%.6f host node[1]: %s\n" % (ts, m) for ts, m in self.recent if ts >= since))
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
        if argv[1:3] == ["config", "validate"]:
            with open(self.last_env["OPENCLAW_CONFIG_PATH"]) as f:
                bad = json.load(f).get("invalid")
            return self.result("", 1, "× invalid: unknown key") if bad else self.result("Config valid")
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
                                "ControlGroup": "", "NRestarts": str(self.restarts)}[prop])
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
        self.worker_config = os.path.join(self.tmp.name, "worker-openclaw.json")
        with open(self.worker_config, "w") as f:
            json.dump({"worker": 1}, f)
        self.clock = FakeClock()
        self.notified = []
        self.patches = [
            mock.patch.object(mod, "CONFIG", self.config),
            mock.patch.object(mod, "WORKER_CONFIG", self.worker_config),
            mock.patch.object(mod, "time", self.clock),
            mock.patch.object(mod, "STATE_DIR", os.path.join(self.tmp.name, "state")),
            mock.patch.object(mod, "RUN_AS", pwd.getpwuid(os.getuid()).pw_name),
            mock.patch.object(mod, "log", lambda m: None),
            mock.patch.object(mod.os, "geteuid", lambda: 0),
            mock.patch.object(mod.os, "chown", lambda *a: None),
            mock.patch.object(mod, "notify", lambda rec, text: self.notified.append(text)),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def host(self, **kw):
        h = FakeHost(self.config, clock=self.clock, **kw)
        for p in (mock.patch.object(mod, "sh", h.sh), mock.patch.object(mod, "gateway_query", h.gateway_query)):
            p.start()
            self.patches.append(p)
        return h

    def read_config(self, path=None):
        with open(path or self.config) as f:
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
        with mock.patch.object(mod, "unit_active", side_effect=["active", "deactivating", "inactive", "active", "active"]):
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

    def test_ready_wait_allows_queued_start_then_activation(self):
        h = self.host()
        h.journal[h.invocation] = "[gateway] ready"
        with mock.patch.object(mod, "unit_active", side_effect=["inactive", "activating", "active"]):
            self.assertEqual(mod.wait_ready(1200, "0"), (True, "ready"))

    def test_remaining_cgroup_child_prevents_configuration_write(self):
        h = self.host()
        self.request("--set", 'plugins.t={"mac":1}')
        with mock.patch.object(mod, "remaining_unit_processes", return_value=[123]), mock.patch.object(mod, "STOP_TIMEOUT_S", 0):
            rec = self.run_last()
        self.assertEqual(rec["outcome"], "stop-pending", rec)
        self.assertEqual(self.read_config(), {"keep": 1})
        self.assertFalse(any(c[:2] == ["systemctl", "start"] for c in h.calls))

    def test_remaining_child_exit_is_waited_before_configuration_write(self):
        h = self.host()
        self.request("--set", 'plugins.t={"mac":1}')
        with mock.patch.object(mod, "remaining_unit_processes", side_effect=[[123], []]):
            rec = self.run_last()
        self.assertEqual(rec["outcome"], "ok", rec)

    def test_nested_worker_cgroup_is_not_mistaken_for_an_empty_unit(self):
        files = {"/sys/fs/cgroup/test/cgroup.events": "populated 1\nfrozen 0\n", "/sys/fs/cgroup/test/cgroup.procs": "", "/sys/fs/cgroup/test/worker/cgroup.procs": "4321\n"}
        import io
        def read(name, *args, **kwargs):
            return io.StringIO(files[name])
        with mock.patch("builtins.open", side_effect=read), mock.patch.object(mod.os, "walk", return_value=[("/sys/fs/cgroup/test", ["worker"], []), ("/sys/fs/cgroup/test/worker", [], [])]):
            self.assertEqual(mod.remaining_unit_processes("/test"), [4321])

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


OWN = "agent:makaron:feishu:group:oc_" + "a" * 32
OTHER = "agent:makaron:feishu:group:oc_" + "b" * 32


class BusyReasons(unittest.TestCase):
    """The idle definition, one condition at a time."""

    NOW = 1792240000.0

    def reasons(self, query=None, journal=(), session_key=OWN, requested=None):
        rec = {"sessionKey": session_key, "requestedEpoch": self.NOW - 60 if requested is None else requested}
        q = query if query is not None else {"workers": idle_workers(), "cron": {"jobs": [STREAM]}}
        return mod.busy_reasons(rec, q, list(journal), self.NOW)

    def test_idle(self):
        self.assertEqual(self.reasons(), ([], False))

    def test_other_worker_turn_is_busy_but_the_requesters_own_is_not(self):
        r, own = self.reasons({"workers": idle_workers(OWN), "cron": {"jobs": []}})
        self.assertEqual((r, own), ([], True))
        r, _ = self.reasons({"workers": idle_workers(OWN, OTHER), "cron": {"jobs": []}})
        self.assertEqual(r, ["worker 有 1 个回合在跑"])

    def test_without_a_requester_every_turn_counts(self):
        r, _ = self.reasons({"workers": idle_workers(OWN), "cron": {"jobs": []}}, session_key=None)
        self.assertEqual(r, ["worker 有 1 个回合在跑"])

    def test_queued_and_pending_turns_are_busy(self):
        r, _ = self.reasons({"workers": idle_workers(queued=1, pending=2), "cron": {"jobs": []}})
        self.assertEqual(r, ["worker 有 3 个回合在排队"])

    def test_running_cron_turn_is_busy_but_a_resident_stream_is_not(self):
        self.assertEqual(self.reasons({"workers": idle_workers(), "cron": {"jobs": [STREAM]}})[0], [])
        job = {"id": "x", "name": "daily report", "enabled": True, "kind": "cron", "runningAtMs": 1, "streamStatus": None}
        r, _ = self.reasons({"workers": idle_workers(), "cron": {"jobs": [STREAM, job]}})
        self.assertEqual(r, ["cron 回合在跑：daily report"])

    def test_query_failure_is_busy_but_a_gateway_without_workers_is_not(self):
        r, _ = self.reasons({"error": "connect timeout"})
        self.assertEqual(len(r), 2)
        r, _ = self.reasons({"workers": {"error": "unknown method: vlab.workers.status"}, "cron": {"jobs": []}})
        self.assertEqual(r, [])

    def test_dispatch_without_complete_is_busy(self):
        t = self.NOW - 120
        busy = [(t, "[feishu] feishu[default]: dispatching to agent (session=%s)" % OTHER)]
        self.assertEqual(self.reasons(journal=busy)[0], ["最近 4 分钟有 1 条消息分发后还没完成"])
        done = busy + [(t + 5, "[feishu] feishu[default]: dispatch complete (queuedFinal=true, replies=1)")]
        self.assertEqual(self.reasons(journal=done)[0], [])
        # the [diagnostic] line is a different event and must not close a dispatch
        diag = busy + [(t + 5, "[diagnostic] message dispatch completed: channel=feishu outcome=error")]
        self.assertEqual(len(self.reasons(journal=diag)[0]), 1)

    def test_requesters_own_dispatch_before_the_request_is_not_busy(self):
        own = [(self.NOW - 150, "dispatching to agent (session=%s)" % OWN)]
        self.assertEqual(self.reasons({"workers": idle_workers(OWN), "cron": {"jobs": []}}, journal=own)[0], [])
        # its completion must not hide somebody else's open dispatch
        mixed = own + [(self.NOW - 140, "dispatching to agent (session=%s)" % OTHER),
                       (self.NOW - 130, "dispatch complete (queuedFinal=true, replies=1)")]
        self.assertEqual(len(self.reasons(journal=mixed)[0]), 1)

    def test_new_message_in_the_requesters_chat_after_the_request_is_busy(self):
        later = [(self.NOW - 30, "received message from ou_x in oc_%s (group)" % ("a" * 32))]
        self.assertEqual(self.reasons(journal=later)[0], ["90 秒内有新消息进来"])
        earlier = [(self.NOW - 70, "received message from ou_x in oc_%s (group)" % ("a" * 32))]
        self.assertEqual(self.reasons(journal=earlier, requested=self.NOW - 60)[0], [])

    # Inter-session collaboration (docs/inter-session/design.md §6.6): a release
    # must not restart under a room turn the relay started.
    def relay(self, relay, **kw):
        return self.reasons({"workers": idle_workers(), "cron": {"jobs": [STREAM]}, "relay": relay}, **kw)[0]

    def test_running_collaboration_turn_is_busy(self):
        items = [{"phase": "running", "target": OTHER}, {"phase": "starting", "target": OTHER + "x"},
                 {"phase": "queued", "target": OTHER}]
        self.assertEqual(self.relay({"counts": {"running": 2, "queued": 1, "awaiting": 0}, "items": items}),
                         ["会话协作有 2 个回合在跑"])

    def test_queued_or_waiting_collaboration_is_not_busy(self):
        # the relay re-queues them after the restart; no turn is in flight
        items = [{"phase": p, "target": OTHER} for p in ("queued", "posted", "awaiting_children", "result_ready")]
        self.assertEqual(self.relay({"counts": {"running": 0, "queued": 2, "awaiting": 2}, "items": items}), [])
        self.assertEqual(self.relay({"counts": {}, "items": []}), [])

    def test_without_counts_the_items_are_counted(self):
        items = [{"phase": "running", "target": OTHER}, {"phase": "queued", "target": OTHER}, "junk"]
        self.assertEqual(self.relay({"items": items}), ["会话协作有 1 个回合在跑"])

    def test_requesters_own_room_turn_is_not_a_reason(self):
        items = [{"phase": "running", "target": OWN}]
        self.assertEqual(self.relay({"counts": {"running": 1}, "items": items}), [])
        self.assertEqual(self.relay({"counts": {"running": 1}, "items": items}, session_key=None),
                         ["会话协作有 1 个回合在跑"])
        items.append({"phase": "running", "target": OTHER})
        self.assertEqual(self.relay({"counts": {"running": 2}, "items": items}), ["会话协作有 1 个回合在跑"])

    def test_gateway_without_the_relay_plugin_is_not_busy(self):
        # what a read-only client is told for an unregistered method, and the plain form
        for error in ("missing scope: operator.admin", "unknown method: vrelay.list"):
            self.assertEqual(self.relay({"error": error}), [], error)
        # a helper installed before the relay query
        self.assertEqual(self.reasons({"workers": idle_workers(), "cron": {"jobs": [STREAM]}})[0], [])

    def test_relay_query_failure_is_busy(self):
        self.assertEqual(self.relay({"error": "request timeout after 20000ms"}),
                         ["查询会话协作失败：request timeout after 20000ms"])
        # the Gateway not answering at all is reported once per query, not again for the relay
        self.assertEqual(len(self.reasons({"error": "connect timeout"})[0]), 2)

    def test_inbound_quiet_window(self):
        self.assertEqual(self.reasons(journal=[(self.NOW - 89, "received message from ou_y in oc_z (p2p)")])[0],
                         ["90 秒内有新消息进来"])
        self.assertEqual(self.reasons(journal=[(self.NOW - 91, "received message from ou_y in oc_z (p2p)")])[0], [])


class IdleGate(Base):
    def stop_index(self, h):
        return h.calls.index(["systemctl", "stop", "--no-block", mod.UNIT])

    def test_waits_for_another_turn_then_restarts(self):
        h = self.host()
        h.busy_query = {"workers": idle_workers(OTHER), "cron": {"jobs": [STREAM]}}
        h.busy_until = 100
        self.request("--delay", "5")
        rec = self.run_last()
        self.assertEqual(rec["outcome"], "ok", rec)
        self.assertEqual(rec["idleGate"]["result"], "idle")
        self.assertGreaterEqual(rec["idleGate"]["waitedS"], 95)
        self.assertGreater(rec["idleGate"]["checks"], 1)
        busy = next(x for x in rec["steps"] if x["step"] == "busy")
        self.assertEqual(busy["reasons"], ["worker 有 1 个回合在跑"])
        names = [x["step"] for x in rec["steps"]]
        self.assertLess(names.index("idle"), names.index("stopped"))
        self.assertEqual(rec["warnings"], [])

    def test_still_busy_wait_then_proceed_restarts_with_a_warning(self):
        h = self.host()
        h.busy_query = {"workers": idle_workers(OTHER), "cron": {"jobs": [STREAM]}}
        h.busy_until = 10 ** 6
        self.request("--idle-timeout", "120")
        rec = self.run_last()
        self.assertEqual(rec["outcome"], "ok")
        self.assertEqual(rec["idleGate"]["result"], "timeout")
        self.assertIn("照常重启", rec["warnings"][0])
        self.assertIn(["systemctl", "stop", "--no-block", mod.UNIT], h.calls)

    def test_still_busy_abort_leaves_everything_untouched(self):
        h = self.host()
        h.busy_query = {"workers": idle_workers(OTHER), "cron": {"jobs": [STREAM]}}
        h.busy_until = 10 ** 6
        self.request("--if-busy", "abort", "--idle-timeout", "3600", "--set", 'plugins.t=1',
                     "--while-stopped", "true")
        rec = self.run_last()
        self.assertEqual(rec["outcome"], "busy-aborted")
        self.assertEqual(rec["idleGate"]["waitedS"], 3600)
        self.assertNotIn(["systemctl", "stop", "--no-block", mod.UNIT], h.calls)
        self.assertEqual(self.read_config(), {"keep": 1})
        self.assertNotIn("whileStoppedResult", rec)
        self.assertTrue(self.notified and "放弃" in self.notified[0])
        # nothing was restarted, so the ten-minute spacing does not apply
        h.busy_query = None
        self.assertEqual(self.request(), 0)

    def test_release_waits_for_a_collaboration_turn_and_aborts_if_it_never_ends(self):
        relay = {"counts": {"running": 1, "queued": 0, "awaiting": 0}, "items": [{"phase": "running", "target": OTHER}]}
        h = self.host()
        h.busy_query = {"workers": idle_workers(), "cron": {"jobs": [STREAM]}, "relay": relay}
        h.busy_until = 10 ** 6
        self.request("--if-busy", "abort", "--idle-timeout", "3600", "--while-stopped", "true")
        rec = self.run_last()
        self.assertEqual(rec["outcome"], "busy-aborted")
        self.assertEqual(rec["idleGate"]["reasons"], ["会话协作有 1 个回合在跑"])
        self.assertNotIn(["systemctl", "stop", "--no-block", mod.UNIT], h.calls)
        # once the turn is over the same request goes through
        h.busy_until = self.clock.now + 60
        self.request("--if-busy", "abort", "--idle-timeout", "3600")
        rec = self.run_last()
        self.assertEqual(rec["outcome"], "ok", rec)
        self.assertEqual(next(x for x in rec["steps"] if x["step"] == "busy")["reasons"], ["会话协作有 1 个回合在跑"])
        self.assertIn(["systemctl", "stop", "--no-block", mod.UNIT], h.calls)

    def test_zero_timeout_skips_the_gate(self):
        h = self.host()
        h.busy_query = {"workers": idle_workers(OTHER), "cron": {"jobs": [STREAM]}}
        h.busy_until = 10 ** 6
        self.request("--idle-timeout", "0")
        rec = self.run_last()
        self.assertEqual(rec["idleGate"], {"result": "skipped"})
        self.assertIn(["systemctl", "stop", "--no-block", mod.UNIT], h.calls)

    def test_gate_runs_only_after_the_delay(self):
        h = self.host()
        seen = []
        orig = h.gateway_query
        h.gateway_query = None

        def query():
            seen.append(self.clock.now)
            return orig()
        with mock.patch.object(mod, "gateway_query", query):
            self.request("--delay", "30")
            self.run_last()
        self.assertGreaterEqual(min(seen), 30)

    def test_busy_again_after_the_dry_runs_waits_again(self):
        h = self.host()
        answers = iter([[], ["worker 有 1 个回合在跑"], [], []])
        with mock.patch.object(mod, "check_idle", lambda rec: (next(answers), {})):
            self.request("--set", 'plugins.t=1')
            rec = self.run_last()
        self.assertEqual(rec["outcome"], "ok", rec)
        self.assertIn("busy-again", [x["step"] for x in rec["steps"]])


class WhileStopped(Base):
    def edit(self, path, data):
        return "python3 -c 'import json,sys; json.dump(%s, open(sys.argv[1], \"w\"))' %s" % (data, path)

    def test_command_runs_while_stopped_and_both_configs_are_backed_up(self):
        h = self.host()
        cmd = self.edit(self.config, '{"keep": 1, "web": "deepseek"}') + " && " + self.edit(self.worker_config, '{"worker": 2}')
        self.assertEqual(self.request("--while-stopped", cmd), 0)
        rec = self.run_last()
        self.assertEqual(rec["outcome"], "ok", rec)
        self.assertEqual(self.read_config()["web"], "deepseek")
        self.assertEqual(self.read_config(self.worker_config), {"worker": 2})
        backups = rec["configBackups"]
        self.assertEqual(set(backups), {self.config, self.worker_config})
        self.assertEqual(self.read_config(backups[self.worker_config]["backup"]), {"worker": 1})
        self.assertEqual(rec["whileStoppedResult"]["rc"], 0)
        self.assertEqual(rec["whileStoppedResult"]["command"], cmd)
        names = [x["step"] for x in rec["steps"]]
        self.assertLess(names.index("stopped"), names.index("while-stopped"))
        self.assertLess(names.index("while-stopped"), names.index("start"))
        self.assertTrue(all(v["ok"] for v in rec["configValidation"]))
        self.assertTrue(any("停服期间命令" in t and "退出码 0" in t for t in self.notified))

    def assert_rolled_back(self, rec, h):
        self.assertEqual(rec["outcome"], "rolled-back", rec)
        self.assertEqual(self.read_config(), {"keep": 1})
        self.assertEqual(self.read_config(self.worker_config), {"worker": 1})
        self.assertTrue(h.active)
        self.assertIn("config-restored", [x["step"] for x in rec["steps"]])

    def test_failing_command_restores_both_configs_and_starts_on_them(self):
        h = self.host()
        cmd = self.edit(self.config, '{"half": 1}') + " && " + self.edit(self.worker_config, '{"half": 1}') + " && exit 3"
        self.request("--while-stopped", cmd)
        rec = self.run_last()
        self.assert_rolled_back(rec, h)
        self.assertEqual(rec["whileStoppedResult"]["rc"], 3)
        self.assertIn("exited 3", rec["error"])
        starts = [c for c in h.calls if c[:2] == ["systemctl", "start"]]
        self.assertEqual(len(starts), 1)   # only the rollback start; never started on the half-written config

    def test_invalid_config_after_the_command_rolls_back(self):
        h = self.host()
        self.request("--while-stopped", self.edit(self.worker_config, '{"invalid": True}'))
        rec = self.run_last()
        self.assert_rolled_back(rec, h)
        self.assertEqual(rec["whileStoppedResult"]["rc"], 0)
        self.assertIn("config invalid", rec["error"])
        self.assertIn(self.worker_config, rec["error"])

    def test_gateway_not_ready_after_the_command_rolls_back(self):
        h = self.host()
        self.request("--while-stopped", self.edit(self.config, '{"web": "broken"}'))
        with mock.patch.object(mod, "wait_ready", side_effect=[(False, "unit failed"), (True, "ready")]):
            rec = self.run_last()
        self.assert_rolled_back(rec, h)

    def test_command_that_hangs_is_killed_and_rolled_back(self):
        h = self.host()
        self.request("--while-stopped", "sleep 30", "--while-stopped-timeout", "10")
        with mock.patch.object(mod.subprocess.Popen, "communicate",
                               side_effect=[subprocess.TimeoutExpired("sh", 10), ("", "")]), \
                mock.patch.object(mod.os, "killpg") as killpg:
            rec = self.run_last()
        killpg.assert_called_once()
        self.assertTrue(rec["whileStoppedResult"]["timedOut"])
        self.assert_rolled_back(rec, h)

    def test_unknown_command_is_refused_at_request(self):
        h = self.host()
        self.assertEqual(self.request("--while-stopped", "/nonexistent/activate.mjs"), 2)
        self.assertEqual(self.request("--while-stopped", "no-such-tool-xyz --x"), 2)
        self.assertEqual(h.launched, [])

    def test_restores_ownership_a_root_command_changed(self):
        rec = {"configBackups": {self.config: {"backup": "x", "uid": 4242, "gid": 4242, "mode": 0o600}}}
        with mock.patch.object(mod.os, "chown") as chown, mock.patch.object(mod.os, "chmod"):
            self.assertEqual(mod.keep_config_owners(rec), [self.config])
        chown.assert_called_once_with(self.config, 4242, 4242)


class AfterStart(Base):
    def test_waits_for_streams_to_come_back(self):
        h = self.host()
        h.streams_after_start = ["stopped", "starting", "running"]
        self.request()
        rec = self.run_last()
        self.assertEqual(rec["outcome"], "ok")
        self.assertEqual(rec["streams"]["running"], 1)
        self.assertEqual(rec["warnings"], [])
        self.assertTrue(any("stream cron：1/1 已恢复 running" in t for t in self.notified))

    def test_stream_that_never_comes_back_is_a_warning(self):
        h = self.host()
        h.streams_after_start = ["stopped"]
        self.request("--settle-timeout", "60")
        rec = self.run_last()
        self.assertEqual(rec["outcome"], "ok")
        self.assertFalse(rec["streams"]["ok"])
        self.assertIn("stream cron 没有恢复：GrokBot bridge（stopped）", rec["warnings"])
        self.assertIn("有 1 项告警", rec["outcomeText"])
        self.assertTrue(any("⚠️ stream cron 没有恢复" in t for t in self.notified))

    def test_stream_that_disappeared_is_a_warning(self):
        state = mod.stream_state({"cron": {"jobs": []}}, ["42775b92"])
        self.assertFalse(state["ok"])
        self.assertEqual(state["missing"], ["42775b92"])

    def test_post_check_errors_are_warnings(self):
        h = self.host()
        orig = h.systemctl

        def systemctl(args):
            r = orig(args)
            if args[0] == "start":
                h.journal[h.invocation] = ("[gateway] ready\nError: Cannot inspect Codex processes. Process inspection exceeded\n"
                                           "Worker stream acknowledgement timed out\nInvalidConfigError: x\n")
            return r
        h.systemctl = systemctl
        self.request()
        rec = self.run_last()
        pc = rec["postChecks"]
        self.assertEqual((pc["codexInspectFailed"], pc["streamAckTimeout"], pc["invalidConfig"]), (1, 1, 1))
        self.assertIn("启动后日志：InvalidConfig 1 次、stream-ack 超时 1 次、Cannot inspect Codex 1 次", rec["warnings"])

    def test_worker_pool_short_is_a_warning(self):
        state = mod.worker_state({"workers": idle_workers(min_workers=5)})
        self.assertEqual(state, {"ok": False, "ready": 1, "minWorkers": 5})
        self.assertEqual(mod.worker_state({"workers": {"error": "unknown method: vlab.workers.status"}})["ok"], True)


class Notify(Base):
    def test_quiet_without_chat_unless_something_is_wrong(self):
        sent = []
        fake = mock.MagicMock(feishu=lambda text: sent.append(text) or True, ALERT_CHAT="default")
        with mock.patch.dict(sys.modules, {"sentinel": fake}):
            notify = REAL_NOTIFY
            self.assertIsNone(notify({"outcome": "ok", "warnings": []}, "x"))
            self.assertTrue(notify({"outcome": "ok", "warnings": ["stream"]}, "y"))
            self.assertEqual(fake.ALERT_CHAT, "default")
            self.assertTrue(notify({"outcome": "ok", "chat": "oc_c", "warnings": []}, "z"))
            self.assertEqual(fake.ALERT_CHAT, "oc_c")
        self.assertEqual(sent, ["y", "z"])


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
