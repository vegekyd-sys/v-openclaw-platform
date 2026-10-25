#!/usr/bin/env python3
"""The installer must put the routing rule into V's AGENTS.md exactly once, in the
reviewed place, keep every other byte, and be undoable. AGENTS.md is the file every
harness injects; a duplicated or misplaced rule is read by every V turn."""
import contextlib
import importlib.util
import io
import json
import os
import shutil
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("install_v_system_diagnosis", os.path.join(HERE, "..", "scripts", "install-v-system-diagnosis.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

AGENTS = """# AGENTS.md — Makaron Workspace Entry Point

## Behavior Norms

### Resource-Aware Execution
- heavy work goes to a compute node

### Real-Time Progress Updates
- announce slow tasks

## Scripts
"""


class Installer(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.ws = os.path.join(self.dir, "workspace")
        os.makedirs(os.path.join(self.ws, "skills", "makaron"))
        self.agents = os.path.join(self.ws, "AGENTS.md")
        with open(self.agents, "w", encoding="utf-8") as f:
            f.write(AGENTS)
        self.backups = os.path.join(self.dir, "backups")

    def tearDown(self):
        shutil.rmtree(self.dir)

    def run_main(self, *extra):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = mod.main(["--workspace", self.ws, "--backup-dir", self.backups, *extra])
        return code, json.loads(out.getvalue())

    def text(self):
        with open(self.agents, encoding="utf-8") as f:
            return f.read()

    def test_check_changes_nothing(self):
        code, report = self.run_main("--check")
        self.assertEqual(code, 0)
        self.assertTrue(report["agentsMd"]["changed"])
        self.assertEqual(self.text(), AGENTS)
        self.assertFalse(os.path.exists(os.path.join(self.ws, "skills", mod.SKILL_NAME)))
        self.assertFalse(os.path.exists(self.backups))

    def test_install_inserts_block_before_anchor_and_copies_skill(self):
        code, report = self.run_main()
        self.assertEqual(code, 0)
        text = self.text()
        self.assertEqual(text.count(mod.BEGIN), 1)
        self.assertLess(text.index("### Resource-Aware Execution"), text.index(mod.BEGIN))
        self.assertLess(text.index(mod.END), text.index(mod.ANCHOR))
        self.assertIn("skills/v-system-diagnosis/SKILL.md", text)
        # Everything outside the block is byte-identical.
        self.assertEqual(mod.without_block(text), AGENTS)
        skill = os.path.join(self.ws, "skills", mod.SKILL_NAME, "SKILL.md")
        with open(skill, encoding="utf-8") as f:
            self.assertTrue(f.read().startswith("---\nname: v-system-diagnosis\n"))
        with open(os.path.join(report["backup"], "AGENTS.md"), encoding="utf-8") as f:
            self.assertEqual(f.read(), AGENTS)

    def test_second_run_is_a_no_op(self):
        self.run_main()
        first = self.text()
        code, report = self.run_main()
        self.assertEqual(code, 0)
        self.assertFalse(report["agentsMd"]["changed"])
        self.assertFalse(report["skill"]["changed"])
        self.assertNotIn("backup", report)
        self.assertEqual(self.text(), first)

    def test_changed_block_is_replaced_in_place(self):
        self.run_main()
        stale = self.text().replace("先读 `skills/v-system-diagnosis/SKILL.md`", "OLD WORDING")
        with open(self.agents, "w", encoding="utf-8") as f:
            f.write(stale)
        code, report = self.run_main()
        self.assertEqual(code, 0)
        self.assertTrue(report["agentsMd"]["changed"])
        text = self.text()
        self.assertNotIn("OLD WORDING", text)
        self.assertEqual(text.count(mod.BEGIN), 1)
        self.assertEqual(mod.without_block(text), AGENTS)

    def test_uninstall_restores_original_bytes(self):
        self.run_main()
        code, report = self.run_main("--uninstall")
        self.assertEqual(code, 0)
        self.assertEqual(self.text(), AGENTS)
        self.assertFalse(os.path.exists(os.path.join(self.ws, "skills", mod.SKILL_NAME)))
        self.assertTrue(os.path.isfile(os.path.join(report["backup"], "skill", "SKILL.md")))

    def test_missing_or_duplicate_anchor_refuses(self):
        for text in (AGENTS.replace(mod.ANCHOR, "### Something Else"), AGENTS + mod.ANCHOR + "\n"):
            with open(self.agents, "w", encoding="utf-8") as f:
                f.write(text)
            with self.assertRaises(SystemExit):
                self.run_main()
            self.assertEqual(self.text(), text)

    def test_refuses_to_push_agents_md_over_bootstrap_limit(self):
        big = AGENTS.replace("## Scripts", "x" * (mod.BOOTSTRAP_MAX_CHARS - len(AGENTS)) + "\n## Scripts")
        with open(self.agents, "w", encoding="utf-8") as f:
            f.write(big)
        code, report = self.run_main()
        self.assertEqual(code, 2)
        self.assertIn("bootstrap limit", report["error"])
        self.assertEqual(self.text(), big)

    def test_block_fits_on_v_today(self):
        # V's AGENTS.md was 13137 chars on 2026-10-25; the rule must leave it well under the limit.
        block = mod.render_block()
        self.assertLess(13137 + len(block), mod.BOOTSTRAP_MAX_CHARS)
        self.assertLess(len(block), 1200)


if __name__ == "__main__":
    unittest.main()
