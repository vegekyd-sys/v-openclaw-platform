#!/usr/bin/env python3
"""The data-disk controller spends money. It must buy only under pressure, only under
the caps, size the disk from the growth it measured, back off and stop after failed
orders (v1 retried 116 times without anyone hearing), and grow ext4 after any resize."""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts", "v-storage"))
spec = importlib.util.spec_from_file_location("autogrow", os.path.join(HERE, "..", "scripts", "v-storage", "autogrow.py"))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)

GIB = a.GIB
DAY = a.DAY
P = dict(a.DEFAULTS)
EXPIRES = "2026-12-06T02:52:48Z"
T0 = 1795700000  # 2026-11-26, nine days before expiry


class Pure(unittest.TestCase):
    def test_growth_uses_default_until_a_day_of_samples(self):
        s = {}
        a.record_sample(s, T0, 300 * GIB)
        self.assertEqual(a.growth_per_day(s, T0, P), 7.0)
        for h in range(1, 49):
            a.record_sample(s, T0 + h * 3600, (300 + h * 0.25) * GIB)
        self.assertAlmostEqual(a.growth_per_day(s, T0 + 48 * 3600, P), 6.0, places=3)

    def test_samples_are_hourly_and_bounded(self):
        s = {}
        for m in range(0, 20 * DAY, 300):
            a.record_sample(s, T0 + m, 1)
        self.assertEqual(len(s["samples"]), 14 * 24)

    def test_trigger_and_target(self):
        # 400 GiB disk, 7 GiB/day: trigger at max(100, 147, 30) = 147 GiB free
        self.assertEqual(a.trigger_free_gib(400, 7, P), 147)
        # used 340: need max(340/0.7=485.7, 340+315=655, 370) -> 660
        self.assertEqual(a.target_size_gib(400, 340, 7, P), 660)
        # slow growth: the 30% buffer decides
        self.assertEqual(a.target_size_gib(400, 340, 0.5, P), 490)

    def test_cost_is_prorated_to_expiry(self):
        cost = a.order_cost(0.35, 260, T0, a.parse_time(EXPIRES))
        self.assertTrue(20 < cost < 30, cost)

    def test_spend_caps(self):
        s = {}
        self.assertIsNone(a.spend_check(s, T0, 30, P, 660))
        self.assertIn("单次", a.spend_check(s, T0, 150, P, 660))
        self.assertIn("上限", a.spend_check(s, T0, 30, P, 1300))
        s["spent"] = {a.month_key(T0): 180}
        self.assertIn("本月", a.spend_check(s, T0, 30, P, 660))
        s["approved_gib"] = 700
        self.assertIsNone(a.spend_check(s, T0, 30, P, 660))

    def test_backoff_then_pause(self):
        s = {}
        self.assertEqual(a.note_failure(s, T0), 1)
        self.assertEqual(s["next_attempt"], T0 + 3600)
        self.assertFalse(a.may_attempt(s, T0 + 3599))
        self.assertTrue(a.may_attempt(s, T0 + 3600))
        a.note_failure(s, T0)
        self.assertEqual(s["next_attempt"], T0 + 4 * 3600)
        a.note_failure(s, T0)
        self.assertTrue(s["paused"])
        self.assertFalse(a.may_attempt(s, T0 + 10 * DAY))

    def test_v1_state_is_dropped(self):
        s = {"sample": 1, "high_usage": 1, "target": 500, "started": 1, "attempt": 2}
        self.assertTrue(a.migrate_v1(s))
        self.assertEqual(s, {})
        self.assertFalse(a.migrate_v1({"target": 500, "ordered_at": 1}))


class Tick(unittest.TestCase):
    def setUp(self):
        tmp = self.enterContext(tempfile.TemporaryDirectory())
        self.enterContext(mock.patch.object(a, "STATE_DIR", a.Path(tmp)))
        self.size, self.used, self.fs = 400, 345, 400
        self.cloud = 400
        self.alerts, self.orders = [], []
        self.fail = None
        self.enterContext(mock.patch.object(a, "local_status", side_effect=lambda: (
            self.size, self.used * GIB, (self.fs - self.used) * GIB)))
        self.enterContext(mock.patch.object(a, "filesystem_gib", side_effect=lambda: self.fs))
        self.enterContext(mock.patch.object(a, "notify", side_effect=lambda t: self.alerts.append(t) or True))
        self.enterContext(mock.patch.object(a, "remote_disk", side_effect=lambda: {
            "DiskSize": self.cloud, "DiskState": "ATTACHED", "ExpiredTime": EXPIRES, "RenewFlag": "NOTIFY_AND_AUTO_RENEW"}))
        self.enterContext(mock.patch.object(a, "per_gib_month", return_value=(0.35, 140.0)))
        self.grown = []
        self.enterContext(mock.patch.object(a, "grow_filesystem", side_effect=lambda t: self.grown.append(t)))

        def resize(target):
            if self.fail:
                raise RuntimeError(self.fail)
            self.orders.append(target)
            return "req-1"
        self.enterContext(mock.patch.object(a, "resize", side_effect=resize))
        self.state = {}

    def run_ticks(self, start, n, step=300):
        out = None
        for i in range(n):
            out = a.tick(self.state, start + i * step, P)
        return out

    def test_buys_once_after_sustained_pressure_then_grows_fs(self):
        self.run_ticks(T0, 3)  # 10 minutes: not yet
        self.assertEqual(self.orders, [])
        st = self.run_ticks(T0 + 900, 1)
        self.assertEqual(len(self.orders), 1)
        self.assertTrue(st["action"].startswith("ordered"))
        target = self.orders[0]
        self.assertGreater(target, 400)
        self.assertLessEqual(target, P["cap_gib"])
        self.run_ticks(T0 + 1200, 3)  # waiting: no second order
        self.assertEqual(len(self.orders), 1)
        self.size = self.cloud = target
        st = self.run_ticks(T0 + 2400, 1)
        self.assertEqual(self.grown, [target])
        self.assertNotIn("target", self.state)
        self.assertEqual(sum("已自动扩容" in t for t in self.alerts), 1)
        self.assertEqual(sum("已扩到" in t for t in self.alerts), 1)

    def test_no_pressure_no_order(self):
        self.used = 100
        st = self.run_ticks(T0, 10)
        self.assertEqual(self.orders, [])
        self.assertEqual(st["action"], "ok")

    def test_failed_order_backs_off_alerts_and_pauses(self):
        self.fail = "ResizeDisks: FailedOperation.ResizeDisksFailed"
        self.run_ticks(T0, 4)  # first attempt at +900
        self.assertEqual(self.state["failures"], 1)
        self.run_ticks(T0 + 1200, 11)  # within the hour: no retry
        self.assertEqual(self.state["failures"], 1)
        self.run_ticks(T0 + 4500, 1)  # one hour after the first: second attempt
        self.assertEqual(self.state["failures"], 2)
        self.run_ticks(T0 + 4800, 12 * 5)  # four hours later: third, then paused
        self.assertTrue(self.state["paused"])
        self.run_ticks(T0 + 4800 + 12 * 5 * 300, 12 * 48)  # two more days of ticks
        self.assertEqual(self.state["failures"], 3)
        self.assertEqual(sum("失败" in t for t in self.alerts), 3)
        self.assertTrue(any("已暂停" in t for t in self.alerts))

    def test_over_cap_asks_instead_of_buying(self):
        self.used = 1150
        self.size = self.fs = self.cloud = 1200
        st = self.run_ticks(T0, 5)
        self.assertEqual(self.orders, [])
        self.assertEqual(st["action"], "at cap")
        self.assertEqual(sum("上限" in t for t in self.alerts), 1)

    def test_expensive_order_needs_approval(self):
        with mock.patch.object(a, "per_gib_month", return_value=(3.5, 1400.0)):
            st = self.run_ticks(T0, 5)
        self.assertEqual(self.orders, [])
        self.assertEqual(st["action"], "needs approval")
        self.state["approved_gib"] = st["targetGiB"]
        with mock.patch.object(a, "per_gib_month", return_value=(3.5, 1400.0)):
            self.run_ticks(T0 + 1500, 1)
        self.assertEqual(len(self.orders), 1)

    def test_device_bigger_than_filesystem_is_grown(self):
        self.size, self.fs = 500, 400
        self.used = 100
        self.run_ticks(T0, 1)
        self.assertEqual(self.grown, [500])


if __name__ == "__main__":
    unittest.main()
