import json, os, subprocess, sys, tempfile, time, unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "temp-preview.py"
FAKE = """#!/bin/sh
# stand-in for cloudflared: announce a quick-tunnel URL, then stay up like the real one
echo "INF |  https://fake-preview-test.trycloudflare.com  |"
exec sleep 600
"""


class TempPreview(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ws = Path(self.tmp.name)
        tools = self.ws / ".tools"
        tools.mkdir()
        (tools / "cloudflared").write_text(FAKE)
        (tools / "cloudflared").chmod(0o755)
        site = self.ws / "site"
        site.mkdir()
        (site / "index.html").write_text("<title>t</title>")
        self.env = {**os.environ, "V_WORKSPACE": str(self.ws), "PATH": "/usr/bin:/bin"}
        self.addCleanup(self.tmp.cleanup)  # cleanups run last-in first-out: stop the previews first
        self.addCleanup(lambda: self.run_cli("stop", "--all", check=False))

    def run_cli(self, *args, check=True):
        p = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, env=self.env, cwd=self.ws)
        if check and p.returncode != 0:
            self.fail(p.stdout + p.stderr)
        return p

    def alive(self, pgid):
        try:
            os.killpg(pgid, 0)
            return True
        except ProcessLookupError:
            return False

    def test_records_the_preview_tells_the_owner_and_closes_when_its_time_is_up(self):
        out = json.loads(self.run_cli("start", "--dir", "site", "--hours", "0.0015", "--purpose", "test page", "--wait", "3").stdout)
        self.assertTrue(out["ok"])
        self.assertEqual(out["url"], "https://fake-preview-test.trycloudflare.com")
        self.assertIn("临时预览链接", out["tellOwner"])
        self.assertIn("自动关掉", out["tellOwner"])
        self.assertIn("stop", out["stop"])
        listed = json.loads(self.run_cli("list").stdout)["open"]
        self.assertEqual([i["id"] for i in listed], [out["id"]])
        self.assertTrue(all(self.alive(g) for g in out["pgids"]))
        time.sleep(9)  # 0.0015 h = 5.4 s, plus the watchdog's one-second tick
        self.assertFalse(any(self.alive(g) for g in out["pgids"]), "the server and the tunnel close by themselves")
        self.assertEqual(json.loads(self.run_cli("list").stdout)["open"], [])

    def test_stop_closes_it_at_once(self):
        out = json.loads(self.run_cli("start", "--dir", "site", "--purpose", "test page", "--wait", "3").stdout)
        self.run_cli("stop", out["id"])
        time.sleep(0.5)
        self.assertFalse(any(self.alive(g) for g in out["pgids"]))
        self.assertEqual(json.loads(self.run_cli("list").stdout)["open"], [])

    def test_without_cloudflared_it_says_so_instead_of_pretending(self):
        (self.ws / ".tools" / "cloudflared").unlink()
        p = self.run_cli("start", "--dir", "site", "--purpose", "test page", check=False)
        self.assertEqual(p.returncode, 3)
        self.assertIn("Vercel 或 Cloudflare", json.loads(p.stdout)["tellOwner"])


if __name__ == "__main__":
    unittest.main()
