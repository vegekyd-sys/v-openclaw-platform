#!/usr/bin/env python3
"""Let V restart its own Gateway, optionally with config changes. Runs on V.

On 2026-10-06 V shipped a plugin update and then spent half an hour failing to
restart itself. It asked the OpenClaw system agent, which raises an approval
card; the card is bound to the turn that asked, so it was cancelled the moment
V finished its reply, one second before Tianyi clicked it. Three config writes
before that were approved and silently not applied: the running Gateway still
had the old plugin's schema, which rejects the new key. V does have sudo, but
the Claude Code process it runs in lives inside the Gateway's cgroup, so
"stop; write config; start" typed into a turn kills itself at "stop" and leaves
production down with nobody to start it again.

This is the procedure that worked by hand that day, as one command:

    sudo v-self-restart --reason "load PR #231" --requested-by "Tianyi in group" \\
        --chat oc_xxx --session-key agent:makaron:feishu:group:oc_xxx \\
        [--set plugins.entries.x.config.targets=@/tmp/targets.json] [--then "next step"]

The request validates every --set with `openclaw config set --dry-run`, then
hands itself to a transient systemd unit (outside the Gateway's cgroup) and
returns. That unit waits --delay seconds so V can finish its reply, stops the
Gateway, backs up the config, applies the sets, clears Codex app-server
registrations left by the dead Gateway, starts it, and waits for
"[gateway] ready". If the Gateway does not come back it restores the config
backup and starts again. The result goes straight to the Feishu chat (not
through the Gateway), and the requesting session is woken with a summary.

    v-self-restart --check ...     validate only; change nothing
    v-self-restart --status [ID]   print the last (or given) run record

Every path and name has a V default and a V_SELF_RESTART_* override, so the
same code runs against a private candidate Gateway on VLab.
"""
import argparse
import datetime
import json
import os
import re
import secrets
import shlex
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

TZ = datetime.timezone(datetime.timedelta(hours=8))  # Asia/Shanghai, no DST


def env(name, default):
    return os.environ.get("V_SELF_RESTART_" + name, default)


UNIT = env("UNIT", "openclaw-gateway.service")
CONFIG = env("CONFIG", "/home/openclaw/.openclaw/openclaw.json")
STATE_DB = env("STATE_DB", "/home/openclaw/.openclaw/state/openclaw.sqlite")
RUN_AS = env("RUN_AS", "openclaw")
RUN_AS_HOME = env("RUN_AS_HOME", "/home/openclaw")
OPENCLAW = env("OPENCLAW", "/usr/local/bin/openclaw")
STATE_DIR = env("STATE_DIR", "/var/lib/v-self-restart")
AGENT = env("AGENT", "makaron")

READY_MARK = "[gateway] ready"
# One restart at a time, and not in a loop: a second request inside this window
# needs --force. A Gateway that keeps needing restarts needs a person.
MIN_INTERVAL_S = 600
DEFAULT_DELAY_S = 30
# Measured ready times on V: 1m51s (2026-10-06 00:53), 3m05s (15:56, of which the
# db91 integrity preflight was 2m13s). 9.x cold starts have taken up to 16 min.
DEFAULT_READY_TIMEOUT_S = 1200
STOP_TIMEOUT_S = 120
CLI_TIMEOUT_S = 180
WAKE_TIMEOUT_S = 900
RUN_ID_RE = re.compile(r"^[0-9]{8}-[0-9]{6}-[0-9a-f]{4}$")
SESSION_KEY_RE = re.compile(r"^agent:[A-Za-z0-9_-]+:[A-Za-z0-9:_.@-]+$")
CHAT_RE = re.compile(r"^oc_[0-9a-f]{20,64}$")
PATH_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.\[\]-]*$")


def now():
    return datetime.datetime.now(TZ)


def stamp():
    return now().strftime("%Y-%m-%d %H:%M:%S CST")


def sh(argv, timeout=60, input_text=None, check=False):
    p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, input=input_text)
    if check and p.returncode != 0:
        raise RuntimeError("%s exited %d: %s" % (" ".join(argv[:4]), p.returncode, (p.stderr or p.stdout)[-800:]))
    return p


def as_user(argv):
    """Run as the Gateway's own user, so nothing it owns becomes root-owned."""
    if os.geteuid() != 0:
        return argv
    return ["runuser", "-u", RUN_AS, "--", "env", "HOME=" + RUN_AS_HOME] + cli_env() + argv


def cli_env():
    """Extra KEY=VALUE pairs for the openclaw CLI (candidate runs point it at a
    private config and state dir). Space-separated, shell-quoted."""
    return [kv for kv in shlex.split(os.environ.get("V_SELF_RESTART_CLI_ENV", "")) if "=" in kv]


def log(msg):
    # stderr: stdout of a request is the JSON V reads back.
    print("[%s] %s" % (stamp(), msg), file=sys.stderr, flush=True)
    try:
        subprocess.run(["logger", "-t", "v-self-restart", "--", msg], timeout=5)
    except Exception:
        pass


# ---------------------------------------------------------------- run records

def record_path(run_id):
    return os.path.join(STATE_DIR, run_id + ".json")


def save(rec):
    # Records hold the config values that were set, so root-only.
    os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
    tmp = record_path(rec["id"]) + ".tmp"
    with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump(rec, f, ensure_ascii=False, indent=1)
    os.replace(tmp, record_path(rec["id"]))


def load(run_id):
    with open(record_path(run_id)) as f:
        return json.load(f)


def all_records():
    try:
        names = sorted(n[:-5] for n in os.listdir(STATE_DIR) if n.endswith(".json") and RUN_ID_RE.match(n[:-5]))
    except FileNotFoundError:
        return []
    out = []
    for n in names:
        try:
            out.append(load(n))
        except Exception:
            pass
    return out


def step(rec, name, **fields):
    rec.setdefault("steps", []).append(dict({"step": name, "at": stamp()}, **fields))
    save(rec)
    log("%s %s %s" % (rec["id"], name, json.dumps(fields, ensure_ascii=False)[:600] if fields else ""))


# -------------------------------------------------------------- unit control

def unit_prop(name):
    return sh(["systemctl", "show", UNIT, "-p", name, "--value"]).stdout.strip()


def unit_active():
    return sh(["systemctl", "is-active", UNIT]).stdout.strip()


ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def journal_since_invocation(invocation):
    if not invocation:
        return ""
    out = sh(["journalctl", "_SYSTEMD_INVOCATION_ID=" + invocation, "-o", "cat", "--no-pager"],
             timeout=60).stdout
    # The Gateway colours its log when it thinks it has a terminal; on VLab the
    # journal held "[gateway]\x1b[39m \x1b[36mready", which a plain match misses.
    return ANSI_RE.sub("", out)


def wait_ready(timeout_s, start_restarts):
    """Ready = this invocation logged READY_MARK. Fail fast if the unit dies or
    systemd has already restarted it (a crash loop never prints ready)."""
    deadline = time.monotonic() + timeout_s
    invocation = unit_prop("InvocationID")
    while time.monotonic() < deadline:
        state = unit_active()
        restarts = unit_prop("NRestarts")
        if state in ("failed", "inactive"):
            return False, "unit %s" % state
        if restarts.isdigit() and start_restarts.isdigit() and int(restarts) > int(start_restarts):
            return False, "systemd restarted the unit (NRestarts %s -> %s)" % (start_restarts, restarts)
        current = unit_prop("InvocationID")
        if current and current != invocation:
            invocation = current
        if READY_MARK in journal_since_invocation(invocation):
            return True, "ready"
        time.sleep(5)
    return False, "no '%s' within %ds" % (READY_MARK, timeout_s)


def stop_unit(rec):
    rec["oldMainPid"] = unit_prop("MainPID")
    save(rec)
    p = sh(["systemctl", "stop", UNIT], timeout=STOP_TIMEOUT_S)
    state = unit_active()
    step(rec, "stopped", rc=p.returncode, state=state, oldMainPid=rec["oldMainPid"])
    if state == "active":
        raise RuntimeError("unit still active after stop")


def start_unit(rec, label):
    restarts = unit_prop("NRestarts")
    p = sh(["systemctl", "start", UNIT], timeout=STOP_TIMEOUT_S)
    t0 = time.monotonic()
    ok, why = wait_ready(rec["readyTimeoutS"], restarts)
    step(rec, label, rc=p.returncode, ok=ok, why=why, seconds=round(time.monotonic() - t0),
         mainPid=unit_prop("MainPID"))
    return ok, why


# ------------------------------------------------------------- config writes

def parse_set(spec):
    """PATH=JSON or PATH=@FILE (file holds JSON). Returns (path, json_text)."""
    if "=" not in spec:
        raise ValueError("--set needs PATH=VALUE: %r" % spec)
    path, value = spec.split("=", 1)
    path = path.strip()
    if not PATH_RE.match(path):
        raise ValueError("bad config path: %r" % path)
    if value.startswith("@"):
        with open(value[1:], encoding="utf-8") as f:
            value = f.read()
    json.loads(value)  # strict JSON only; strings must be quoted
    return path, value.strip()


def config_set(path, value, dry_run):
    argv = [OPENCLAW, "config", "set", path, value, "--strict-json"]
    if dry_run:
        argv.append("--dry-run")
    p = sh(as_user(argv), timeout=CLI_TIMEOUT_S)
    out = (p.stdout + p.stderr).strip()
    # The CLI warns about env refs the Gateway resolves from its own env files.
    out = "\n".join(l for l in out.splitlines() if "missing env var" not in l)
    return p.returncode == 0, out[-600:]


# ------------------------------------------------- Codex app-server leftovers

ORPHAN_SQL_SELECT = ("SELECT rowid, value_json FROM plugin_state_entries "
                     "WHERE plugin_id='codex' AND namespace='app-server-processes'")


def pid_alive(pid):
    try:
        return isinstance(pid, int) and pid > 0 and os.path.isdir("/proc/%d" % pid)
    except Exception:
        return False


def clear_codex_orphans(db_path):
    """Delete Codex app-server registrations whose parent and child are both
    gone. With the Gateway stopped every registration is stale; a live pid that
    matches is left alone in case the number was reused. Without this, the first
    Codex turn after each restart failed with "Cannot reap registered Codex
    process" (2026-09-25 .. 10-06, six-plus times). Runs as RUN_AS."""
    import sqlite3
    if not os.path.exists(db_path):
        return {"skipped": "no state db"}
    con = sqlite3.connect(db_path, timeout=10)
    try:
        try:
            rows = con.execute(ORPHAN_SQL_SELECT).fetchall()
        except sqlite3.OperationalError as e:
            return {"skipped": str(e)}
        stale, kept = [], []
        for rowid, value in rows:
            try:
                v = json.loads(value)
                parent, child = v.get("parent", {}).get("pid"), v.get("child", {}).get("pid")
            except Exception:
                kept.append(rowid)
                continue
            (kept if pid_alive(parent) or pid_alive(child) else stale).append((rowid, value))
        if stale:
            con.executemany("DELETE FROM plugin_state_entries WHERE rowid=?", [(r,) for r, _ in stale])
            con.commit()
        return {"deleted": [{"rowid": r, "value": v} for r, v in stale], "kept": kept}
    finally:
        con.close()


def run_orphan_cleanup():
    if os.geteuid() == 0:
        p = sh(as_user(["python3", os.path.abspath(__file__), "--clear-codex-orphans", STATE_DB]), timeout=60)
        try:
            return json.loads(p.stdout.strip().splitlines()[-1])
        except Exception:
            return {"error": (p.stderr or p.stdout)[-400:]}
    return clear_codex_orphans(STATE_DB)


# ------------------------------------------------------------ after the restart

def post_checks(invocation):
    text = journal_since_invocation(invocation)
    return {
        "cannotReap": text.count("Cannot reap registered Codex process"),
        "restartRecoveryClaimChanged": text.count("restart recovery claim changed"),
        "workersReady": text.count('"stage":"pool-ready"'),
    }


def notify(rec, text):
    chat = rec.get("chat")
    if not chat:
        return None
    try:
        import sentinel
    except Exception as e:
        log("no sentinel module for Feishu: %s" % e)
        return False
    sentinel.ALERT_CHAT = chat
    return bool(sentinel.feishu(text))


def wake(rec, text):
    key = rec.get("sessionKey")
    if not key:
        return None
    import pwd
    import tempfile
    fd, msg_path = tempfile.mkstemp(prefix="v-self-restart-wake-", suffix=".txt")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    if os.geteuid() == 0:
        pw = pwd.getpwnam(RUN_AS)
        os.chown(msg_path, pw.pw_uid, pw.pw_gid)
    base = [OPENCLAW, "agent", "--agent", AGENT, "--session-key", key, "--message-file", msg_path,
            "--json", "--timeout", str(WAKE_TIMEOUT_S - 60)]
    attempts = []
    try:
        # With --deliver the reply goes back to the session's own chat. If the
        # Gateway cannot resolve a delivery route it refuses the whole request
        # and no turn runs, so retry without delivery: the turn still runs and
        # the agent can post with its message tool.
        for deliver in (True, False):
            argv = base + (["--deliver"] if deliver else [])
            p = sh(as_user(["timeout", "-k", "15", str(WAKE_TIMEOUT_S)] + argv), timeout=WAKE_TIMEOUT_S + 30)
            out = p.stdout + p.stderr
            attempts.append({"deliver": deliver, "rc": p.returncode, "tail": out[-400:]})
            if p.returncode == 0 or not re.search(r"[Cc]hannel is required|deliver", out):
                break
        return dict(attempts[-1], attempts=len(attempts))
    except Exception as e:
        return {"error": str(e), "attempts": attempts}
    finally:
        os.unlink(msg_path)


def summary(rec):
    sets = ", ".join(s["path"] for s in rec.get("sets", [])) or "无"
    lines = ["V 自重启 %s：%s" % (rec["id"], rec["outcomeText"]),
             "原因：%s（%s）" % (rec["reason"], rec["requestedBy"]),
             "配置改动：%s" % sets]
    if rec.get("readySeconds") is not None:
        lines.append("停机到就绪：%s 秒" % rec["readySeconds"])
    pc = rec.get("postChecks") or {}
    if pc:
        lines.append("Codex 旧登记清理 %d 行；启动后 Cannot reap %d 次、恢复冲突 %d 次、worker 就绪 %d 个" % (
            len((rec.get("codexOrphans") or {}).get("deleted", [])), pc.get("cannotReap", 0),
            pc.get("restartRecoveryClaimChanged", 0), pc.get("workersReady", 0)))
    if rec.get("error"):
        lines.append("错误：%s" % rec["error"])
    lines.append("记录：sudo v-self-restart --status %s" % rec["id"])
    return "\n".join(lines)


def wake_text(rec):
    text = "[v-self-restart] 你 %s 发起的 Gateway 重启已结束：%s。\n\n%s" % (
        rec["requestedAt"], rec["outcomeText"], summary(rec))
    if rec.get("then"):
        text += "\n\n你重启前留给自己的下一步：%s" % rec["then"]
    return text


# --------------------------------------------------------------- the run itself

def execute(run_id):
    rec = load(run_id)
    rec["state"] = "running"
    rec["unit"] = "v-self-restart-%s.service" % run_id
    step(rec, "started", delay=rec["delayS"])
    time.sleep(rec["delayS"])
    backup = None
    applied = False
    try:
        # Re-validate: the config may have changed during the delay.
        for s in rec["sets"]:
            ok, out = config_set(s["path"], s["value"], dry_run=True)
            if not ok:
                raise RuntimeError("dry-run no longer passes for %s: %s" % (s["path"], out))
        stop_unit(rec)
        if rec["sets"]:
            backup = "%s.bak-self-restart-%s" % (CONFIG, run_id)
            shutil.copy2(CONFIG, backup)
            st = os.stat(CONFIG)
            os.chown(backup, st.st_uid, st.st_gid)
            rec["configBackup"] = backup
            for s in rec["sets"]:
                ok, out = config_set(s["path"], s["value"], dry_run=False)
                step(rec, "config-set", path=s["path"], ok=ok, out=out[-300:])
                if not ok:
                    raise RuntimeError("config set failed for %s: %s" % (s["path"], out))
                applied = True
        rec["codexOrphans"] = run_orphan_cleanup()
        step(rec, "codex-orphans", deleted=len(rec["codexOrphans"].get("deleted", [])),
             note=rec["codexOrphans"].get("skipped") or rec["codexOrphans"].get("error"))
        t0 = time.monotonic()
        ok, why = start_unit(rec, "start")
        rec["readySeconds"] = round(time.monotonic() - t0)
        if not ok:
            raise RuntimeError("Gateway did not become ready: %s" % why)
        rec["postChecks"] = post_checks(unit_prop("InvocationID"))
        rec["outcome"], rec["outcomeText"] = "ok", "成功，Gateway 已就绪"
    except Exception as e:
        rec["error"] = str(e)[-800:]
        rec["outcome"], rec["outcomeText"] = "failed", "失败"
        step(rec, "failed", error=rec["error"])
        if unit_active() != "active" or applied:
            # Put the old config back and bring the Gateway up on it.
            try:
                if applied and backup:
                    sh(["systemctl", "stop", UNIT], timeout=STOP_TIMEOUT_S)
                    shutil.copy2(backup, CONFIG)
                    step(rec, "config-restored", backup=backup)
                rec["codexOrphans2"] = run_orphan_cleanup()
                ok, why = start_unit(rec, "rollback-start")
                rec["outcome"] = "rolled-back" if ok else "down"
                rec["outcomeText"] = ("失败，已恢复原配置并重新启动，Gateway 已就绪" if ok and applied
                                      else "失败，按原配置重新启动成功" if ok
                                      else "失败，回滚后 Gateway 仍未就绪，需要人工处理")
                if ok:
                    rec["postChecks"] = post_checks(unit_prop("InvocationID"))
            except Exception as e2:
                rec["outcome"], rec["outcomeText"] = "down", "失败，回滚也出错，需要人工处理"
                rec["rollbackError"] = str(e2)[-800:]
    rec["state"] = "finished"
    rec["finishedAt"] = stamp()
    rec["finishedEpoch"] = time.time()
    save(rec)
    rec["notified"] = notify(rec, summary(rec))
    save(rec)
    # Wake whenever there is a Gateway to wake into, including a failure that
    # never stopped it (e.g. a dry-run that stopped passing during the delay).
    if unit_active() == "active":
        rec["wake"] = wake(rec, wake_text(rec))
        save(rec)
    log("%s finished: %s" % (run_id, rec["outcome"]))
    return 0 if rec["outcome"] == "ok" else 1


# -------------------------------------------------------------------- request

def in_progress():
    for r in all_records():
        if r.get("state") in ("requested", "running"):
            unit = "v-self-restart-%s.service" % r["id"]
            if sh(["systemctl", "is-active", unit]).stdout.strip() in ("active", "activating"):
                return r
    return None


def last_finished_ago():
    best = None
    for r in all_records():
        if r.get("state") == "finished" and r.get("finishedEpoch"):
            ago = time.time() - r["finishedEpoch"]
            best = ago if best is None else min(best, ago)
    return best


def request(args):
    if os.geteuid() != 0:
        print("v-self-restart must run as root: sudo v-self-restart ...", file=sys.stderr)
        return 2
    if not args.reason or not args.requested_by:
        print("--reason and --requested-by are required", file=sys.stderr)
        return 2
    if args.chat and not CHAT_RE.match(args.chat):
        print("--chat must be a Feishu chat id (oc_...)", file=sys.stderr)
        return 2
    if args.session_key and not SESSION_KEY_RE.match(args.session_key):
        print("--session-key must look like agent:<id>:...", file=sys.stderr)
        return 2
    sets = []
    for spec in args.set or []:
        try:
            path, value = parse_set(spec)
        except Exception as e:
            print("invalid --set: %s" % e, file=sys.stderr)
            return 2
        ok, out = config_set(path, value, dry_run=True)
        print("dry-run %s: %s" % (path, "ok" if ok else "FAILED"))
        if not ok:
            print(out, file=sys.stderr)
            return 3
        sets.append({"path": path, "value": value})
    busy = in_progress()
    if busy:
        print("another self-restart is in progress: %s" % busy["id"], file=sys.stderr)
        return 4
    ago = last_finished_ago()
    if ago is not None and ago < MIN_INTERVAL_S and not args.force:
        print("last self-restart finished %ds ago (< %ds); add --force if this is intended"
              % (ago, MIN_INTERVAL_S), file=sys.stderr)
        return 4
    if args.check:
        print("check passed: %d config change(s) validated; nothing changed" % len(sets))
        return 0
    run_id = now().strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(2)
    rec = {"id": run_id, "state": "requested", "requestedAt": stamp(), "reason": args.reason,
           "requestedBy": args.requested_by, "chat": args.chat, "sessionKey": args.session_key,
           "then": args.then, "sets": sets, "delayS": args.delay, "readyTimeoutS": args.ready_timeout,
           "gatewayUnit": UNIT}
    save(rec)
    unit = "v-self-restart-%s" % run_id
    argv = ["systemd-run", "--unit", unit, "--description", "V self-restart %s" % run_id, "--collect",
            "--property", "TimeoutStartSec=infinity"]
    for k in sorted(os.environ):
        if k.startswith("V_SELF_RESTART_"):
            argv += ["--setenv", "%s=%s" % (k, os.environ[k])]
    argv += ["/usr/bin/python3", os.path.abspath(__file__), "--run", run_id]
    p = sh(argv, timeout=30)
    if p.returncode != 0:
        rec["state"], rec["error"] = "finished", "systemd-run failed: " + (p.stderr or p.stdout)[-400:]
        rec["outcome"], rec["outcomeText"] = "failed", "未能启动"
        rec["finishedEpoch"] = time.time()
        save(rec)
        print(rec["error"], file=sys.stderr)
        return 5
    print(json.dumps({"id": run_id, "unit": unit + ".service", "delaySeconds": args.delay,
                      "configChanges": [s["path"] for s in sets],
                      "next": "Finish your reply now. In %ds the Gateway stops; this turn ends with it. "
                              "The result goes to the chat and wakes this session." % args.delay},
                     ensure_ascii=False, indent=1))
    log("%s requested by %s: %s (sets: %s)" % (run_id, args.requested_by, args.reason,
                                               ", ".join(s["path"] for s in sets) or "none"))
    return 0


def status(run_id):
    recs = all_records()
    if run_id:
        recs = [r for r in recs if r["id"] == run_id]
    if not recs:
        print("no self-restart records")
        return 1
    print(json.dumps(recs[-1], ensure_ascii=False, indent=1))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="v-self-restart", description=__doc__.split("\n\n")[0])
    ap.add_argument("--reason")
    ap.add_argument("--requested-by", help="who asked, e.g. 'Tianyi in V｜接管Mac办事 15:43'")
    ap.add_argument("--chat", help="Feishu chat id that gets the result")
    ap.add_argument("--session-key", help="session to wake with the result")
    ap.add_argument("--set", action="append", metavar="PATH=JSON|PATH=@FILE")
    ap.add_argument("--then", help="what you want to do after the restart; included in the wake message")
    ap.add_argument("--delay", type=int, default=DEFAULT_DELAY_S)
    ap.add_argument("--ready-timeout", type=int, default=DEFAULT_READY_TIMEOUT_S)
    ap.add_argument("--force", action="store_true", help="allow a restart within 10 min of the last")
    ap.add_argument("--check", action="store_true", help="validate only")
    ap.add_argument("--status", nargs="?", const="", metavar="ID")
    ap.add_argument("--run", metavar="ID", help=argparse.SUPPRESS)
    ap.add_argument("--clear-codex-orphans", metavar="DB", help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    if args.clear_codex_orphans:
        print(json.dumps(clear_codex_orphans(args.clear_codex_orphans), ensure_ascii=False))
        return 0
    if args.status is not None:
        return status(args.status)
    if args.run:
        if not RUN_ID_RE.match(args.run):
            return 2
        return execute(args.run)
    if not (0 <= args.delay <= 600) or not (60 <= args.ready_timeout <= 3600):
        print("--delay must be 0..600 and --ready-timeout 60..3600", file=sys.stderr)
        return 2
    return request(args)


if __name__ == "__main__":
    sys.exit(main())
