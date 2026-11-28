import json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

SRC = Path(__file__).parents[1] / "v-schedule.py"
# Stand-in for the `openclaw` CLI: jobs live in $FAKE_CRON; add / edit / rm change them, every call is logged.
FAKE = r'''#!/usr/bin/env python3
import json, os, sys
state = os.environ["FAKE_CRON"]
jobs = json.load(open(state)) if os.path.exists(state) else []
a = sys.argv[1:]
open(state + ".log", "a").write(json.dumps(a[:2] + a[2:3]) + "\n")
def opt(name):
    return a[a.index(name) + 1] if name in a else None
if a[:2] == ["cron", "list"]:
    print(json.dumps({"jobs": jobs}))
elif a[:2] == ["cron", "add"]:
    jobs.append({"id": "j%d" % len(jobs), "declarationKey": opt("--declaration-key"), "name": opt("--name"),
                 "description": opt("--description"), "enabled": "--disabled" not in a,
                 "schedule": {"kind": "cron", "expr": opt("--cron")},
                 "payload": {"kind": "agentTurn", "message": opt("--message"), "timeoutSeconds": opt("--timeout-seconds")}})
elif a[:2] == ["cron", "edit"]:
    j = next(j for j in jobs if j["id"] == a[2])
    j.update(name=opt("--name"), description=opt("--description"), enabled="--enable" in a)
    j["schedule"]["expr"] = opt("--cron")
    j["payload"].update(message=opt("--message"), timeoutSeconds=opt("--timeout-seconds"))
elif a[:2] == ["cron", "rm"]:
    jobs = [j for j in jobs if j["id"] != a[2]]
json.dump(jobs, open(state, "w"))
'''


def spec(key, prompt, cron="0 9 * * *"):
    return {"key": key, "name": f"job {key}", "cron": cron, "prompt": prompt, "timeoutSeconds": 600, "enabled": True}


class InstallWithBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.ws = root / "ws"
        (self.ws / "scripts").mkdir(parents=True)
        (self.ws / "onboarding").mkdir()
        shutil.copy(SRC, self.ws / "scripts" / "v-schedule.py")
        (self.ws / "onboarding" / "owner.json").write_text(json.dumps({"open_id": "ou_aaaaaaaaaaaaaaaa"}))
        bin_ = root / "bin"
        bin_.mkdir()
        (bin_ / "openclaw").write_text(FAKE)
        (bin_ / "openclaw").chmod(0o755)
        self.state = root / "cron.json"
        self.env = {**os.environ, "PATH": f"{bin_}:{os.environ['PATH']}", "FAKE_CRON": str(self.state),
                    "V_AGENT_ID": "test-v", "V_TIMEZONE": "Asia/Shanghai"}

    def install(self, items, *extra):
        (self.ws / "schedules.json").write_text(json.dumps(items, ensure_ascii=False))
        p = subprocess.run([sys.executable, str(self.ws / "scripts" / "v-schedule.py"), "install", *extra],
                           capture_output=True, text=True, env=self.env)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        return json.loads(p.stdout)

    def jobs(self):
        return {j["declarationKey"]: j for j in json.loads(self.state.read_text())}

    def test_unchanged_jobs_follow_the_new_file_and_owner_edits_are_kept(self):
        old = [spec("a", "old a"), spec("b", "old b"), spec("gone", "old gone"), spec("gone-edited", "old ge")]
        self.install(old)
        # the owner changes b's time and gone-edited's prompt by hand
        jobs = json.loads(self.state.read_text())
        for j in jobs:
            if j["declarationKey"] == "distro:b":
                j["schedule"]["expr"] = "30 7 * * *"
            if j["declarationKey"] == "distro:gone-edited":
                j["payload"]["message"] = "owner's own words"
        self.state.write_text(json.dumps(jobs))
        base = Path(self.tmp.name) / "old-schedules.json"
        base.write_text(json.dumps(old, ensure_ascii=False))
        new = [spec("a", "new a"), spec("b", "new b"), spec("c", "new c")]
        out = self.install(new, "--base", str(base))
        live = self.jobs()
        self.assertEqual(out["updated"], ["job a"])
        self.assertEqual(live["distro:a"]["payload"]["message"], "new a")
        self.assertEqual(live["distro:b"]["schedule"]["expr"], "30 7 * * *", "the owner's edit is kept")
        self.assertEqual(live["distro:b"]["payload"]["message"], "old b")
        self.assertEqual(sorted(out["ownerChanged"]), ["job b", "job gone-edited"])
        self.assertEqual(out["added"], ["job c"])
        self.assertEqual(out["removed"], ["job gone"])
        self.assertNotIn("distro:gone", live)
        self.assertIn("distro:gone-edited", live, "a job the owner changed is not removed")

    def test_without_base_existing_jobs_are_left_alone(self):
        self.install([spec("a", "old a")])
        out = self.install([spec("a", "new a")])
        self.assertEqual(out["updated"], [])
        self.assertEqual(self.jobs()["distro:a"]["payload"]["message"], "old a")


if __name__ == "__main__":
    unittest.main()
