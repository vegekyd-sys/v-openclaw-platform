#!/usr/bin/env python3
"""The Night Shift check must alert on each failure it exists for, once, and
report recovery. The fixtures are the failures seen on V on 2026-09-23/24."""
import copy
import importlib.util
import os
import sys
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
        s["active"]["DL-0923-05"] = True
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
        self.assertIn("重试次数已用完", lines[0])

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
        self.assertIn("付费任务还在执行", lines[0])

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

    def test_approval_cards_are_business_flow_not_alerts(self):
        # 2026-09-30: three approval cards in ready were reported as undispatched.
        state = {}
        run(state, base())
        s = base()
        s["live_cards"] = [{"id": "0c93fd70-%d" % i, "status": "ready", "updated": NOW - 200 * MIN, "exec_updated": None,
                            "failures": 0, "max_retries": None, "instance": "GEE-TIMED-PUB-20260925",
                            "item": "ref%d" % i, "stage": "produce", "approval": True} for i in (1, 2, 3)]
        self.assertEqual(run(state, s), [])

    def test_stale_ready_cards_of_one_project_are_one_block(self):
        state = {}
        run(state, base())
        s = base()
        s["live_cards"] = [{"id": "s%d" % i, "status": "ready", "updated": NOW - 200 * MIN, "exec_updated": None,
                            "failures": 0, "max_retries": 2, "instance": "GEE-TIMED-PUB-20260925",
                            "item": "v%d" % i, "stage": "brief"} for i in (1, 2)]
        lines = run(state, s)
        self.assertEqual(len(lines), 1)
        self.assertIn("v2 / brief 已等 3 小时 20 分", lines[0])
        self.assertIn("→ 多半是调度器的问题", lines[0])
        self.assertIn("project=GEE-TIMED-PUB-20260925", lines[0])

    def test_stuck_threshold_follows_the_stage(self):
        # Healthy paid renders go quiet for up to ~100 minutes.
        state = {}
        run(state, base())
        card = {"id": "p1", "status": "running", "updated": NOW - 90 * MIN, "exec_updated": NOW - 90 * MIN,
                "failures": 0, "max_retries": 2, "instance": "GEE-TIMED-PUB-20260925", "item": "x", "stage": "produce"}
        s = base()
        s["live_cards"] = [card]
        self.assertEqual(run(state, s), [])
        s["live_cards"] = [dict(card, exec_updated=NOW - 125 * MIN)]
        lines = run(state, s)
        self.assertEqual(len(lines), 1)
        self.assertIn("2 小时 5 分 没有进展（这个阶段按 120 分钟算异常）", lines[0])
        s["live_cards"] = [dict(card, id="b1", stage="publish", exec_updated=NOW - 45 * MIN)]
        self.assertEqual(len(run(state, s)), 1)

    def test_blocked_says_why_and_skips_work_a_person_sent_back(self):
        state = {}
        run(state, base())
        s = base()
        s["blocked"] = [
            {"instance": "GEE-TIMED-PUB-20260925", "item": "r1", "stage": "review", "card": "c1", "kind": "?",
             "summary": "", "paid": None, "verdict": "changes_requested"},
            {"instance": "GEE-TIMED-PUB-20260925", "item": "r2", "stage": "brief", "card": "c2",
             "kind": "gateway_unavailable", "summary": "", "paid": None, "verdict": None},
            {"instance": "GEE-TIMED-PUB-20260925", "item": "r3", "stage": "publish", "card": "c3",
             "kind": "contract_error", "summary": "Artifact path must stay inside", "paid": None, "verdict": None},
            {"instance": "PAUSED-PROJECT", "item": "r4", "stage": "brief", "card": "c4",
             "kind": "agent_error", "summary": "", "paid": None, "verdict": None},
        ]
        lines = run(state, s)
        self.assertEqual(len(lines), 1)
        self.assertNotIn("r1", lines[0])
        self.assertNotIn("r4", lines[0])
        self.assertIn("r2 / brief：基础设施或上游临时故障 [gateway_unavailable] → 通常直接重试就行", lines[0])
        self.assertIn("r3 / publish：产物没通过交付校验 → 要人看一下（Artifact path must stay inside）", lines[0])

    def test_paid_failure_and_one_report_per_paid_item(self):
        state = {}
        run(state, base())
        s = base()
        s["blocked"] = [
            {"instance": "GEE-TIMED-PUB-20260925", "item": "f1", "stage": "publish", "card": "c1", "kind": "contract_error",
             "summary": "", "paid": "failed", "verdict": None},
            {"instance": "GEE-TIMED-PUB-20260925", "item": "e1", "stage": "produce", "card": "c2", "kind": "contract_error",
             "summary": "", "paid": "executing", "verdict": None},
        ]
        s["paid_executing"] = [{"key": "k1", "instance": "GEE-TIMED-PUB-20260925", "item": "e1", "task": "t1"}]
        lines = run(state, s)
        self.assertEqual(len(lines), 1, "the paid item is reported once, in its blocked line")
        self.assertIn("f1 / publish：付费任务失败了", lines[0])
        self.assertIn("e1 / produce：付费任务已发出，但成功记录没回写（付费=executing）→ 先核对外部任务，别重试", lines[0])

    def test_failed_send_keeps_the_old_state(self):
        failing = base()
        failing["health"]["lastSchedulerError"] = "gateway closed (1006): "
        saved = []
        with mock.patch.object(mod, "sample", return_value=failing), \
                mock.patch.object(mod, "load_state", return_value={"baseline": True, "seen": [], "service_runs": 1}), \
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

    def test_only_a_service_that_stays_broken_reaches_the_group(self):
        state = {}
        self.assertEqual(mod.service_alert(state, "夜班 health=false"), [], "one pass is a Gateway restart")
        self.assertEqual(mod.service_alert(state, None), [], "recovered before anyone was told")
        mod.service_alert(state, "夜班服务 inactive")
        sent = mod.service_alert(state, "夜班服务 inactive")
        self.assertEqual(len(sent), 1)
        self.assertIn("夜班服务 inactive", sent[0])
        self.assertEqual(mod.service_alert(state, "夜班服务 inactive"), [], "said once while it persists")
        self.assertIn("已恢复", mod.service_alert(state, None)[0])

    def test_card_findings_are_logged_not_sent(self):
        sample = base()
        sample["blocked"] = [{"card": "c1", "instance": "GEE-TIMED-PUB-20260925", "item": "a1",
                              "stage": "produce", "kind": "agent_error"}]
        sender = mock.Mock(feishu=mock.Mock(return_value=True))
        with mock.patch.object(mod, "sample", return_value=sample), \
                mock.patch.object(mod, "load_state", return_value={"baseline": True, "seen": []}), \
                mock.patch.object(mod, "save_state"), \
                mock.patch.dict(sys.modules, {"sentinel": sender}), \
                mock.patch("builtins.print") as printed:
            self.assertEqual(mod.main([]), 0)
        sender.feishu.assert_not_called()
        self.assertTrue(any("有内容停住了" in str(c) for c in printed.call_args_list))


if __name__ == "__main__":
    unittest.main()
