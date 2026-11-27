#!/usr/bin/env python3
"""The flow monitor must stay quiet while hot data keeps draining and cost is in budget,
and speak up when the system disk is filling, the data disk will hit its cap, a mover
stops, a category that should drain keeps growing, cost goes over budget, or autogrow
goes silent."""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts", "v-storage"))
spec = importlib.util.spec_from_file_location("flow", os.path.join(HERE, "..", "scripts", "v-storage", "flow.py"))
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)

GB, DAY = f.GB, f.DAY
NOW = 1795800000
P = f.load_policy.__wrapped__() if hasattr(f.load_policy, "__wrapped__") else json.loads(json.dumps(f.DEFAULTS))


def rec(day, t0_used, t1_used=300 * GB, cats=None, t2=None):
    return {"at": NOW - day * DAY, "t0": {"size": 570 * GB, "used": t0_used, "free": 570 * GB - t0_used},
            "t1": {"size": 420 * GB, "used": t1_used, "free": 420 * GB - t1_used},
            "t2": t2, "cats": cats or {}}


AUTOGROW = {"at": NOW - 60, "sizeGiB": 600, "capGiB": 1200, "perGiBMonthCNY": 0.35}


class Flow(unittest.TestCase):
    def keys(self, history, current, autogrow=AUTOGROW, policy=P, movers=None):
        cost = f.monthly_cost(current, autogrow, policy)
        return [k for k, _ in f.problems(current, history, autogrow, policy, NOW, cost, movers or {})]

    def test_quiet_when_flat(self):
        hist = [rec(d, 400 * GB) for d in range(7, 0, -1)]
        self.assertEqual(self.keys(hist, rec(0, 400 * GB)), [])

    def test_system_disk_filling(self):
        hist = [rec(d, (400 + (7 - d) * 10) * GB, cats={"agents": (100 + (7 - d) * 8) * GB}) for d in range(7, 0, -1)]
        cur = rec(0, 470 * GB, cats={"agents": 156 * GB})
        found = dict(f.problems(cur, hist, AUTOGROW, P, NOW, f.monthly_cost(cur, AUTOGROW, P), {}))
        self.assertIn("t0-full", found)
        self.assertIn("agents", found["t0-full"])

    def test_data_disk_heading_for_cap(self):
        hist = [rec(d, 400 * GB, t1_used=(1000 + (7 - d) * 30) * GB) for d in range(7, 0, -1)]
        self.assertIn("t1-cap", self.keys(hist, rec(0, 400 * GB, t1_used=1210 * GB)))

    def test_autogrow_silent_or_broken(self):
        cur = rec(0, 400 * GB)
        self.assertIn("autogrow-silent", self.keys([], cur, autogrow=None))
        self.assertIn("autogrow-silent", self.keys([], cur, autogrow=dict(AUTOGROW, at=NOW - 3600)))
        self.assertIn("autogrow-broken", self.keys([], cur, autogrow=dict(AUTOGROW, paused=True)))

    def test_stale_mover_and_undrained_category(self):
        policy = dict(P, movers={"v-archive": {"unit": "v-archive.service"}}, drain={"output-alt": "v-archive"})
        hist = [rec(d, 400 * GB, cats={"output-alt": (50 + (14 - d) * 2) * GB}) for d in range(14, 0, -1)]
        cur = rec(0, 400 * GB, cats={"output-alt": 78 * GB})
        keys = self.keys(hist, cur, policy=policy, movers={"v-archive": NOW - 3 * DAY})
        self.assertIn("mover-v-archive", keys)
        self.assertIn("drain-output-alt", keys)
        self.assertNotIn("mover-v-archive", self.keys(hist, cur, policy=policy, movers={"v-archive": NOW - 3600}))

    def test_cost_and_budget(self):
        cur = rec(0, 400 * GB, t2={"ARCHIVE": 1000 * GB, "STANDARD": 100 * GB})
        cost = f.monthly_cost(cur, AUTOGROW, P, image_count=7)
        self.assertEqual(cost["disk"], 210.0)
        self.assertEqual(cost["cos"], 45.0)
        self.assertEqual(cost["images"], 14.4)
        self.assertNotIn("budget", self.keys([], cur))
        self.assertIn("budget", self.keys([], cur, autogrow=dict(AUTOGROW, sizeGiB=1200)))

    def test_work_archive_receipts_count_only_moved(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "work-archive-20261127.tsv").write_text(
                "path\tbytes\tfiles\tnewest_mtime\tdest\tresult\n/a\t100\t1\t0\t/x\tmoved\n/b\t50\t1\t0\t/y\tskipped\n")
            Path(tmp, "work-archive-20261123.tsv").write_text("name\tbytes\tfiles\tnewest_mtime\tdest\nc\t7\t1\t0\t/z\n")
            with mock.patch.object(f, "WORK_ARCHIVE_RECEIPTS", Path(tmp)), \
                    mock.patch.object(f, "ARCHIVE_RECEIPTS", Path(tmp, "none")), \
                    mock.patch.object(f, "GOVERNANCE_DELETIONS", Path(tmp, "none")):
                self.assertEqual(f.receipts_since(0), {"T0->T1": 107})

    def test_summary_mentions_every_tier(self):
        cur = rec(0, 400 * GB)
        with mock.patch.object(f, "receipts_since", return_value={}):
            text = f.summary(cur, [rec(1, 395 * GB)], AUTOGROW, f.monthly_cost(cur, AUTOGROW, P), P, NOW)
        for word in ("T0", "T1", "T2", "月成本"):
            self.assertIn(word, text)


if __name__ == "__main__":
    unittest.main()
