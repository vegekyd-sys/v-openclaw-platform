#!/usr/bin/env python3
"""The daily image job must keep three good images, never power V off, and never
delete an image it did not create or the only good copy while a new one is not
ready. A backup job that silently deletes its backups is worse than none."""
import importlib.util
import os
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("v_daily_image", os.path.join(HERE, "..", "scripts", "v-daily-image.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def img(day, state="NORMAL", bid=None):
    return {"BlueprintName": mod.PREFIX + day, "BlueprintId": bid or "lhbp-" + day, "BlueprintState": state,
            "CreatedTime": day}


class Plan(unittest.TestCase):
    def test_first_run_creates_and_deletes_nothing(self):
        self.assertEqual(mod.plan([], "20261001", 4), ("v-daily-20261001", [], []))

    def test_keeps_newest_three_after_creating(self):
        imgs = [img("20260928"), img("20260929"), img("20260930")]
        create, before, after = mod.plan(imgs, "20261001", 1)
        self.assertEqual(create, "v-daily-20261001")
        self.assertEqual(before, [])
        self.assertEqual(after, ["lhbp-20260928"])  # only the oldest, and only after today's lands

    def test_already_done_today_only_prunes(self):
        imgs = [img("20260927"), img("20260928"), img("20260929"), img("20261001")]
        create, before, after = mod.plan(imgs, "20261001", 1)
        self.assertIsNone(create)
        self.assertEqual(after, ["lhbp-20260927"])
        self.assertNotIn("lhbp-20261001", after)

    def test_out_of_free_quota_makes_room_from_a_full_set(self):
        imgs = [img("20260928"), img("20260929"), img("20260930")]
        create, before, after = mod.plan(imgs, "20261001", 0)
        self.assertEqual(before, ["lhbp-20260928"])
        self.assertEqual(after, [])

    def test_out_of_quota_with_few_images_deletes_nothing_first(self):
        imgs = [img("20260930")]
        _, before, after = mod.plan(imgs, "20261001", 0)
        self.assertEqual((before, after), ([], []))

    def test_a_failed_image_does_not_count_toward_the_three_kept(self):
        # Counting it would delete a good image to make room for a broken one.
        imgs = [img("20260928"), img("20260929"), img("20260930", "CREATEFAILED")]
        _, _, after = mod.plan(imgs, "20261001", 1)
        self.assertEqual(after, ["lhbp-20260930"])

    def test_failed_leftovers_are_cleaned_but_creating_ones_are_not_counted(self):
        imgs = [img("20260929"), img("20260930", "CREATEFAILED"), img("20261001", "CREATING")]
        create, before, after = mod.plan(imgs, "20261001", 2)
        self.assertIsNone(create)  # today's is in progress; do not start a second
        self.assertEqual(after, ["lhbp-20260930"])


class Run(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.images = [img("20260928"), img("20260929"), img("20260930")]
        self.new_state = "NORMAL"
        self.inst_states = ["RUNNING", "RUNNING"]

    def fake_call(self, action, payload, **_):
        self.calls.append((action, payload))
        if action == "DescribeBlueprints" and "BlueprintIds" in payload:
            return {"BlueprintSet": [{"BlueprintState": self.new_state}]}
        if action == "DescribeBlueprints":
            others = [{"BlueprintName": "V-work-loss-freeze-20260930", "BlueprintId": "lhbp-incident",
                       "BlueprintState": "NORMAL"}]
            page = self.images + others
            return {"BlueprintSet": page, "TotalCount": len(page)}
        if action == "DescribeGeneralResourceQuotas":
            return {"GeneralResourceQuotaSet": [{"ResourceQuotaAvailable": 1}]}
        if action == "DescribeInstances":
            return {"InstanceSet": [{"InstanceState": self.inst_states.pop(0)}]}
        if action == "CreateBlueprint":
            return {"BlueprintId": "lhbp-new"}
        if action == "DeleteBlueprints":
            return {}
        raise AssertionError(action)

    def go(self, check=False):
        with mock.patch.object(mod, "call", self.fake_call), \
             mock.patch.object(mod.datetime, "datetime", wraps=mod.datetime.datetime) as dt, \
             mock.patch.object(mod.time, "sleep", lambda s: None):
            dt.now.return_value = mod.datetime.datetime(2026, 10, 1, 5, 20, tzinfo=mod.TZ)
            return mod.run(check)

    def actions(self, name):
        return [p for a, p in self.calls if a == name]

    def test_creates_online_then_prunes_only_ours(self):
        self.assertEqual(self.go(), (0, None))
        (create,) = self.actions("CreateBlueprint")
        self.assertIs(create["ForcePowerOff"], False)
        self.assertEqual(create["BlueprintName"], "v-daily-20261001")
        deleted = [i for p in self.actions("DeleteBlueprints") for i in p["BlueprintIds"]]
        self.assertEqual(deleted, ["lhbp-20260928"])
        self.assertNotIn("lhbp-incident", deleted)

    def test_check_mode_changes_nothing(self):
        self.go(check=True)
        self.assertEqual(self.actions("CreateBlueprint") + self.actions("DeleteBlueprints"), [])

    def test_failed_image_keeps_old_ones(self):
        self.new_state = "CREATEFAILED"
        code, problem = self.go()
        self.assertEqual(code, 1)
        self.assertIn("没有完成", problem)
        self.assertEqual(self.actions("DeleteBlueprints"), [])

    def test_does_not_image_a_stopped_instance(self):
        self.inst_states = ["STOPPED"]
        self.inst_states.append("STOPPED")
        code, problem = self.go()
        self.assertEqual(code, 1)
        self.assertEqual(self.actions("CreateBlueprint"), [])

    def test_instance_not_running_after_image_is_an_alert(self):
        self.inst_states = ["RUNNING", "STOPPED"]
        code, problem = self.go()
        self.assertEqual(code, 1)
        self.assertIn("立刻检查", problem)
        self.assertEqual(self.actions("DeleteBlueprints"), [])


class Alert(unittest.TestCase):
    def test_failure_alerts_once_per_day(self):
        sent = []
        fake_sentinel = mock.MagicMock(feishu=lambda t: sent.append(t) or True)
        state = {}
        with mock.patch.dict(sys.modules, {"sentinel": fake_sentinel}), \
             mock.patch.object(mod, "run", lambda check: (1, "boom")), \
             mock.patch.object(mod, "load_state", lambda: dict(state)), \
             mock.patch.object(mod, "save_state", lambda s: state.update(s)), \
             mock.patch.object(sys, "argv", ["x"]):
            self.assertEqual(mod.main(), 1)
            self.assertEqual(mod.main(), 1)
        self.assertEqual(len(sent), 1)
        self.assertIn("每日镜像失败", sent[0])

    def test_exception_becomes_alert(self):
        sent = []
        fake_sentinel = mock.MagicMock(feishu=lambda t: sent.append(t) or True)

        def boom(check):
            raise RuntimeError("DescribeBlueprints: AuthFailure")
        with mock.patch.dict(sys.modules, {"sentinel": fake_sentinel}), \
             mock.patch.object(mod, "run", boom), \
             mock.patch.object(mod, "load_state", lambda: {}), \
             mock.patch.object(mod, "save_state", lambda s: None), \
             mock.patch.object(sys, "argv", ["x"]):
            self.assertEqual(mod.main(), 1)
        self.assertIn("AuthFailure", sent[0])


if __name__ == "__main__":
    unittest.main()
