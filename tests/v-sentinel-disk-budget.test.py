#!/usr/bin/env python3
"""The sentinel must warn before the session disk budget stalls the Gateway.

2026-10-15 21:11-21:40 no Feishu message reached an agent: makaron's session
store (sessions dir 16.5 GB + agent DB 16.9 GB + WAL) crossed
session.maintenance.maxDiskBytes (32 GiB) and 9.1's enforcement pass held the
session writer queue while it deleted archives one by one. The store had been
at 97-98% of the budget for days. The 22:06 restart hit it again.
"""
import importlib.util
import json
import os
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location(
    "v_sentinel",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "v-sentinel", "sentinel.py"),
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

T0 = 1792069860  # 2026-10-15 21:11 +08:00
GiB = 1024 ** 3


def quiet_sample(**over):
    s = {"pool": 5, "active": "active", "nrestarts": "0", "gw_up_s": 9000, "closing": 0, "stall": 0,
         "complete": 3, "cutoff_ids": [], "cutoff_cause": "", "compact_fail": 0, "cutoff": 0, "received": 4,
         "worker_fail": 0, "worker_invalid": 0, "cfg_missing": {"main": [], "worker": []},
         "crash_lines": [], "journal_cursor": "c", "disk_mb": 90000, "mem_mb": 9000,
         "saturated": [], "freezes": [], "dispatch_fail": [], "waits": [],
         "ingress_stalled": 0, "budget_exhausted": 0}
    s.update(over)
    return s


class ByteSize(unittest.TestCase):
    def test_matches_openclaw_parse_byte_size(self):
        self.assertEqual(mod.parse_byte_size("32gb"), 32 * GiB)
        self.assertEqual(mod.parse_byte_size("48GB"), 48 * GiB)
        self.assertEqual(mod.parse_byte_size("1.5g"), int(1.5 * GiB))
        self.assertEqual(mod.parse_byte_size(1000), 1000)
        self.assertIsNone(mod.parse_byte_size(False), "false disables the budget")
        self.assertEqual(mod.parse_byte_size(None), 10 * GiB, "unset uses the 10 GiB default")
        self.assertIsNone(mod.parse_byte_size("lots"))


class Measure(unittest.TestCase):
    def test_counts_what_disk_budget_counts(self):
        root = tempfile.mkdtemp()
        agents = os.path.join(root, "agents")
        sessions = os.path.join(agents, "makaron", "sessions")
        os.makedirs(os.path.join(sessions, "skills-prompts", "sha256", "ab"))
        os.makedirs(os.path.join(agents, "makaron", "agent"))
        os.makedirs(os.path.join(sessions, "subdir-not-counted"))
        for name, size in (("a.jsonl", 100), ("b.jsonl.deleted.2026-10-12T10-48-04.267Z", 50),
                           ("c.jsonl.migrated", 1000), ("skills-prompts/sha256/ab/" + "a" * 64 + ".txt", 7),
                           ("subdir-not-counted/x", 1000)):
            with open(os.path.join(sessions, name), "wb") as f:
                f.truncate(size)
        for name, size in (("openclaw-agent.sqlite", 4000), ("openclaw-agent.sqlite-wal", 300),
                           ("openclaw-agent.sqlite-shm", 9999)):
            with open(os.path.join(agents, "makaron", "agent", name), "wb") as f:
                f.truncate(size)
        cfg = os.path.join(root, "openclaw.json")
        with open(cfg, "w") as f:
            json.dump({"session": {"maintenance": {"mode": "enforce", "maxDiskBytes": "32gb"}}}, f)
        with mock.patch.object(mod, "SESSION_STORES_ROOT", agents), mock.patch.object(mod, "CONFIG_PATH", cfg):
            self.assertEqual(mod.measure_session_budgets(), [("makaron", 100 + 50 + 7 + 4000 + 300, 32 * GiB)])
        with open(cfg, "w") as f:
            json.dump({"session": {"maintenance": {"mode": "warn", "maxDiskBytes": "32gb"}}}, f)
        with mock.patch.object(mod, "SESSION_STORES_ROOT", agents), mock.patch.object(mod, "CONFIG_PATH", cfg):
            self.assertEqual(mod.measure_session_budgets(), [], "warn mode never enforces")


class Rules(unittest.TestCase):
    def tick(self, state, now, sample, budgets=None):
        sent = []
        st = {"cfg_validated_at": now, "cfg_valid": {"main": (True, ""), "worker": (True, "")}}
        st.update(state)
        with mock.patch.object(mod, "sample", return_value=sample), \
                mock.patch.object(mod, "load_state", return_value=st), \
                mock.patch.object(mod, "save_state", side_effect=lambda s: state.update(s)), \
                mock.patch.object(mod, "feishu", side_effect=lambda text: sent.append(text) or True), \
                mock.patch.object(mod, "measure_session_budgets", return_value=budgets or []), \
                mock.patch.object(mod.time, "time", return_value=now), \
                mock.patch("builtins.print"):
            mod.main()
        return sent

    def test_budget_headroom_warns_days_before_the_stall(self):
        state = {}
        # V on 10-12..10-15: 33.4 GB against 32 GiB (34.36e9) is 97%.
        sent = self.tick(state, T0, quiet_sample(), budgets=[("makaron", 33_400_000_000, 32 * GiB)])
        self.assertEqual(len(sent), 1)
        self.assertIn("预算快到了", sent[0])
        self.assertIn("makaron", sent[0])
        self.assertEqual(self.tick(state, T0 + 120, quiet_sample()), [], "said once, measured every 10 min")
        sent = self.tick(state, T0 + 700, quiet_sample(), budgets=[("makaron", 34_500_000_000, 32 * GiB)])
        self.assertTrue(any("预算已超" in m for m in sent))
        sent = self.tick(state, T0 + 1400, quiet_sample(), budgets=[("makaron", 33_330_000_000, 48 * GiB)])
        self.assertTrue(any("回到预算以内" in m for m in sent))
        self.assertTrue(any("余量已恢复" in m for m in sent))

    def test_warns_at_85_percent_of_48_gib(self):
        self.assertEqual(self.tick({}, T0, quiet_sample(), budgets=[("makaron", int(0.84 * 48 * GiB), 48 * GiB)]), [])
        sent = self.tick({}, T0, quiet_sample(), budgets=[("makaron", int(0.86 * 48 * GiB), 48 * GiB)])
        self.assertTrue(any("预算快到了" in m for m in sent))

    def test_plenty_of_headroom_is_quiet(self):
        self.assertEqual(self.tick({}, T0, quiet_sample(), budgets=[("makaron", 33_330_000_000, 48 * GiB)]), [])

    def test_ingress_stall_is_reported(self):
        state = {}
        sent = self.tick(state, T0 + 300, quiet_sample(ingress_stalled=1))
        self.assertEqual(len(sent), 1)
        self.assertIn("claim→adoption stalled", sent[0])
        self.assertEqual(self.tick(state, T0 + 420, quiet_sample(ingress_stalled=2)), [])
        self.assertTrue(any("不再卡在认领" in m for m in self.tick(state, T0 + 540, quiet_sample())))

    def test_budget_exhausted_line_is_reported(self):
        sent = self.tick({}, T0, quiet_sample(budget_exhausted=1))
        self.assertTrue(any("预算已耗尽" in m for m in sent))

    def test_the_journal_counts_feed_the_rules(self):
        line = ("2026-10-15T21:16:48.940+08:00 [feishu] ingress: Channel ingress claim→adoption stalled for "
                "event 5e90 on lane chat:oc_87ec after 300002ms; applying retry policy (handler-timeout).\n"
                "2026-10-15T21:16:48.943+08:00 [feishu] ingress: spooled update 5e90 failed; keeping for retry: "
                "Channel ingress claim→adoption stalled for event 5e90 on lane chat:oc_87ec after 300002ms; "
                "applying retry policy (handler-timeout).")
        with mock.patch.object(mod, "sh", side_effect=lambda cmd, timeout=30: line if "journalctl -u openclaw-gateway --since" in cmd else ""), \
                mock.patch.object(mod, "scan_crashes", return_value=([], "c")), \
                mock.patch.object(mod, "missing_plugin_paths", return_value=[]):
            s = mod.sample()
        self.assertEqual(s["ingress_stalled"], 1, "one event, two lines")
        self.assertEqual(s["budget_exhausted"], 0)


if __name__ == "__main__":
    unittest.main()
