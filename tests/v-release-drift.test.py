#!/usr/bin/env python3
"""find_drift must actually flag drift. A checker that always returns clean is
worse than none, because it converts an unknown into a false assurance."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))

import importlib.util

spec = importlib.util.spec_from_file_location(
    "v_release_drift",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "v-release-drift.py"),
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

RELEASE_ROOT = "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6"
MANIFEST = {
    "release": "v2026.9.1-db91.6",
    "capturedFrom": {"runtimeDir": RELEASE_ROOT + "/core/dist"},
    "files": [
        {"path": "./talk.js", "sha256": "a" * 64},
        {"path": "./state/verify.worker.js", "sha256": "b" * 64},
    ],
    "residue": [{"path": "./talk.js.bak-known"}],
}
CLEAN_LIVE = {"./talk.js": "a" * 64, "./state/verify.worker.js": "b" * 64,
              "./untouched-upstream.js": "c" * 64, "./talk.js.bak-known": "d" * 64}


def run(live, exec_start=None, running=None):
    exec_start = exec_start if exec_start is not None else "ExecStart={ path=/x ; argv[]=/x %s/core/dist/index.js gateway --port 22793 }" % RELEASE_ROOT
    running = running if running is not None else "/x %s/core/dist/index.js gateway --port 22793" % RELEASE_ROOT

    def fake_sh(cmd, timeout=600):
        return exec_start if "systemctl show" in cmd else running

    with mock.patch.object(mod, "sh", fake_sh):
        return mod.find_drift(MANIFEST, live)


class FindDrift(unittest.TestCase):
    def test_clean_tree_reports_nothing(self):
        self.assertEqual(run(CLEAN_LIVE), [])

    def test_patched_in_place_is_flagged(self):
        live = dict(CLEAN_LIVE, **{"./talk.js": "f" * 64})
        self.assertIn(("drifted", "./talk.js"), run(live))

    def test_nested_declared_file_is_checked(self):
        live = dict(CLEAN_LIVE, **{"./state/verify.worker.js": "f" * 64})
        self.assertIn(("drifted", "./state/verify.worker.js"), run(live))

    def test_deleted_file_is_flagged(self):
        live = {k: v for k, v in CLEAN_LIVE.items() if k != "./talk.js"}
        self.assertIn(("gone", "./talk.js"), run(live))

    def test_new_backup_residue_is_flagged(self):
        live = dict(CLEAN_LIVE, **{"./talk.js.predeploy-20260923": "e" * 64})
        self.assertIn(("new-residue", "./talk.js.predeploy-20260923"), run(live))

    def test_residue_already_in_the_manifest_is_not_flagged(self):
        self.assertNotIn("new-residue", [k for k, _ in run(CLEAN_LIVE)])

    def test_untouched_upstream_file_is_not_noise(self):
        # The manifest only declares what diverges from the base install; the
        # thousands of untouched files must not each become a finding.
        self.assertEqual(run(CLEAN_LIVE), [])

    def test_execstart_repointed_without_touching_bytes(self):
        kinds = [k for k, _ in run(CLEAN_LIVE, exec_start="argv[]=/x /opt/openclaw-2026.9.1-v/openclaw/dist/index.js gateway")]
        self.assertIn("execstart-elsewhere", kinds)

    def test_running_process_differs_from_the_unit(self):
        kinds = [k for k, _ in run(CLEAN_LIVE, running="/x /opt/openclaw-experiments/db91-release-v2026.9.1-db91.5/core/dist/index.js gateway --port 22793")]
        self.assertIn("running-process-elsewhere", kinds)


class ResidueClassification(unittest.TestCase):
    def test_known_residue_shapes(self):
        for path in ("./a.js.bak", "./a.js.orig", "./a.conf.staged",
                     "./a.js.bak-owner-terminal-20260922-134058",
                     "./a.js.predeploy-20260918-213202",
                     "./a.js.pre-worker-exec-config-domain-openclaw81-v1"):
            self.assertTrue(mod.is_residue(path), path)

    def test_ordinary_files_are_not_residue(self):
        for path in ("./talk.js", "./db91-read-ahead.mjs", "./control-ui/assets/x.js"):
            self.assertFalse(mod.is_residue(path), path)


class WholeCaptureComponents(unittest.TestCase):
    """Worker and Feishu plugins are captured whole (--base none)."""
    COMPONENT = {
        "release": "v2026.9.1-db91.6.feishu",
        "capturedFrom": {"runtimeDir": "/opt/x/feishu", "baseDir": "none"},
        "files": [{"path": "./dist/monitor.account.js", "sha256": "a" * 64}],
        "residue": [],
    }

    def test_new_module_in_a_whole_capture_is_reported(self):
        live = {"./dist/monitor.account.js": "a" * 64, "./dist/hot-fix.js": "e" * 64}
        self.assertEqual(mod.find_drift(self.COMPONENT, live, check_process=False),
                         [("added", "./dist/hot-fix.js")])

    def test_in_place_edit_of_a_component_is_reported(self):
        live = {"./dist/monitor.account.js": "f" * 64}
        self.assertEqual(mod.find_drift(self.COMPONENT, live, check_process=False),
                         [("drifted", "./dist/monitor.account.js")])

    def test_components_do_not_check_the_gateway_process(self):
        live = {"./dist/monitor.account.js": "a" * 64}
        with mock.patch.object(mod, "sh", side_effect=AssertionError("must not run")):
            self.assertEqual(mod.find_drift(self.COMPONENT, live, check_process=False), [])

    def test_node_modules_is_skipped_when_hashing(self):
        import tempfile
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, "node_modules", "dep"))
            open(os.path.join(root, "node_modules", "dep", "i.js"), "w").write("x")
            open(os.path.join(root, "index.js"), "w").write("y")
            self.assertEqual(sorted(mod.hash_tree(root, ("node_modules",))), ["./index.js"])


class UntouchedUpstreamFilesStayUpstream(unittest.TestCase):
    """2026-09-25 04:01: two bundles that matched upstream at capture time were
    patched in place (GPT-6 backport). The manifest never listed them, so the
    check reported 0 findings. Undeclared files must still equal base."""

    BASE = {"./talk.js": "0" * 64, "./state/verify.worker.js": "1" * 64,
            "./untouched-upstream.js": "c" * 64, "./model-route-contract.js": "9" * 64}

    def test_in_place_edit_of_an_undeclared_upstream_file_is_reported(self):
        live = dict(CLEAN_LIVE, **{"./model-route-contract.js": "8" * 64})
        kinds = run_with_base(live, self.BASE)
        self.assertIn(("drifted-from-base", "./model-route-contract.js"), kinds)

    def test_untouched_upstream_files_are_quiet(self):
        live = dict(CLEAN_LIVE, **{"./model-route-contract.js": "9" * 64})
        self.assertEqual(run_with_base(live, self.BASE), [])

    def test_a_file_that_is_in_neither_manifest_nor_base_is_added(self):
        live = dict(CLEAN_LIVE, **{"./model-route-contract.js": "9" * 64, "./hot-fix.mjs": "7" * 64})
        self.assertIn(("added", "./hot-fix.mjs"), run_with_base(live, self.BASE))


def run_with_base(live, base):
    ok = "argv[]=/x %s/core/dist/index.js gateway --port 22793" % RELEASE_ROOT
    with mock.patch.object(mod, "sh", side_effect=lambda cmd, timeout=600: ok):
        return mod.find_drift(MANIFEST, live, base=base)


class PublishedPackageBase(unittest.TestCase):
    def test_npm_base_is_read_from_the_shipped_inventory(self):
        import tempfile, json as _json
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "openclaw@2026.9.1.json"), "w") as f:
                _json.dump({"base": "npm:openclaw@2026.9.1", "files": {"./a.js": "a" * 64}}, f)
            with mock.patch.object(mod, "BASE_INVENTORY_DIR", d):
                self.assertEqual(mod.base_hashes("npm:openclaw@2026.9.1"), {"./a.js": "a" * 64})

    def test_missing_inventory_means_no_base_check_rather_than_a_crash(self):
        with mock.patch.object(mod, "BASE_INVENTORY_DIR", "/nonexistent"):
            self.assertIsNone(mod.base_hashes("npm:openclaw@2026.9.1"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
