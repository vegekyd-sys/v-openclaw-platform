"""Rule-layer tests for sentinel.py, driven with synthetic samples.

    python3 -m unittest discover -s scripts/v-sentinel -p 'test_*.py'

Nothing here touches systemd, the journal or Feishu: sample() is replaced by a
fixture, feishu() by a collector and STATE_PATH by a temp file, exactly as the
README describes for verifying a change without breaking production.
"""
import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def load_sentinel():
    spec = importlib.util.spec_from_file_location("sentinel_under_test", os.path.join(HERE, "sentinel.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reading(**overrides):
    base = {
        "mode": "worker", "pool": 5, "active": "active", "nrestarts": "0", "gw_up_s": 7200,
        "closing": 0, "stall": 0, "complete": 3, "cutoff": 0, "cutoff_ids": [], "cutoff_cause": "",
        "received": 3, "crash_lines": [], "journal_cursor": "c1", "disk_mb": 50000, "mem_mb": 8000,
    }
    base.update(overrides)
    return base


class SentinelRules(unittest.TestCase):
    def setUp(self):
        self.s = load_sentinel()
        self.tmp = tempfile.TemporaryDirectory()
        self.s.STATE_PATH = os.path.join(self.tmp.name, "state.json")
        self.sent = []
        self.s.feishu = lambda text: self.sent.append(text) or True
        self.s.MODE_OVERRIDE = ""

    def tearDown(self):
        self.tmp.cleanup()

    def run_with(self, sample):
        self.sent.clear()
        self.s.sample = lambda cursor=None: dict(sample)
        with contextlib.redirect_stdout(io.StringIO()):
            self.s.main()
        return list(self.sent)

    def test_worker_mode_empty_pool_still_alerts_once(self):
        alerts = self.run_with(reading(pool=0))
        self.assertEqual(len(alerts), 1)
        self.assertIn("Worker 池空了", alerts[0])
        self.assertEqual(self.run_with(reading(pool=0)), [])
        recovered = self.run_with(reading(pool=5))
        self.assertEqual(len(recovered), 1)
        self.assertIn("Worker 池已恢复", recovered[0])

    def test_no_worker_mode_empty_pool_is_expected(self):
        for _ in range(3):
            self.assertEqual(self.run_with(reading(mode="no-worker", pool=0)), [])

    def test_switch_to_no_worker_clears_pool_latch_without_a_false_recovery(self):
        self.assertEqual(len(self.run_with(reading(pool=0))), 1)
        sent = self.run_with(reading(mode="no-worker", pool=0))
        self.assertEqual(len(sent), 1)
        self.assertIn("no-worker 模式", sent[0])
        self.assertNotIn("Worker 池已恢复", sent[0])
        self.assertEqual(self.run_with(reading(mode="no-worker", pool=0)), [])
        with open(self.s.STATE_PATH) as f:
            state = json.load(f)
        self.assertFalse(state["pool_empty"])

    def test_switch_back_to_worker_mode_rearms_the_pool_rule(self):
        self.run_with(reading(mode="no-worker", pool=0))
        sent = self.run_with(reading(mode="worker", pool=0))
        self.assertEqual(len(sent), 2)
        self.assertTrue(any("Worker 池空了" in m for m in sent))
        self.assertTrue(any("Worker 池检查重新启用" in m for m in sent))

    def test_other_rules_still_fire_in_no_worker_mode(self):
        self.assertEqual(len(self.run_with(reading(mode="no-worker", pool=0, active="failed"))), 1)
        self.run_with(reading(mode="no-worker", pool=0, stall=9))
        sent = self.run_with(reading(mode="no-worker", pool=0, stall=9))
        self.assertTrue(any("卡住" in m and "no-worker" in m for m in sent), sent)
        self.assertFalse(any("Worker 池" in m for m in sent), sent)

    def test_pool_closing_is_ignored_in_no_worker_mode(self):
        self.assertEqual(self.run_with(reading(mode="no-worker", pool=0, closing=3)), [])


class ModeDetection(unittest.TestCase):
    def setUp(self):
        self.s = load_sentinel()
        self.s.MODE_OVERRIDE = ""
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def config(self, value):
        path = os.path.join(self.tmp.name, "openclaw.json")
        with open(path, "w") as f:
            if isinstance(value, str):
                f.write(value)
            else:
                json.dump(value, f)
        return path

    def test_worker_plugin_enabled_is_worker_mode(self):
        cfg = {"plugins": {"entries": {"vlab-agent-worker-isolation": {"enabled": True, "config": {}}}}}
        self.assertTrue(self.s.worker_mode(self.config(cfg)))

    def test_converted_config_is_no_worker_mode(self):
        cfg = {
            "plugins": {"entries": {
                "vlab-agent-worker-isolation": {"enabled": False},
                "versa-runtime-providers": {"enabled": True},
            }},
            "agents": {"defaults": {"models": {"deepseek/deepseek-v4-pro": {"agentRuntime": {"id": "openclaw"}}}}},
        }
        self.assertFalse(self.s.worker_mode(self.config(cfg)))

    def test_a_remaining_worker_route_keeps_worker_mode(self):
        cfg = {
            "plugins": {"entries": {"vlab-agent-worker-isolation": {"enabled": False}}},
            "models": {"providers": {"deepseek": {"agentRuntime": {"id": "vlab-worker"}}}},
        }
        self.assertTrue(self.s.worker_mode(self.config(cfg)))

    def test_unreadable_config_keeps_the_stricter_worker_rules(self):
        self.assertTrue(self.s.worker_mode(os.path.join(self.tmp.name, "missing.json")))
        self.assertTrue(self.s.worker_mode(self.config("{ not json")))

    def test_environment_override_wins(self):
        cfg = self.config({"plugins": {"entries": {"vlab-agent-worker-isolation": {"enabled": True}}}})
        self.s.MODE_OVERRIDE = "no-worker"
        self.assertFalse(self.s.worker_mode(cfg))
        self.s.MODE_OVERRIDE = "worker"
        self.assertTrue(self.s.worker_mode(self.config({"plugins": {"entries": {}}})))


if __name__ == "__main__":
    unittest.main()
