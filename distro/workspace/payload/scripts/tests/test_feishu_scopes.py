import importlib.util, tempfile, unittest
from pathlib import Path
from unittest import mock

spec = importlib.util.spec_from_file_location("feishu_docs_scopes", Path(__file__).parents[1] / "feishu-docs.py")
f = importlib.util.module_from_spec(spec); spec.loader.exec_module(f)

# What a bot app made at install time typically has on (names as `lark-cli auth scopes` reports them).
APP_SCOPES = [*f.REQUIRED_SCOPES, "calendar:calendar.event:create", "calendar:calendar:read", "task:task:write",
              "base:record:create", "sheets:spreadsheet:create", "drive:file:upload", "im:message", "offline_access"]


class LoginScopes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.calls = []

        def lark(*args, timeout=0):
            self.calls.append(args)
            if args[:2] == ("auth", "scopes"):
                return {"userScopes": APP_SCOPES}, None
            if args[:2] == ("auth", "login"):
                return {"verification_uri_complete": "https://example.invalid/verify", "device_code": "dc", "expires_in": 600}, None
            return None, "unexpected"

        patches = [mock.patch.object(f, "lark", lark), mock.patch.object(f, "bound_app", lambda: "cli_test"),
                   mock.patch.object(f.shutil, "which", lambda _n: None),
                   mock.patch.object(f, "AUTH", Path(self.tmp.name) / "feishu-auth.json"),
                   mock.patch.object(f, "QR", Path(self.tmp.name) / "qr.png"),
                   mock.patch.object(f.subprocess, "run", lambda *a, **k: mock.Mock(returncode=1))]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self.tmp.cleanup)

    def requested(self):
        login = [c for c in self.calls if c[:2] == ("auth", "login")][-1]
        return login[login.index("--scope") + 1].split()

    def test_one_login_asks_for_every_user_scope_the_app_has_on(self):
        out = f.start_login()
        self.assertTrue(out["ok"])
        got = self.requested()
        self.assertEqual(set(got), set(APP_SCOPES), "calendar, task, base, sheets, drive and im come in the first login")
        self.assertEqual(got[:len(f.REQUIRED_SCOPES)], list(f.REQUIRED_SCOPES), "the reading scopes lead")
        self.assertEqual(len(got), len(set(got)))
        self.assertNotIn("只申请了读文档", out["tellOwner"])

    def test_scopes_the_app_does_not_have_are_never_requested(self):
        sc = f.check_scopes()
        self.assertTrue(sc["ok"])
        self.assertNotIn("bitable:app", sc["loginScopes"])  # a WRITE_SCOPES name this app does not have on
        self.assertIn("bitable:app", sc["optionalMissing"])  # still reported, so the grant link can add it
        f.start_login(sc["loginScopes"])
        self.assertTrue(set(self.requested()) <= set(APP_SCOPES))


if __name__ == "__main__":
    unittest.main()
