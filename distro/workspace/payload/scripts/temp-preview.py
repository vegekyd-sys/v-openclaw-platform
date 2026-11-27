#!/usr/bin/env python3
"""Temporary public preview links: a local server plus a Cloudflare quick tunnel, closed automatically.

Only for previews, when the owner has no Vercel or Cloudflare account yet (TOOLS.md "公网链接").
Every preview is recorded in .v/previews.json in the workspace and closes itself after --hours
(default 24); close it earlier with `stop` once the owner has confirmed the delivery.
Never use it for pages with customer or internal material: send the files instead.

  start --dir <folder> | --port <port>  [--hours 24] --purpose "<what and for whom>"
  list                                  previews still open (closed ones are pruned)
  stop <id> | --all                     close now

The tunnel needs `cloudflared` on PATH (or at .tools/cloudflared in the workspace). Without it,
`start` exits 3 and says so: tell the owner and send the files.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

WS = Path(os.environ.get("V_WORKSPACE") or Path(__file__).resolve().parents[1])
STATE = WS / ".v" / "previews.json"
LOGS = WS / ".v" / "previews"
URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
TELL = ("这是临时预览链接，只用来先看看效果，{until} 会自动关掉（你确认没问题后我也会提前关）。"
        "要长期能打开的正式链接，需要你补 Vercel 或 Cloudflare 账号。")


def now() -> datetime:
    return datetime.now(timezone.utc).astimezone()


def load() -> list[dict]:
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def save(items: list[dict]) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(STATE)


def alive(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def close(pgid: int) -> None:
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(pgid, sig)
        except ProcessLookupError:
            return
        for _ in range(20):
            if not alive(pgid):
                return
            time.sleep(0.1)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def cloudflared() -> str | None:
    local = WS / ".tools" / "cloudflared"
    return shutil.which("cloudflared") or (str(local) if local.is_file() and os.access(local, os.X_OK) else None)


def supervise(hours: float, cmd: list[str], log: Path) -> int:
    """Start cmd in its own session under a watchdog that ends the whole group after `hours`."""
    watchdog = [sys.executable, str(Path(__file__).resolve()), "_run", "--hours", str(hours), "--", *cmd]
    with open(log, "ab") as out:
        p = subprocess.Popen(watchdog, stdout=out, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                             start_new_session=True, cwd=WS)
    return p.pid  # session leader, so also the process group id


def cmd_run(a) -> None:
    cmd = a.cmd[1:] if a.cmd[:1] == ["--"] else a.cmd
    child = subprocess.Popen(cmd)
    deadline = time.time() + a.hours * 3600
    while child.poll() is None and time.time() < deadline:
        time.sleep(1)
    if child.poll() is None:
        child.terminate()
        try:
            child.wait(10)
        except subprocess.TimeoutExpired:
            child.kill()


def cmd_start(a) -> None:
    if not a.purpose.strip():
        sys.exit("--purpose is required: say what the page is and who it is for")
    binary = cloudflared()
    if not binary:
        print(json.dumps({"ok": False, "error": "no-cloudflared",
                          "tellOwner": "我这里没法生成临时预览链接，先把文件发给你；要能直接打开的链接，需要你补 Vercel 或 Cloudflare 账号。"},
                         ensure_ascii=False))
        sys.exit(3)
    LOGS.mkdir(parents=True, exist_ok=True)
    pid = f"p{int(time.time())}{os.getpid() % 1000:03d}"
    groups = []
    port = a.port
    if a.dir:
        folder = Path(a.dir).resolve()
        if not (folder / "index.html").is_file():
            sys.exit(f"{folder}/index.html not found")
        port = free_port()
        groups.append(supervise(a.hours, [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1",
                                          "--directory", str(folder)], LOGS / f"{pid}-server.log"))
    tlog = LOGS / f"{pid}-tunnel.log"
    groups.append(supervise(a.hours, [binary, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{port}"], tlog))
    url = None
    for _ in range(int(a.wait * 2)):
        m = URL_RE.search(tlog.read_text(encoding="utf-8", errors="replace")) if tlog.exists() else None
        if m:
            url = m.group(0)
            break
        time.sleep(0.5)
    if not url:
        for g in groups:
            close(g)
        print(json.dumps({"ok": False, "error": "no-url", "log": str(tlog)}, ensure_ascii=False))
        sys.exit(1)
    status = None
    for _ in range(int(a.wait)):
        try:
            with urllib.request.urlopen(url, timeout=5) as r:
                status = r.status
                break
        except Exception:
            time.sleep(1)
    until = now() + timedelta(hours=a.hours)
    item = {"id": pid, "url": url, "port": port, "dir": a.dir, "purpose": a.purpose, "pgids": groups,
            "started": now().isoformat(timespec="seconds"), "expires": until.isoformat(timespec="seconds")}
    save([*[i for i in load() if any(alive(g) for g in i.get("pgids", []))], item])
    print(json.dumps({"ok": True, **item, "httpStatus": status, "record": str(STATE),
                      "stop": f"python3 scripts/temp-preview.py stop {pid}",
                      "tellOwner": TELL.format(until=until.strftime("%m-%d %H:%M"))}, ensure_ascii=False))


def cmd_list(_a) -> None:
    items = [i for i in load() if any(alive(g) for g in i.get("pgids", []))]
    save(items)
    print(json.dumps({"open": items, "record": str(STATE)}, ensure_ascii=False))


def cmd_stop(a) -> None:
    items = load()
    hit = [i for i in items if a.all or i["id"] == a.id]
    if not hit:
        sys.exit(f"no preview {a.id}")
    for i in hit:
        for g in i.get("pgids", []):
            close(g)
    save([i for i in items if i not in hit])
    print(json.dumps({"stopped": [i["id"] for i in hit]}, ensure_ascii=False))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="action", required=True)
    s = sub.add_parser("start")
    src = s.add_mutually_exclusive_group(required=True)
    src.add_argument("--dir")
    src.add_argument("--port", type=int)
    s.add_argument("--hours", type=float, default=24.0)
    s.add_argument("--purpose", required=True)
    s.add_argument("--wait", type=float, default=30.0, help="seconds to wait for the tunnel URL and a first 200")
    s.set_defaults(fn=cmd_start)
    sub.add_parser("list").set_defaults(fn=cmd_list)
    st = sub.add_parser("stop")
    st.add_argument("id", nargs="?")
    st.add_argument("--all", action="store_true")
    st.set_defaults(fn=cmd_stop)
    r = sub.add_parser("_run")
    r.add_argument("--hours", type=float, required=True)
    r.add_argument("cmd", nargs=argparse.REMAINDER)
    r.set_defaults(fn=cmd_run)
    a = ap.parse_args()
    if a.action == "stop" and not (a.id or a.all):
        ap.error("stop needs an id or --all")
    a.fn(a)


if __name__ == "__main__":
    main()
