#!/usr/bin/env python3
"""The Night Shift check must alert on each failure it exists for, once, and
report recovery. The fixtures are the failures seen on V on 2026-09-23/24."""
import copy
import datetime
import importlib.util
import io
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("v_nightshift_check", os.path.join(HERE, "..", "scripts", "v-nightshift-check.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

NOW = 1_790_300_000_000
MIN = 60_000
HEALTHY = {"ok": True, "lastSchedulerError": None, "dispatchPressure": {
    "dispatchAllowed": True, "targetMaxActive": 6,
    "agentDbPressure": {"enabled": True, "level": "green", "coordinatorTimeouts": 0, "interactiveTimeouts": 0,
                        "slowAdmissions": 0, "userHarm": False, "reason": None, "at": "2026-09-25T10:39:41Z"}}}


def base():
    return {"now_ms": NOW, "unit": "active", "health": copy.deepcopy(HEALTHY), "health_error": None,
            "active": {"GEE-TIMED-PUB-20260925": True}, "faults": [], "blocked": [], "live_cards": [],
            "paid_executing": [], "board_cards": 2550}


def run(state, sample):
    service, brake, issues = mod.evaluate(sample)
    return mod.decide(state, service, brake, issues)


class NightShiftCheck(unittest.TestCase):
    def test_first_run_is_a_baseline(self):
        s = base()
        s["blocked"] = [{"instance": "GEE-TIMED-PUB-20260923-R8", "item": "rec1", "stage": "publish", "card": "87189a1a",
                         "kind": "contract_error", "summary": "no succeeded checkpoint", "paid": "executing"}]
        state = {}
        self.assertEqual(run(state, s), [])
        self.assertTrue(state["baseline"])
        self.assertEqual(run(state, s), [])

    def test_scheduler_failing_every_pass_alerts_once_then_recovery(self):
        # 2026-09-24 03:39-10:05: service active, Gateway healthy, every pass 1006.
        state = {}
        run(state, base())
        failing = base()
        failing["health"]["lastSchedulerError"] = "gateway closed (1006): "
        lines = run(state, failing)
        self.assertEqual(len(lines), 1)
        self.assertIn("1006", lines[0])
        self.assertEqual(run(state, failing), [])
        self.assertEqual(len(run(state, failing)), 0)
        recovered = run(state, base())
        self.assertEqual(len(recovered), 1)
        self.assertIn("已恢复", recovered[0])

    def test_stopped_service_and_unreachable_endpoint(self):
        state = {}
        run(state, base())
        down = base()
        down["unit"] = "inactive"
        self.assertIn("inactive", run(state, down)[0])
        unreachable = base()
        unreachable["health"] = None
        unreachable["health_error"] = "Connection refused"
        self.assertIn("Connection refused", run(state, unreachable)[0])

    def test_new_blocked_card_alerts_once_with_paid_status(self):
        state = {}
        run(state, base())
        s = base()
        s["blocked"] = [{"instance": "DL-0923-05", "item": "yt-dl-0923-05-05", "stage": "produce", "card": "d0826a54",
                         "kind": "contract_error", "summary": "External side effect has no succeeded checkpoint", "paid": "executing"}]
        lines = run(state, s)
        self.assertEqual(len(lines), 1)
        self.assertIn("付费=executing", lines[0])
        self.assertEqual(run(state, s), [])

    def test_retried_card_past_its_retry_budget(self):
        # 2026-09-24: failureCount 3 > maxRetries 2, the board never started it.
        state = {}
        run(state, base())
        s = base()
        s["live_cards"] = [{"id": "e8ce3422-83d3", "status": "ready", "updated": NOW - 2 * MIN, "exec_updated": None,
                            "failures": 3, "max_retries": 2, "instance": "GEE-TIMED-PUB-20260925", "item": "x"}]
        lines = run(state, s)
        self.assertEqual(len(lines), 1)
        self.assertIn("重试预算已用尽", lines[0])

    def test_stale_ready_needs_dispatch_allowed_and_an_active_project(self):
        state = {}
        run(state, base())
        stale = {"id": "c1", "status": "ready", "updated": NOW - 50 * MIN, "exec_updated": None, "failures": 0,
                 "max_retries": 2, "instance": "GEE-TIMED-PUB-20260925", "item": "x"}
        s = base()
        s["live_cards"] = [stale]
        self.assertEqual(len(run(state, s)), 1)

        state = {}
        run(state, base())
        held = base()
        held["health"]["dispatchPressure"]["dispatchAllowed"] = False
        held["live_cards"] = [stale]
        self.assertEqual(run(state, held), [], "a braked scheduler is not a stuck card")
        paused = base()
        paused["live_cards"] = [dict(stale, instance="DL-0923-03")]
        self.assertEqual(run(state, paused), [], "paused projects are not watched")

    def test_running_card_without_execution_updates(self):
        state = {}
        run(state, base())
        s = base()
        s["live_cards"] = [{"id": "r1", "status": "running", "updated": NOW - 60 * MIN, "exec_updated": NOW - 45 * MIN,
                            "failures": 0, "max_retries": 2, "instance": "GEE-TIMED-PUB-20260925", "item": "x"}]
        lines = run(state, s)
        self.assertEqual(len(lines), 1)
        self.assertIn("45 分钟", lines[0])

    def test_paid_operation_is_quiet_while_its_card_still_runs(self):
        # 2026-09-23: a paid card looked failed while its Agent was still working.
        state = {}
        run(state, base())
        s = base()
        s["paid_executing"] = [{"key": "nightshift:abc", "instance": "GEE-TIMED-PUB-20260925", "item": "yt-05-05", "task": "t1"}]
        s["live_cards"] = [{"id": "p1", "status": "running", "updated": NOW, "exec_updated": NOW, "failures": 0,
                            "max_retries": 2, "instance": "GEE-TIMED-PUB-20260925", "item": "yt-05-05"}]
        self.assertEqual(run(state, s), [])
        s["live_cards"] = []
        lines = run(state, s)
        self.assertEqual(len(lines), 1)
        self.assertIn("付费操作 executing", lines[0])

    def test_lease_brake_reports_each_change_with_its_reading(self):
        state = {}
        self.assertEqual(run(state, base()), [], "green at start says nothing")
        red = base()
        red["health"]["dispatchPressure"]["targetMaxActive"] = 3
        red["health"]["dispatchPressure"]["agentDbPressure"].update(
            level="red", coordinatorTimeouts=2, interactiveTimeouts=2, userHarm=True,
            reason="2 Agent DB lease timeout(s) in 120s, 2 in a person's conversation")
        lines = run(state, red)
        self.assertEqual(len(lines), 1)
        self.assertIn("green → red", lines[0])
        self.assertIn('"interactiveTimeouts": 2', lines[0])
        self.assertIn('"targetMaxActive": 3', lines[0])
        self.assertEqual(run(state, red), [])
        back = run(state, base())
        self.assertEqual(len(back), 1)
        self.assertIn("red → green", back[0])

    def test_board_size_and_fault(self):
        state = {}
        run(state, base())
        s = base()
        s["board_cards"] = 6838
        s["faults"] = [("GEE-TIMED-PUB-20260925", '{"operation":"snapshot"}')]
        lines = run(state, s)
        self.assertEqual(len(lines), 2)

    def test_failed_send_keeps_the_old_state(self):
        failing = base()
        failing["health"]["lastSchedulerError"] = "gateway closed (1006): "
        saved = []
        with mock.patch.object(mod, "sample", return_value=failing), \
                mock.patch.object(mod, "load_state", return_value={"baseline": True, "seen": []}), \
                mock.patch.object(mod, "save_state", side_effect=saved.append), \
                mock.patch.dict(sys.modules, {"sentinel": mock.Mock(feishu=mock.Mock(return_value=False))}):
            self.assertEqual(mod.main([]), 2)
        self.assertEqual(saved, [], "an alert that did not go out must be retried next run")

    def test_check_mode_sends_nothing(self):
        failing = base()
        failing["unit"] = "inactive"
        sender = mock.Mock(feishu=mock.Mock(return_value=True))
        with mock.patch.object(mod, "sample", return_value=failing), \
                mock.patch.object(mod, "save_state") as save, \
                mock.patch.dict(sys.modules, {"sentinel": sender}), \
                mock.patch("builtins.print"):
            self.assertEqual(mod.main(["--check"]), 1)
        sender.feishu.assert_not_called()
        save.assert_not_called()


class SampleTimeWindows(unittest.TestCase):
    """Exercise the real read-only SQL, not just prefiltered rule fixtures."""
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.ns_path = os.path.join(directory.name, "nightshift.sqlite")
        self.wb_path = os.path.join(directory.name, "workboard.sqlite")
        self.ns = sqlite3.connect(self.ns_path)
        self.addCleanup(self.ns.close)
        self.ns.executescript("""
            create table instances (id text, status text);
            create table instance_controls (instance_id text, automatic_dispatch integer, fault_json text);
            create table content_item_runs (instance_id text, content_item_id text, stage_id text,
                card_id text, failure_json text, summary text, status text, updated_at text);
            create table stage_runs (instance_id text, stage_id text, card_id text,
                failure_json text, summary text, status text, updated_at text);
            create table external_operations (idempotency_key text, instance_id text, content_item_id text,
                stage_id text, external_task_id text, status text, updated_at text);
        """)
        with sqlite3.connect(self.wb_path) as wb:
            wb.executescript("""
                create table workboard_cards (id text, board_id text, archived_at integer, status text,
                    updated_at integer, execution_updated_at integer, failure_count integer, automation_json text);
                create table workboard_card_labels (card_id text, label text);
            """)
        self.now = datetime.datetime(2026, 9, 30, 12, tzinfo=datetime.timezone.utc)

    def sample(self):
        self.ns.commit()
        with mock.patch.object(mod, "NS_DB", self.ns_path), mock.patch.object(mod, "WB_DB", self.wb_path), \
                mock.patch.object(mod, "sh", return_value="active"), \
                mock.patch.object(mod.urllib.request, "urlopen", return_value=io.StringIO(json.dumps(HEALTHY))):
            return mod.sample(int(self.now.timestamp() * 1000))

    def paid(self, key, timestamp):
        self.ns.execute("insert into external_operations values (?, 'project', ?, 'publish', 'task', 'executing', ?)",
                        (key, key, timestamp))

    def blocked(self, table, card, timestamp):
        columns = "instance_id, stage_id, card_id, status, updated_at"
        self.ns.execute("insert into %s (%s) values ('project', 'produce', ?, 'blocked', ?)" % (table, columns),
                        (card, timestamp))

    def test_paid_iso_timestamp_within_same_day_is_not_missed(self):
        self.paid("stale", "2026-09-30T10:59:59.999Z")
        self.paid("boundary", "2026-09-30T11:00:00.000Z")
        self.paid("recent", "2026-09-30T11:00:00.001Z")
        sampled = self.sample()
        self.assertEqual([op["key"] for op in sampled["paid_executing"]], ["stale"])
        self.assertIn("paid:stale", mod.evaluate(sampled)[2])

    def test_paid_window_crosses_midnight(self):
        self.now = self.now.replace(hour=0, minute=30)
        self.paid("stale", "2026-09-29T23:29:59.999Z")
        self.paid("recent", "2026-09-29T23:40:00.000Z")
        self.assertEqual([op["key"] for op in self.sample()["paid_executing"]], ["stale"])

    def test_paid_sqlite_format_and_timezone_offsets(self):
        self.paid("sql-stale", "2026-09-30 10:59:00")
        self.paid("offset-stale", "2026-09-30T18:59:00+08:00")
        self.paid("offset-recent", "2026-09-30T19:01:00+08:00")
        self.assertEqual([op["key"] for op in self.sample()["paid_executing"]], ["sql-stale", "offset-stale"])

    def test_blocked_window_for_both_run_tables(self):
        for table in ["content_item_runs", "stage_runs"]:
            self.blocked(table, table + "-old", "2026-09-29T11:59:59.999Z")
            self.blocked(table, table + "-boundary", "2026-09-29T12:00:00.000Z")
            self.blocked(table, table + "-recent", "2026-09-29T12:00:00.001Z")
        self.assertEqual({card["card"] for card in self.sample()["blocked"]},
                         {"content_item_runs-recent", "stage_runs-recent"})


if __name__ == "__main__":
    unittest.main()
