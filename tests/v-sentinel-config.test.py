#!/usr/bin/env python3
"""The sentinel's config checks must flag the 2026-10-09 failure.

That day work/v-ha-xiaoai was deleted while both config files still listed
openclaw-plugin-respeaker-bridge under plugins.load.paths. The Worker file is
validated on every request (48 turns failed in 22 minutes); the main file was
equally invalid but would only have failed at the next Gateway start.
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

GONE = "/home/openclaw/makaron-openclaw/.openclaw-local/workspace/work/v-ha-xiaoai/openclaw-plugin-respeaker-bridge"
INVALID_LINE = ("2026-10-09T14:38:45.622+08:00 [plugins] Worker Agent request failed runId=7228e33e "
                "sessionKey=agent:makaron:feishu:direct:ou_95e4 elapsedMs=149 error=InvalidConfigError:"
                "Invalid config at /home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json:")
OTHER_LINE = ("[plugins] Worker Agent request failed runId=abc sessionKey=agent:makaron:feishu:group:oc_1 "
              "elapsedMs=120000 error=Error: worker exited")
EXECSTART = ("{ path=/opt/node-v22.23.1/bin/node ; argv[]=/opt/node-v22.23.1/bin/node "
             "--experimental-async-context-frame --inspect=127.0.0.1:9229 --max-old-space-size=12288 "
             "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/index.js gateway --port 22793 ; "
             "ignore_errors=no ; start_time=[n/a] }")


class ConfigChecks(unittest.TestCase):
    def write(self, d, paths):
        p = os.path.join(d, "openclaw.json")
        with open(p, "w") as f:
            json.dump({"plugins": {"load": {"paths": paths}}}, f)
        return p

    def test_deleted_plugin_dir_is_reported(self):
        with tempfile.TemporaryDirectory() as d:
            present = os.path.join(d, "plugin-present")
            os.mkdir(present)
            p = self.write(d, [present, GONE])
            self.assertEqual(mod.missing_plugin_paths(p), [GONE])

    def test_all_present_is_clean(self):
        with tempfile.TemporaryDirectory() as d:
            present = os.path.join(d, "plugin-present")
            os.mkdir(present)
            self.assertEqual(mod.missing_plugin_paths(self.write(d, [present])), [])

    def test_unreadable_config_is_none_not_clean(self):
        self.assertIsNone(mod.missing_plugin_paths("/nonexistent/openclaw.json"))

    def test_worker_failures_split_out_invalid_config(self):
        self.assertEqual(mod.scan_worker_failures("\n".join([INVALID_LINE, OTHER_LINE, "noise"])), (2, 1))
        self.assertEqual(mod.scan_worker_failures("noise"), (0, 0))

    def test_cli_comes_from_the_running_unit(self):
        with mock.patch.object(mod, "sh", return_value=EXECSTART):
            self.assertEqual(mod.gateway_cli(), (
                "/opt/node-v22.23.1/bin/node",
                "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/index.js"))

    def test_validator_verdicts(self):
        cli = ("/n", "/i.js")
        bad = ("OpenClaw config is invalid: ~/.openclaw/openclaw.json\n"
               "  × plugins.load.paths: plugin: plugin path not found: %s\nrc=1" % GONE)
        with mock.patch.object(mod, "sh", return_value=bad):
            ok, why = mod.validate_config("/x.json", cli)
            self.assertFalse(ok)
            self.assertIn("plugin path not found", why)
        with mock.patch.object(mod, "sh", return_value="20 warning(s):\n  ! something\nrc=0"):
            self.assertEqual(mod.validate_config("/x.json", cli), (True, ""))
        # a validator timeout says nothing about the file
        with mock.patch.object(mod, "sh", return_value="rc=124"):
            self.assertEqual(mod.validate_config("/x.json", cli), (True, ""))

    def test_message_builder_tolerates_a_clean_config(self):
        # main() builds the text every tick; on 2026-10-09 the first draft
        # indexed missing[0] on a clean config and crashed the sentinel.
        self.assertEqual(mod.config_missing_message("worker 配置", "/w.json", [], "x"), "")
        self.assertIn("/w.json", mod.config_missing_message("worker 配置", "/w.json", None, "x"))
        self.assertIn(GONE, mod.config_missing_message("worker 配置", "/w.json", [GONE], "x"))


if __name__ == "__main__":
    unittest.main()
