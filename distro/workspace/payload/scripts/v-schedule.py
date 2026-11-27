#!/usr/bin/env python3
"""Owner record and scheduled jobs for this V (OpenClaw cron).

This machine serves one owner. Their Feishu open_id is not known at install
time: the onboarding records it from the first trusted DM, and only then can
the system jobs deliver to them.

  owner                       print the recorded owner (exit 1 when none)
  owner --set ou_...          record the owner (refuses to replace another one)
  install [--dry-run]         register every job in schedules.json that is not registered yet
  once --in 1m|--at ISO --name N --prompt P
                              a one-shot isolated turn whose reply goes to the owner
  list                        this agent's jobs (name, schedule, enabled, declaration key)

install is idempotent: each system job carries --declaration-key distro:<key>,
and a key that already exists is left alone, so an owner's edits are never
reverted. The `openclaw` CLI must be on PATH (it talks to the local Gateway).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

WS = Path(__file__).resolve().parent.parent
OWNER_FILE = WS / "onboarding" / "owner.json"
SCHEDULES = WS / "schedules.json"
AGENT_ID = os.environ.get("V_AGENT_ID") or "@@AGENT_ID@@"
TIMEZONE = os.environ.get("V_TIMEZONE") or "@@TIMEZONE@@"
CHANNEL = "feishu"
OPEN_ID = re.compile(r"^ou_[0-9a-zA-Z]{8,}$")


def fail(msg: str, code: int = 2) -> None:
    print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False))
    sys.exit(code)


def read_owner() -> dict | None:
    try:
        d = json.loads(OWNER_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return d if OPEN_ID.match(str(d.get("open_id", ""))) else None


def openclaw(*args: str, timeout: int = 60) -> str:
    if not shutil.which("openclaw"):
        fail("openclaw CLI is not on PATH")
    p = subprocess.run(["openclaw", *args], capture_output=True, text=True, timeout=timeout)
    if p.returncode != 0:
        # The CLI prints the reason on stderr; keep it short and never echo arguments (prompts are long).
        fail(f"openclaw {args[0]} {args[1] if len(args) > 1 else ''} failed: {(p.stderr or p.stdout).strip()[-400:]}")
    return p.stdout


def jobs() -> list[dict]:
    out = openclaw("cron", "list", "--json", "--all", "--agent", AGENT_ID)
    start = out.find("{")
    data = json.loads(out[start:]) if start >= 0 else {}
    return data.get("jobs", []) if isinstance(data, dict) else []


def target(owner: dict) -> list[str]:
    return ["--announce", "--channel", CHANNEL, "--to", f"user:{owner['open_id']}"]


def cmd_owner(a) -> None:
    cur = read_owner()
    if not a.set:
        if not cur:
            fail("no owner recorded yet", 1)
        print(json.dumps({"ok": True, **cur}, ensure_ascii=False))
        return
    if not OPEN_ID.match(a.set):
        fail("expected a Feishu open_id like ou_...")
    if cur and cur["open_id"] != a.set:
        fail("another owner is already recorded; this V serves one owner. Changing it is an install-time decision, not a chat one.")
    rec = cur or {"open_id": a.set, "channel": CHANNEL,
                  "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    OWNER_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = OWNER_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, OWNER_FILE)
    print(json.dumps({"ok": True, **rec}, ensure_ascii=False))


def load_schedules() -> list[dict]:
    items = json.loads(SCHEDULES.read_text(encoding="utf-8"))
    for s in items:
        for k in ("key", "name", "cron", "prompt"):
            if not s.get(k):
                fail(f"schedules.json entry without {k}: {s.get('name') or s.get('key')}")
    return items


def cmd_install(a) -> None:
    owner = read_owner()
    if not owner:
        fail("record the owner first: v-schedule.py owner --set ou_...", 1)
    existing = {j.get("declarationKey") for j in ([] if a.dry_run and not shutil.which("openclaw") else jobs())}
    added, kept = [], []
    for s in load_schedules():
        key = f"distro:{s['key']}"
        if key in existing:
            kept.append(s["name"])
            continue
        args = ["cron", "add", "--json", "--agent", AGENT_ID, "--name", s["name"], "--declaration-key", key,
                "--cron", s["cron"], "--tz", s.get("tz") or TIMEZONE, "--session", "isolated",
                "--message", s["prompt"], *target(owner)]
        if s.get("description"):
            args += ["--description", s["description"]]
        if s.get("timeoutSeconds"):
            args += ["--timeout-seconds", str(s["timeoutSeconds"])]
        if s.get("thinking"):
            args += ["--thinking", s["thinking"]]
        if s.get("enabled") is False:
            args.append("--disabled")
        if a.dry_run:
            added.append(s["name"])
            continue
        openclaw(*args)
        added.append(s["name"])
    print(json.dumps({"ok": True, "dryRun": a.dry_run, "added": added, "alreadyRegistered": kept}, ensure_ascii=False))


def cmd_once(a) -> None:
    owner = read_owner()
    if not owner:
        fail("record the owner first: v-schedule.py owner --set ou_...", 1)
    when = ["--at", a.at] if a.at else ["--at", a.within]
    openclaw("cron", "add", "--json", "--agent", AGENT_ID, "--name", a.name, *when, "--delete-after-run",
             "--session", "isolated", "--message", a.prompt, *target(owner))
    print(json.dumps({"ok": True, "name": a.name, "at": a.at or a.within}, ensure_ascii=False))


def cmd_list(_a) -> None:
    rows = [{"id": j.get("id"), "name": j.get("name"), "enabled": j.get("enabled"),
             "schedule": j.get("schedule"), "declarationKey": j.get("declarationKey")} for j in jobs()]
    print(json.dumps({"ok": True, "jobs": rows}, ensure_ascii=False, indent=1))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    o = sub.add_parser("owner"); o.add_argument("--set"); o.set_defaults(fn=cmd_owner)
    i = sub.add_parser("install"); i.add_argument("--dry-run", action="store_true"); i.set_defaults(fn=cmd_install)
    n = sub.add_parser("once"); g = n.add_mutually_exclusive_group(required=True)
    g.add_argument("--in", dest="within", help="duration such as 1m or 20m")
    g.add_argument("--at", help="ISO time with offset")
    n.add_argument("--name", required=True); n.add_argument("--prompt", required=True); n.set_defaults(fn=cmd_once)
    sub.add_parser("list").set_defaults(fn=cmd_list)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
