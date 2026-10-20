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
returns. That unit waits --delay seconds so V can finish its reply, then waits
until V is idle (no Worker turn running or queued apart from the requester's
own, no cron turn running, no inter-session (sessions_send) turn running, no
Feishu dispatch in flight, no inbound message for 90 s; --idle-timeout /
--if-busy), stops the Gateway, backs up both configs
(the Gateway's and the Worker's), applies the sets, runs --while-stopped,
clears Codex app-server registrations left by the dead Gateway, starts it, and
waits for "[gateway] ready". If anything after the stop fails it restores both
config backups and starts again. After the start it waits for every enabled
stream cron to be running again and the Worker pool to be ready, then counts
known post-restart errors in the journal. The result goes straight to the
Feishu chat (not through the Gateway), and the requesting session is woken
with a summary.

This is the only way V's Gateway is restarted, by V itself or by a release:

    sudo v-self-restart --reason "activate X" --requested-by "release" \
        --if-busy abort --idle-timeout 3600 --delay 0 \
        --while-stopped "node /path/to/activate.mjs --apply-config"

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

# realpath: on V this runs through the /usr/local/sbin/v-self-restart symlink,
# and sentinel.py and the Gateway helper live beside the real file.
HERE = os.path.dirname(os.path.realpath(__file__))
sys.path.insert(0, HERE)

TZ = datetime.timezone(datetime.timedelta(hours=8))  # Asia/Shanghai, no DST


def env(name, default):
    return os.environ.get("V_SELF_RESTART_" + name, default)


UNIT = env("UNIT", "openclaw-gateway.service")
CONFIG = env("CONFIG", "/home/openclaw/.openclaw/openclaw.json")
# The Worker reads its own copy (memory v-worker-config-second-file); a change
# made while stopped may touch it, so it is backed up and rolled back too.
WORKER_CONFIG = env("WORKER_CONFIG",
                    "/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json")
GATEWAY_HELPER = env("GATEWAY_HELPER", "")
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
STOP_TIMEOUT_S = 360
CLI_TIMEOUT_S = 180
WAKE_TIMEOUT_S = 900
# Idle gate. V restarting itself waits a few minutes at most and then restarts
# anyway; a release passes --if-busy abort --idle-timeout 3600.
DEFAULT_IDLE_TIMEOUT_S = 300
IDLE_POLL_S = 15
DISPATCH_WINDOW_S = 240
INBOUND_QUIET_S = 90
DEFAULT_WHILE_STOPPED_TIMEOUT_S = 900
# After ready: how long stream crons and the Worker pool get to come back.
DEFAULT_SETTLE_TIMEOUT_S = 180
SETTLE_POLL_S = 5
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


def as_user(argv, extra_env=()):
    """Run as the Gateway's own user, so nothing it owns becomes root-owned."""
    if os.geteuid() != 0:
        return (["env"] + list(extra_env) + argv) if extra_env else argv
    return ["runuser", "-u", RUN_AS, "--", "env", "HOME=" + RUN_AS_HOME] + cli_env() + list(extra_env) + argv


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
    queued_until = min(deadline, time.monotonic() + 15)
    seen_start = False
    while time.monotonic() < deadline:
        state = unit_active()
        restarts = unit_prop("NRestarts")
        if state in ("failed", "inactive") and (seen_start or time.monotonic() >= queued_until):
            return False, "unit %s" % state
        seen_start = seen_start or state in ("activating", "active")
        if restarts.isdigit() and start_restarts.isdigit() and int(restarts) > int(start_restarts):
            return False, "systemd restarted the unit (NRestarts %s -> %s)" % (start_restarts, restarts)
        current = unit_prop("InvocationID")
        if current and current != invocation:
            invocation = current
        if state == "active" and READY_MARK in journal_since_invocation(invocation):
            return True, "ready"
        time.sleep(5)
    return False, "no '%s' within %ds" % (READY_MARK, timeout_s)


class StopIncomplete(RuntimeError):
    """A stop request is not proof that the old process has exited."""


def remaining_unit_processes(group):
    if not group:
        return []
    root = "/sys/fs/cgroup" + group
    try:
        # cgroup.procs contains direct members only; Workers use child cgroups.
        # populated includes every descendant, including concurrent child exits.
        with open(root + "/cgroup.events") as f:
            events = dict(line.split() for line in f if line.strip())
        if events.get("populated") == "0":
            return []
        if events.get("populated") != "1":
            raise StopIncomplete("Cannot verify the previous unit cgroup population")
        pids = []
        for directory, _, _ in os.walk(root):
            try:
                with open(directory + "/cgroup.procs") as f:
                    pids.extend(int(pid) for pid in f.read().split())
            except FileNotFoundError:
                pass
        return sorted(set(pids)) or ["populated-descendants"]
    except FileNotFoundError:
        return []
    except OSError as error:
        raise StopIncomplete("Cannot verify the previous unit cgroup is empty") from error


def stop_unit(rec):
    rec["oldMainPid"] = unit_prop("MainPID")
    old_group = unit_prop("ControlGroup")
    save(rec)
    try:
        p = sh(["systemctl", "stop", "--no-block", UNIT], timeout=30)
    except subprocess.TimeoutExpired as error:
        step(rec, "stop-incomplete", state=unit_active(), mainPid=unit_prop("MainPID"), timeout=True)
        raise StopIncomplete("Gateway stop is still pending; config was not changed") from error
    deadline = time.monotonic() + STOP_TIMEOUT_S
    state, main_pid = unit_active(), unit_prop("MainPID")
    remaining = remaining_unit_processes(old_group)
    while (state not in ("inactive", "failed") or main_pid != "0" or remaining) and time.monotonic() < deadline:
        time.sleep(1)
        state, main_pid = unit_active(), unit_prop("MainPID")
        remaining = remaining_unit_processes(old_group)
    if state not in ("inactive", "failed") or main_pid != "0" or remaining:
        step(rec, "stop-incomplete", rc=p.returncode, state=state, mainPid=main_pid, remainingPids=remaining)
        raise StopIncomplete("Gateway has not stopped (%s, MainPID=%s); config was not changed" % (state, main_pid))
    step(rec, "stopped", rc=p.returncode, state=state, oldMainPid=rec["oldMainPid"], mainPid=main_pid)


def start_unit(rec, label):
    restarts = unit_prop("NRestarts")
    p = sh(["systemctl", "start", "--no-block", UNIT], timeout=30)
    if p.returncode != 0:
        raise RuntimeError("Gateway start request failed: %s" % (p.stderr or p.stdout)[-500:])
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


def config_paths():
    """The Gateway's config and the Worker's own copy, whichever exist."""
    return [p for p in dict.fromkeys([CONFIG, WORKER_CONFIG]) if p and os.path.exists(p)]


def backup_configs(rec):
    """Byte copies beside the originals, owned like them."""
    backups = {}
    for path in config_paths():
        st = os.stat(path)
        backup = "%s.bak-self-restart-%s" % (path, rec["id"])
        shutil.copy2(path, backup)
        os.chown(backup, st.st_uid, st.st_gid)
        backups[path] = {"backup": backup, "uid": st.st_uid, "gid": st.st_gid, "mode": st.st_mode & 0o7777}
    rec["configBackups"] = backups
    rec["configBackup"] = (backups.get(CONFIG) or {}).get("backup")
    save(rec)
    return backups


def restore_configs(rec):
    restored = []
    for path, b in (rec.get("configBackups") or {}).items():
        shutil.copy2(b["backup"], path)
        os.chown(path, b["uid"], b["gid"])
        os.chmod(path, b["mode"])
        restored.append(path)
    return restored


def keep_config_owners(rec):
    """A command running as root that rewrites a config by rename leaves it
    root-owned, and the Gateway (running as RUN_AS) then cannot read it."""
    fixed = []
    for path, b in (rec.get("configBackups") or {}).items():
        if not os.path.exists(path):
            continue
        st = os.stat(path)
        if (st.st_uid, st.st_gid, st.st_mode & 0o7777) != (b["uid"], b["gid"], b["mode"]):
            os.chown(path, b["uid"], b["gid"])
            os.chmod(path, b["mode"])
            fixed.append(path)
    return fixed


def validate_configs():
    """[(path, ok, note)] for both configs: strict JSON, then `openclaw config
    validate` as the service user. A validator that times out says nothing
    about the file, so it does not count as a failure; readiness still decides."""
    out = []
    for path in config_paths():
        try:
            with open(path, encoding="utf-8") as f:
                json.load(f)
        except Exception as e:
            out.append((path, False, "not JSON: %s" % e))
            continue
        try:
            p = sh(as_user([OPENCLAW, "config", "validate"], ["OPENCLAW_CONFIG_PATH=" + path]), timeout=CLI_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            out.append((path, True, "validator timed out"))
            continue
        text = "\n".join(l for l in (p.stdout + p.stderr).splitlines() if "missing env var" not in l).strip()
        out.append((path, p.returncode == 0, text[-300:]))
    return out


def command_problem(cmd):
    """Why --while-stopped CMD cannot run, or None. Checked before anything stops."""
    try:
        words = shlex.split(cmd)
    except ValueError as e:
        return "cannot parse: %s" % e
    if not words:
        return "empty command"
    exe = words[0]
    if "/" in exe:
        return None if os.path.isfile(exe) and os.access(exe, os.X_OK) else "%s is not an executable file" % exe
    return None if shutil.which(exe) or exe in ("cd", "set", "test", "[", "true", "exit") else "%s not found on PATH" % exe


def run_while_stopped(rec):
    """Run the command as root through /bin/sh while the Gateway is down. Its
    whole process group is killed on timeout so nothing outlives the window."""
    import signal
    cmd = rec["whileStopped"]
    timeout = rec.get("whileStoppedTimeoutS") or DEFAULT_WHILE_STOPPED_TIMEOUT_S
    child_env = dict(os.environ, V_SELF_RESTART_RUN_ID=rec["id"], V_SELF_RESTART_CONFIG=CONFIG,
                     V_SELF_RESTART_WORKER_CONFIG=WORKER_CONFIG)
    t0 = time.monotonic()
    p = subprocess.Popen(["/bin/sh", "-c", cmd], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                         env=child_env, start_new_session=True)
    try:
        out, err = p.communicate(timeout=timeout)
        rc, timed_out = p.returncode, False
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL)
        out, err = p.communicate()
        rc, timed_out = None, True
    result = {"command": cmd, "rc": rc, "timedOut": timed_out, "seconds": round(time.monotonic() - t0),
              "stdoutTail": (out or "")[-1500:], "stderrTail": (err or "")[-1500:]}
    rec["whileStoppedResult"] = result
    step(rec, "while-stopped", command=cmd, rc=rc, timedOut=timed_out, seconds=result["seconds"])
    if rc != 0:
        raise RuntimeError("--while-stopped %s (%s)" % ("timed out after %ds" % timeout if timed_out
                                                         else "exited %s" % rc, result["stderrTail"][-300:]))
    return result


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


# ------------------------------------------------------------- Gateway queries

def helper_path():
    if GATEWAY_HELPER:
        return GATEWAY_HELPER
    for name in ("self-restart-gateway.mjs", "v-self-restart-gateway.mjs"):  # installed / repo
        if os.path.exists(os.path.join(HERE, name)):
            return os.path.join(HERE, name)
    return os.path.join(HERE, "self-restart-gateway.mjs")


def gateway_endpoint():
    """node binary, core dir and port exactly as the running Gateway was started."""
    pid = unit_prop("MainPID")
    if not pid.isdigit() or pid == "0":
        return None
    try:
        with open("/proc/%s/cmdline" % pid, "rb") as f:
            argv = [a.decode(errors="replace") for a in f.read().split(b"\0") if a]
    except OSError:
        return None
    entry = next((a for a in argv if a.endswith("/dist/index.js")), "")
    port = argv[argv.index("--port") + 1] if "--port" in argv[:-1] else ""
    if not port:
        try:
            with open(CONFIG) as f:
                port = str(json.load(f).get("gateway", {}).get("port") or "")
        except Exception:
            pass
    node = env("NODE", argv[0] if argv and os.path.basename(argv[0]).startswith("node") else "node")
    core = env("GATEWAY_CORE", os.path.dirname(os.path.dirname(entry)) if entry else "")
    if not core or not port:
        return None
    return {"pid": pid, "node": node, "core": core, "port": port}


def gateway_query():
    """{"workers": ..., "cron": {"jobs": [...]}, "relay": ...} from the running
    Gateway, read only (self-restart-gateway.mjs). {"error": ...} when it cannot
    be asked."""
    ep = gateway_endpoint()
    if not ep:
        return {"error": "Gateway endpoint unknown (unit %s)" % unit_active()}
    try:
        p = sh([ep["node"], "--no-warnings", helper_path(), "--core", ep["core"], "--port", ep["port"],
                "--pid", ep["pid"], "--config", CONFIG], timeout=90)
    except subprocess.TimeoutExpired:
        return {"error": "Gateway query timed out"}
    try:
        return json.loads(p.stdout.strip().splitlines()[-1])
    except Exception:
        return {"error": "Gateway query rc %d: %s" % (p.returncode, (p.stderr or p.stdout)[-300:])}


def journal_recent(seconds):
    """[(epoch, message)] the Gateway unit logged in the last `seconds`."""
    p = sh(["journalctl", "-u", UNIT, "--since", "@%d" % int(time.time() - seconds), "-o", "short-unix",
            "--no-pager"], timeout=60)
    lines = []
    for line in ANSI_RE.sub("", p.stdout).splitlines():
        m = re.match(r"^(\d+(?:\.\d+)?) (.*)$", line)
        if m:
            lines.append((float(m.group(1)), m.group(2)))
    return lines


# ------------------------------------------------------------------- idle gate

DISPATCH_RE = re.compile(r"dispatching to agent")
COMPLETE_RE = re.compile(r"dispatch complete(?!d)")  # not the [diagnostic] "dispatch completed:"
INBOUND_RE = re.compile(r"received message|dispatching to agent")
NO_METHOD_RE = re.compile(r"unknown method|method not found|no handler", re.I)
# vrelay.list belongs to the v-session-relay plugin (docs/inter-session/design.md
# §2.b, §6.6). Without the plugin the method is not registered, and the Gateway
# checks scopes before it looks a method up: an unregistered method needs
# operator.admin, so a read-only client is told "missing scope: operator.admin"
# rather than "unknown method".
RELAY_ABSENT_RE = re.compile(r"unknown method: vrelay\.|missing scope: operator\.admin")
# Send phases whose target turn is running or about to start. Queued sends and
# ones waiting on their own children or background work have no turn in flight;
# the relay re-queues them after a restart, so they are not a reason to wait.
RELAY_RUNNING_PHASES = ("starting", "running")


class BusyAbort(RuntimeError):
    """--if-busy abort and V never became idle: nothing was stopped."""


def requester_token(rec):
    """The chat/user id at the end of the requester's session key, as it
    appears in Feishu's "received message ... in oc_x" and "session=..." lines."""
    tail = (rec.get("sessionKey") or "").rsplit(":", 1)[-1]
    return tail if len(tail) >= 8 else None


def relay_running(relay, own_key):
    """Inter-session turns in flight per vrelay.list({active: true}), not counting
    one whose target is the requester's own session (that turn ends with the
    Gateway, like its Worker turn)."""
    items = [i for i in relay.get("items") or [] if isinstance(i, dict)]
    running = [i for i in items if i.get("phase") in RELAY_RUNNING_PHASES]
    own = sum(1 for i in running if own_key and i.get("target") == own_key)
    n = (relay.get("counts") or {}).get("running")
    if not isinstance(n, int) or isinstance(n, bool) or n < 0:
        n = len(running)
    # counts.running is the relay's own figure; never let the own-turn
    # subtraction hide a running turn the items do show.
    return max(0, n - own, len(running) - own)


def busy_reasons(rec, query, journal, now_s):
    """Why V is not idle right now; [] means idle. The requester's own turn is
    not a reason: the delay is there for it, and it ends with the Gateway. Its
    chat's messages from before the request are not either; later ones are."""
    reasons = []
    key = rec.get("sessionKey")
    requested = rec.get("requestedEpoch") or 0
    own_active = False
    w = query.get("workers") or {"error": query.get("error", "no answer")}
    if w.get("error"):
        if not NO_METHOD_RE.search(w["error"]):  # a Gateway without the Worker pool has no Worker turns
            reasons.append("查询 worker 状态失败：%s" % w["error"][:120])
    else:
        others, queued = 0, int(w.get("pending") or 0)
        for x in w.get("workers") or []:
            queued += int(x.get("queued") or 0)
            listed = x.get("active") or []
            for a in listed:
                if key and a.get("sessionKey") == key:
                    own_active = True
                else:
                    others += 1
            if not listed:
                others += int(x.get("activeCount") or 0)
        if others:
            reasons.append("worker 有 %d 个回合在跑" % others)
        if queued:
            reasons.append("worker 有 %d 个回合在排队" % queued)
    c = query.get("cron") or {"error": query.get("error", "no answer")}
    if c.get("error"):
        reasons.append("查询 cron 失败：%s" % c["error"][:120])
    else:
        # A stream cron's resident watcher has only streamStatus=running; it is
        # never idle and is restarted with the Gateway. runningAtMs is a turn.
        running = [j.get("name") or j.get("id") for j in c.get("jobs") or [] if j.get("runningAtMs")]
        if running:
            reasons.append("cron 回合在跑：%s" % "、".join(str(n) for n in running[:3]))
    # No "relay" at all: the Gateway could not be asked (already a reason above)
    # or the installed helper predates the relay query.
    r = query.get("relay")
    if isinstance(r, dict) and r.get("error"):
        if not (NO_METHOD_RE.search(r["error"]) or RELAY_ABSENT_RE.search(r["error"])):
            reasons.append("查询会话协作失败：%s" % r["error"][:120])
    elif isinstance(r, dict):
        n = relay_running(r, key)
        if n:
            reasons.append("会话协作有 %d 个回合在跑" % n)
    token = requester_token(rec)

    def own(ts, msg):
        return bool(token) and ts < requested and token in msg

    window = [(ts, m) for ts, m in journal if ts >= now_s - DISPATCH_WINDOW_S]
    disp_own = sum(1 for ts, m in window if DISPATCH_RE.search(m) and own(ts, m))
    disp_others = sum(1 for ts, m in window if DISPATCH_RE.search(m) and not own(ts, m))
    completes = sum(1 for _, m in window if COMPLETE_RE.search(m))
    # "dispatch complete" carries no session: assume every finished own
    # dispatch is among the completes, so others are never under-counted.
    own_done = max(0, disp_own - (1 if own_active else 0))
    inflight = disp_others - max(0, completes - own_done)
    if inflight > 0:
        reasons.append("最近 %d 分钟有 %d 条消息分发后还没完成" % (DISPATCH_WINDOW_S // 60, inflight))
    inbound = [ts for ts, m in journal if INBOUND_RE.search(m) and not own(ts, m)]
    if inbound and now_s - max(inbound) < INBOUND_QUIET_S:
        reasons.append("%d 秒内有新消息进来" % INBOUND_QUIET_S)
    return reasons, own_active


def running_streams(query):
    jobs = (query.get("cron") or {}).get("jobs")
    if jobs is None:
        return None
    return [j["id"] for j in jobs if j.get("kind") == "stream" and j.get("enabled") and j.get("streamStatus") == "running"]


def check_idle(rec):
    state = unit_active()
    if state != "active":
        return [], {"unit": state}
    query = gateway_query()
    streams = running_streams(query)
    if streams is not None:
        rec["streamsBefore"] = streams
    reasons, own_active = busy_reasons(rec, query, journal_recent(DISPATCH_WINDOW_S), time.time())
    return reasons, {"ownTurnActive": own_active}


def idle_gate(rec, t0, deadline):
    """Return once V is idle, or once the deadline passes with
    --if-busy wait-then-proceed; raise BusyAbort with --if-busy abort."""
    mode = rec.get("ifBusy") or "wait-then-proceed"
    if (rec.get("idleTimeoutS") if rec.get("idleTimeoutS") is not None else DEFAULT_IDLE_TIMEOUT_S) <= 0:
        # Still note which streams run, for the check after the restart.
        streams = running_streams(gateway_query()) if unit_active() == "active" else None
        if streams is not None:
            rec["streamsBefore"] = streams
        rec["idleGate"] = {"result": "skipped"}
        step(rec, "idle-gate-skipped")
        return
    rec["phase"] = "waiting-idle"
    checks, last = 0, None
    while True:
        reasons, detail = check_idle(rec)
        checks += 1
        waited = round(time.monotonic() - t0)
        if not reasons:
            rec["idleGate"] = dict({"result": "idle", "waitedS": waited, "checks": checks}, **detail)
            step(rec, "idle", waitedS=waited, checks=checks, **detail)
            rec.pop("phase", None)
            return
        if reasons != last:
            step(rec, "busy", reasons=reasons, waitedS=waited)
            last = reasons
        if time.monotonic() >= deadline:
            rec["idleGate"] = {"result": "timeout", "mode": mode, "waitedS": waited, "checks": checks,
                               "reasons": reasons}
            rec.pop("phase", None)
            if mode == "abort":
                raise BusyAbort("V stayed busy for %ds: %s" % (waited, "; ".join(reasons)))
            step(rec, "busy-timeout-proceed", waitedS=waited, reasons=reasons)
            return
        time.sleep(max(1, min(IDLE_POLL_S, deadline - time.monotonic())))


def gate_and_revalidate(rec):
    """Idle gate, then the --set dry-runs again (the config may have changed
    while waiting). Dry-runs take seconds each, so look once more after them."""
    timeout = rec.get("idleTimeoutS") if rec.get("idleTimeoutS") is not None else DEFAULT_IDLE_TIMEOUT_S
    t0 = time.monotonic()
    deadline = t0 + max(0, timeout)
    while True:
        idle_gate(rec, t0, deadline)
        for s in rec["sets"]:
            ok, out = config_set(s["path"], s["value"], dry_run=True)
            if not ok:
                raise RuntimeError("dry-run no longer passes for %s: %s" % (s["path"], out))
        if not rec["sets"] or rec["idleGate"]["result"] != "idle":
            return
        reasons, _ = check_idle(rec)
        if not reasons:
            return
        step(rec, "busy-again", reasons=reasons)


# ------------------------------------------------------------ after the restart

POST_CHECK_PATTERNS = {
    "cannotReap": "Cannot reap registered Codex process",
    "invalidConfig": "InvalidConfigError",
    "restartRecoveryClaimChanged": "restart recovery claim changed",
    "streamAckTimeout": "Worker stream acknowledgement timed out",
    "codexInspectFailed": "Cannot inspect Codex processes",
    "rebuilding": "is rebuilding",
}
POST_CHECK_LABELS = {
    "cannotReap": "Cannot reap", "invalidConfig": "InvalidConfig", "restartRecoveryClaimChanged": "恢复冲突",
    "streamAckTimeout": "stream-ack 超时", "codexInspectFailed": "Cannot inspect Codex", "rebuilding": "rebuilding",
}


def post_checks(invocation):
    text = journal_since_invocation(invocation)
    out = {k: text.count(v) for k, v in POST_CHECK_PATTERNS.items()}
    out["workersReady"] = text.count('"stage":"pool-ready"')
    return out


def stream_state(query, before):
    """Every enabled stream cron must be running again; one that ran before the
    restart and is now gone or disabled is reported too."""
    cron = query.get("cron") or {"error": query.get("error", "no answer")}
    if cron.get("error"):
        return {"ok": False, "error": cron["error"][:200]}
    streams = [j for j in cron.get("jobs") or [] if j.get("kind") == "stream" and j.get("enabled")]
    not_running = [{"id": j["id"], "name": j.get("name"), "status": j.get("streamStatus")}
                   for j in streams if j.get("streamStatus") != "running"]
    missing = [i for i in before or [] if i not in {j["id"] for j in streams}]
    return {"ok": not not_running and not missing, "enabled": len(streams),
            "running": len(streams) - len(not_running), "notRunning": not_running, "missing": missing}


def worker_state(query):
    w = query.get("workers") or {"error": query.get("error", "no answer")}
    if w.get("error"):
        if NO_METHOD_RE.search(w["error"]):
            return {"ok": True, "skipped": "no Worker pool"}
        return {"ok": False, "error": w["error"][:200]}
    ready = sum(1 for x in w.get("workers") or [] if x.get("ready") and not x.get("retiring"))
    want = int(w.get("minWorkers") or 1)
    return {"ok": ready >= want, "ready": ready, "minWorkers": want}


def settle(rec):
    """After ready: wait (bounded) for stream crons and the Worker pool."""
    timeout = rec.get("settleTimeoutS") if rec.get("settleTimeoutS") is not None else DEFAULT_SETTLE_TIMEOUT_S
    t0 = time.monotonic()
    while True:
        query = gateway_query()
        streams, workers = stream_state(query, rec.get("streamsBefore")), worker_state(query)
        if (streams["ok"] and workers["ok"]) or time.monotonic() - t0 >= timeout:
            break
        time.sleep(SETTLE_POLL_S)
    rec["streams"], rec["workerPool"] = streams, workers
    step(rec, "settled", seconds=round(time.monotonic() - t0), streams=streams, workers=workers)


def after_start(rec):
    settle(rec)
    rec["postChecks"] = post_checks(unit_prop("InvocationID"))
    rec["warnings"] = warnings(rec)


def warnings(rec):
    out = []
    gate = rec.get("idleGate") or {}
    if gate.get("result") == "timeout":
        out.append("等了 %s 秒 V 仍在忙（%s），按 wait-then-proceed 照常重启" % (
            gate.get("waitedS"), "；".join(gate.get("reasons") or [])))
    st = rec.get("streams")
    if st and not st.get("ok"):
        if st.get("error"):
            out.append("stream cron 状态查不到：%s" % st["error"])
        for j in st.get("notRunning") or []:
            out.append("stream cron 没有恢复：%s（%s）" % (j.get("name") or j["id"], j.get("status")))
        for i in st.get("missing") or []:
            out.append("重启前在跑的 stream cron %s 现在不在或已停用" % i)
    wp = rec.get("workerPool")
    if wp and not wp.get("ok"):
        out.append("worker 池未就绪：%s" % (wp.get("error") or "%s/%s" % (wp.get("ready"), wp.get("minWorkers"))))
    pc = rec.get("postChecks") or {}
    bad = ["%s %d 次" % (POST_CHECK_LABELS[k], pc[k]) for k in POST_CHECK_PATTERNS if pc.get(k)]
    if bad:
        out.append("启动后日志：" + "、".join(bad))
    return out


def notify(rec, text):
    """To --chat; without one, only failures and warnings go to the sentinel's
    alert chat, so a restart nobody asked to hear about stays quiet."""
    chat = rec.get("chat")
    if not chat and rec.get("outcome") == "ok" and not rec.get("warnings"):
        return None
    try:
        import sentinel
    except Exception as e:
        log("no sentinel module for Feishu: %s" % e)
        return False
    if chat:
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
    gate = rec.get("idleGate") or {}
    if gate.get("result") == "idle":
        lines.append("空闲闸门：等了 %s 秒确认空闲（查了 %s 次）" % (gate.get("waitedS"), gate.get("checks")))
    elif gate.get("result") == "skipped":
        lines.append("空闲闸门：跳过（--idle-timeout 0）")
    elif gate.get("result") == "timeout":
        lines.append("空闲闸门：等了 %s 秒仍忙（%s）" % (gate.get("waitedS"), "；".join(gate.get("reasons") or [])))
    ws = rec.get("whileStoppedResult")
    if ws:
        lines.append("停服期间命令：%s → %s，%s 秒" % (
            ws["command"], "超时被终止" if ws.get("timedOut") else "退出码 %s" % ws["rc"], ws["seconds"]))
    if rec.get("configValidation"):
        bad = [v for v in rec["configValidation"] if not v["ok"]]
        lines.append("配置校验：%s" % ("通过" if not bad else "不通过 " + "；".join(
            "%s：%s" % (os.path.basename(v["path"]), v["note"][-120:]) for v in bad)))
    if rec.get("readySeconds") is not None:
        lines.append("停机到就绪：%s 秒" % rec["readySeconds"])
    st = rec.get("streams")
    if st:
        lines.append("stream cron：%s" % ("%d/%d 已恢复 running" % (st["running"], st["enabled"]) if st.get("ok")
                                         else "⚠️ 未全部恢复" if not st.get("error") else "⚠️ 状态查不到"))
    wp = rec.get("workerPool")
    if wp and not wp.get("skipped"):
        lines.append("worker 池：%s/%s 就绪" % (wp.get("ready", "?"), wp.get("minWorkers", "?")))
    pc = rec.get("postChecks") or {}
    if pc:
        lines.append("Codex 旧登记清理 %d 行；启动后 %s" % (
            len((rec.get("codexOrphans") or {}).get("deleted", [])),
            "、".join("%s %d 次" % (POST_CHECK_LABELS[k], pc.get(k, 0)) for k in POST_CHECK_PATTERNS)))
    for w in rec.get("warnings") or []:
        lines.append("⚠️ " + w)
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
    applied = False
    try:
        gate_and_revalidate(rec)
        stop_unit(rec)
        if rec["sets"] or rec.get("whileStopped"):
            backup_configs(rec)
            applied = True
            for s in rec["sets"]:
                ok, out = config_set(s["path"], s["value"], dry_run=False)
                step(rec, "config-set", path=s["path"], ok=ok, out=out[-300:])
                if not ok:
                    raise RuntimeError("config set failed for %s: %s" % (s["path"], out))
            if rec.get("whileStopped"):
                try:
                    run_while_stopped(rec)
                finally:
                    fixed = keep_config_owners(rec)
                    if fixed:
                        step(rec, "config-owner-restored", paths=fixed)
                checks = validate_configs()
                rec["configValidation"] = [{"path": p, "ok": ok, "note": note} for p, ok, note in checks]
                step(rec, "config-validate", results=rec["configValidation"])
                bad = [c for c in rec["configValidation"] if not c["ok"]]
                if bad:
                    raise RuntimeError("config invalid after --while-stopped: %s" % "; ".join(
                        "%s: %s" % (c["path"], c["note"][-200:]) for c in bad))
        rec["codexOrphans"] = run_orphan_cleanup()
        step(rec, "codex-orphans", deleted=len(rec["codexOrphans"].get("deleted", [])),
             note=rec["codexOrphans"].get("skipped") or rec["codexOrphans"].get("error"))
        t0 = time.monotonic()
        ok, why = start_unit(rec, "start")
        rec["readySeconds"] = round(time.monotonic() - t0)
        if not ok:
            raise RuntimeError("Gateway did not become ready: %s" % why)
        after_start(rec)
        rec["outcome"] = "ok"
        rec["outcomeText"] = "成功，Gateway 已就绪" + ("；有 %d 项告警" % len(rec["warnings"]) if rec["warnings"] else "")
    except BusyAbort as e:
        rec["error"] = str(e)[-800:]
        rec["outcome"] = "busy-aborted"
        rec["outcomeText"] = "V 一直在忙，按 --if-busy abort 放弃；没有停服，也没有改配置"
        step(rec, "busy-aborted", error=rec["error"])
    except StopIncomplete as e:
        rec["error"] = str(e)[-800:]
        rec["outcome"], rec["outcomeText"] = "stop-pending", "停止未完成，未修改配置；请检查原进程，不自动重复启动"
        step(rec, "stop-pending", error=rec["error"])
    except Exception as e:
        rec["error"] = str(e)[-800:]
        rec["outcome"], rec["outcomeText"] = "failed", "失败"
        step(rec, "failed", error=rec["error"])
        if unit_active() != "active" or applied:
            # Put the old configs back and bring the Gateway up on them.
            try:
                if applied:
                    stop_unit(rec)
                    step(rec, "config-restored", paths=restore_configs(rec))
                rec["codexOrphans2"] = run_orphan_cleanup()
                ok, why = start_unit(rec, "rollback-start")
                rec["outcome"] = "rolled-back" if ok else "down"
                rec["outcomeText"] = ("失败，已恢复原配置并重新启动，Gateway 已就绪" if ok and applied
                                      else "失败，按原配置重新启动成功" if ok
                                      else "失败，回滚后 Gateway 仍未就绪，需要人工处理")
                if ok:
                    after_start(rec)
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
        # A run that gave up while V was busy never stopped anything.
        if r.get("state") == "finished" and r.get("finishedEpoch") and r.get("outcome") != "busy-aborted":
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
    if args.while_stopped is not None:
        problem = command_problem(args.while_stopped)
        if problem:
            print("invalid --while-stopped: %s" % problem, file=sys.stderr)
            return 2
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
        print("check passed: %d config change(s) validated%s; nothing changed"
              % (len(sets), ", --while-stopped command found" if args.while_stopped else ""))
        return 0
    run_id = now().strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(2)
    rec = {"id": run_id, "state": "requested", "requestedAt": stamp(), "requestedEpoch": time.time(),
           "reason": args.reason, "requestedBy": args.requested_by, "chat": args.chat,
           "sessionKey": args.session_key, "then": args.then, "sets": sets, "delayS": args.delay,
           "readyTimeoutS": args.ready_timeout, "idleTimeoutS": args.idle_timeout, "ifBusy": args.if_busy,
           "whileStopped": args.while_stopped, "whileStoppedTimeoutS": args.while_stopped_timeout,
           "settleTimeoutS": args.settle_timeout, "gatewayUnit": UNIT}
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
                      "idleTimeoutSeconds": args.idle_timeout, "ifBusy": args.if_busy,
                      "configChanges": [s["path"] for s in sets], "whileStopped": args.while_stopped,
                      "next": "Finish your reply now. In %ds the tool starts waiting for V to be idle "
                              "(other turns, cron runs, new messages; up to %ds), then the Gateway stops "
                              "and this turn ends with it. The result goes to the chat and wakes this "
                              "session." % (args.delay, args.idle_timeout)},
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
    ap.add_argument("--idle-timeout", type=int, default=DEFAULT_IDLE_TIMEOUT_S, metavar="S",
                    help="after --delay, wait up to S seconds for V to be idle; 0 skips the gate")
    ap.add_argument("--if-busy", choices=("wait-then-proceed", "abort"), default="wait-then-proceed",
                    help="still busy after --idle-timeout: restart anyway (default) or give up untouched")
    ap.add_argument("--while-stopped", metavar="CMD",
                    help="shell command run as root while the Gateway is stopped; both configs are "
                         "backed up first and restored if it fails, a config stops validating, or "
                         "the Gateway does not come back")
    ap.add_argument("--while-stopped-timeout", type=int, default=DEFAULT_WHILE_STOPPED_TIMEOUT_S, metavar="S")
    ap.add_argument("--settle-timeout", type=int, default=DEFAULT_SETTLE_TIMEOUT_S, metavar="S",
                    help="after ready, wait up to S seconds for stream crons and the Worker pool")
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
    if not (0 <= args.idle_timeout <= 14400) or not (10 <= args.while_stopped_timeout <= 7200) \
            or not (0 <= args.settle_timeout <= 1800):
        print("--idle-timeout must be 0..14400, --while-stopped-timeout 10..7200 and "
              "--settle-timeout 0..1800", file=sys.stderr)
        return 2
    return request(args)


if __name__ == "__main__":
    sys.exit(main())
