#!/usr/bin/env python3
"""V production sentinel. Runs on the host itself, on a systemd timer.

It exists for one failure mode: the Gateway is up by every ordinary measure
and cannot serve anybody. On 2026-09-20 a config hot reload closed the Worker
pool and left it closed for 161 minutes while systemd reported the service
active, the health endpoint returned 200 and the restart count stayed at 0.
Nobody noticed until a user asked why their groups had gone quiet.

So this deliberately does NOT ask the Gateway whether it is healthy. It counts
worker processes, reads the journal, and sends its alerts straight to Feishu
over HTTPS. Nothing in the alert path goes through the thing being watched.
"""
import calendar, json, os, re, subprocess, sys, time, urllib.request, urllib.error

STATE_PATH = "/var/lib/v-sentinel/state.json"
CONFIG_PATH = "/home/openclaw/.openclaw/openclaw.json"
# Alerts go to the dedicated "Heartbeat" group (Tianyi + the V bot only), not
# Tianyi's main DM -- changed 2026-09-24 at his request. release-drift.py
# imports feishu() from here, so it follows the same target.
ALERT_CHAT = os.environ.get("V_SENTINEL_ALERT_CHAT", "oc_ff5076a27ba5aef6700721b8c7d69f10")
# Fallback only used when ALERT_CHAT is empty: a Feishu open_id DM target.
ALERT_TO = os.environ.get("V_SENTINEL_ALERT_TO", "")
WINDOW = 180          # seconds of journal to scan each run
UNIT = "openclaw-gateway"

# A pool that reports zero workers is a total outage. One reading is enough to
# act on: close() is terminal, so the pool will not come back without a restart.
POOL_EMPTY_SAMPLES = 1
# Stalled requests. Measured baseline across three separate hours of real
# traffic on 2026-09-20: exactly zero. They appear only when the pool is full
# and users are waiting on replies that may never arrive.
STALL_WARN = 8
STALL_SAMPLES = 2
# The pool is legitimately empty while the Gateway starts: measured twice at
# about two minutes from `systemctl start` to five ready workers (2026-09-20
# 23:02->23:04, 2026-09-22 13:41->13:43). A planned restart by another session
# on 2026-09-22 fired a false outage alert at 13:42 without this grace.
STARTUP_GRACE_S = 300
# ...but not while the Gateway is crash-looping. On 2026-09-25 23:47-23:51 the
# state database failed integrity_check on every start: each attempt lived
# about 60s, both samples in the outage read "active, up 25s / 14s, pool 0",
# the grace excused both, and no alert went out for four minutes of total
# outage. After any crash the grace is off for this long.
CRASH_SUSPENDS_GRACE_S = 900
# What a crash looks like in the unit journal. Scanned from a saved cursor, so
# each line is seen exactly once however the timer and the window line up.
CRASH_PATTERNS = (
    ("Main process exited", "进程退出"),
    ('"level":"fatal"', "fatal"),
    ("integrity_check failed", "数据库完整性检查失败"),
    ("FATAL ERROR", "V8 FATAL"),
    # The 2026-09-25 state database was already failing its fast integrity
    # path at 23:22:46, 25 minutes before the crash: ensureSchema swallows the
    # failure, falls through to a schema repair, and the fence refuses it
    # while the Gateway owns the directory. Zero occurrences in the week before.
    ("refused shared state schema mutation", "状态库结构修改被拒，库可能已损坏"),
)
DISK_MIN_MB = 15360
# Both config files the Gateway and its Workers read. On 2026-10-09 a plugin
# directory listed in plugins.load.paths was deleted: the Worker file is
# re-validated on every request, so 48 turns failed in 22 minutes; the main
# file was just as invalid but would only have failed at the next Gateway
# start. Nothing else here saw either.
CONFIG_FILES = (
    ("main", CONFIG_PATH),
    ("worker", "/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json"),
)
# OpenClaw's own validator, about 2 s per file. Run it this often, not every tick.
CONFIG_VALIDATE_EVERY_S = 600
MEM_MIN_MB = 2048

# Gateway main thread. 2026-10-12 16:50-17:24 nobody could get an answer for
# half an hour while every rule above stayed green: the pool had free Workers,
# nothing crashed, and a request only counts as stalled once the thread comes
# back. What did show, from 16:01 on, was the Gateway's own liveness warning
# with the event loop pinned at 1 for over a minute at a time. Measured over
# 2026-10-05..12: zero such warnings on calm days, 11-17 on the days people
# complained (10-09, 10-10, 10-12). Three in ten minutes is sustained, not a blip.
SATURATED_ELU = 0.95
SATURATED_DEGRADED_S = 60
SATURATED_COUNT = 3
SATURATED_WINDOW_S = 600
# A single heartbeat this late means the thread was frozen that long: nothing
# was answered, no channel was read. Before 2026-10-12 the week had none over
# 20 s; that day had four, up to 65 s, and the last one started a thaw loop.
FREEZE_OVERDUE_MS = 20000
# How long a person waited for the first thing V showed them (status card or
# answer), or for V to start on their message at all. Week of 2026-10-05:
# first-visible p99 30-126 s, 0-6 turns a day over 120 s; 2026-10-12 had 36
# over 120 s and 82 that waited over 60 s just to be picked up.
SLOW_FIRST_VISIBLE_S = 120
SLOW_DISPATCH_S = 60
SLOW_TURNS_COUNT = 3
SLOW_TURNS_WINDOW_S = 600
# A conversation whose every message fails before the agent: from 13:59 on
# 2026-10-12 five chats got "restart recovery claim changed before agent
# adoption" every few minutes for over eight hours (395 failures) and nobody
# was told. Two failures of one conversation within ten minutes is a pattern.
DISPATCH_FAIL_PER_SESSION = 2
DISPATCH_FAIL_WINDOW_S = 600
REPEAT_ALERT_S = 3600
# Session disk budget (2026-10-15). session.maintenance.maxDiskBytes is compared
# with the top-level files of agents/<id>/sessions + prompt blobs + the agent
# SQLite file and its WAL. Over it, 9.1's enforcement pass deletes one archive at
# a time, rescans 31k files after each, and holds the session writer queue for
# the whole sweep: no Feishu message got past ingress for 30 minutes on 10-15
# (21:11-21:40) and again at 22:00. V sat at 98% of the 32 GiB budget for days
# before that; the database grows about 0.4 GB a day. Measuring is ~31k stats,
# so run it every DISK_BUDGET_EVERY_S, not every tick.
SESSION_STORES_ROOT = "/home/openclaw/.openclaw/agents"
DISK_BUDGET_EVERY_S = 600
# 85% of 48 GiB leaves ~7 GB, about 2-3 weeks at 2026-10 growth, to act without data loss.
DISK_BUDGET_WARN_RATIO = 0.85
# Feishu messages that sat claimed for 300 s without reaching an agent. Each one
# is a user message nobody has started on. 10-05..10-14: 0-12 a day, all inside
# known stalls; 10-15 21:16-21:34: 8.
INGRESS_STALL_COUNT = 1
# Inter-session collaboration (sessions_send through the channel inbound bridge,
# docs/inter-session/design.md): V starts a turn in another chat on a session's
# behalf. Every runId, synthetic message id and MessageSid the relay creates
# carries one of these marks, and the Feishu [firsttext-e2e.1] record of such a
# turn says origin "inter_session". Nobody typed those messages, the time a
# request waits in the relay queue is not a person waiting, and a BUSY attempt
# ends without any output by design and is retried later. So the user-wait,
# dispatch-failure and ingress-stall rules leave them out. A room turn that
# starts streaming and then breaks is still a cut-off reply people in that room
# watched, so scan_cutoffs keeps those.
A2A_MARKS = ("v-a2a-", "v-a2a:")
A2A_ORIGIN = "inter_session"


def sh(cmd, timeout=30):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True,
                              text=True, timeout=timeout).stdout
    except Exception:
        return ""


def load_state():
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(s):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(s, f)
    os.replace(tmp, STATE_PATH)


def feishu(text):
    """Send straight to Feishu. Never routed through the Gateway."""
    try:
        cfg = json.load(open(CONFIG_PATH))
        fs = cfg["channels"]["feishu"]
    except Exception as e:
        print("cannot read feishu config: %s" % e, file=sys.stderr)
        return False

    def call(url, data, tok=None):
        h = {"Content-Type": "application/json"}
        if tok:
            h["Authorization"] = "Bearer " + tok
        rq = urllib.request.Request(url, data=json.dumps(data).encode(), headers=h)
        try:
            return json.load(urllib.request.urlopen(rq, timeout=20))
        except urllib.error.HTTPError as e:
            try:
                return json.loads(e.read())
            except Exception:
                return {"code": e.code}
        except Exception as e:
            return {"code": -1, "msg": str(e)}

    t = call("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
             {"app_id": fs["appId"], "app_secret": fs["appSecret"]})
    tok = t.get("tenant_access_token")
    if not tok:
        print("no token: %s" % t, file=sys.stderr)
        return False
    id_type, receive_id = ("chat_id", ALERT_CHAT) if ALERT_CHAT else ("open_id", ALERT_TO)
    if not receive_id:
        print("no alert target configured", file=sys.stderr)
        return False
    r = call("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=" + id_type,
             {"receive_id": receive_id, "msg_type": "text",
              "content": json.dumps({"text": text}, ensure_ascii=False)}, tok)
    ok = r.get("code") == 0
    if not ok:
        print("feishu send failed: %s" % r, file=sys.stderr)
    return ok


def scan_crashes(cursor):
    """Crash lines written since the last run, and the cursor to resume from.

    The first run has no cursor and looks back one window, like the other
    journal rules."""
    since = ("--after-cursor '%s'" % cursor) if cursor else ("--since '-%ds'" % WINDOW)
    j = sh("journalctl -u %s %s --no-pager -o cat --show-cursor" % (UNIT, since), timeout=60)
    lines, new_cursor = [], cursor
    for line in j.splitlines():
        if line.startswith("-- cursor: "):
            new_cursor = line[len("-- cursor: "):].strip()
            continue
        for needle, label in CRASH_PATTERNS:
            if needle in line:
                lines.append("[%s] %s" % (label, line.strip()[:220]))
                break
    return lines, new_cursor


# "(mid-turn precheck)" on an isError line ends only the current attempt: the
# same run compacts the session and retries under the same runId. On
# 2026-10-08 four such runs (628-846 message sessions) were reported as cut
# off; every one went on to deliver a single complete answer. What the person
# can actually be left with is a failed compaction, which these lines name.
COMPACT_FAIL = re.compile(r"Auto-compaction failed|auto-compaction failed for|"
                          r"auto-compaction could not recover|auto-compaction timed out")


STREAMED = re.compile(r'"runId":"([^"]+)"[^\n]*"stage":"first-nonempty-text"')


def scan_cutoffs(journal, lookback=None):
    """Return (cut-off run ids, cause of the first, compaction failure count).

    A user-facing run that emitted first-nonempty-text and still ended
    isError=true: someone watched an answer start and stop. This cannot be
    confused with the agent choosing not to reply, which never streams.

    A long turn starts streaming minutes before it fails (2026-10-08 17:50 ->
    17:53), outside the scan window. lookback(run_ids) returns older journal
    text for just those runs, and is only called when a failure has no
    streamed line in the window.
    """
    streamed, failed, compact_fail = set(), {}, 0
    for line in journal.splitlines():
        if "first-nonempty-text" in line:
            m = re.search(r'"runId":"([^"]+)"', line)
            if m: streamed.add(m.group(1))
        elif "isError=true" in line:
            m = re.search(r"runId=([0-9a-zA-Z:_-]+)", line)
            if m and "(mid-turn precheck)" not in line:
                cause = re.search(r"rawError=([^\"]{0,60})", line)
                failed[m.group(1)] = cause.group(1).strip() if cause else "?"
        if COMPACT_FAIL.search(line):
            compact_fail += 1
    unseen = sorted(set(failed) - streamed)
    if unseen and lookback:
        streamed.update(r for r in STREAMED.findall(lookback(unseen)) if r in failed)
    # Inter-session room turns (v-a2a-…) stay in: people in that chat watched it stop.
    hits = [r for r in streamed & set(failed)
            if not r.startswith(("workboard", "nightshift", "announce"))
            and "internal-session-effects" not in r and "skill-workshop" not in r]
    return hits, (failed[hits[0]] if hits else ""), compact_fail


ISO_TS = re.compile(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?([+-]\d\d:\d\d)")
LIVENESS = re.compile(r"liveness warning: .*?degradedFor=(\d+)s.*?eventLoopUtilization=([\d.]+)")
HEARTBEAT_LATE = re.compile(r"liveness heartbeat delayed: overdue=(\d+)ms")
DISPATCH_FAIL = re.compile(r"message dispatch completed: .*?sessionKey=(\S+) .*?outcome=error"
                           r"(?: .*?error=\"([^\"]{0,80}))?")
E2E = re.compile(r"\[firsttext-e2e\.1\] (\{.*\})")


def is_a2a_line(line):
    """The line names an inter-session runId, message id or MessageSid."""
    return any(m in line for m in A2A_MARKS)


def is_a2a_record(d):
    """A [firsttext-e2e.1] record of an inter-session turn (request, ask, wake-up
    or a BUSY attempt). The origin field survives a preset runId the harness did
    not adopt; the id prefixes cover a bridge build without the field."""
    if d.get("origin") == A2A_ORIGIN:
        return True
    return any(isinstance(d.get(k), str) and d[k].startswith(A2A_MARKS[0])
               for k in ("runId", "inboundMessageId"))


def e2e_records(journal):
    for line in journal.splitlines():
        m = E2E.search(line)
        if not m:
            continue
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        if isinstance(d, dict):
            yield d


def line_time(line):
    """Epoch seconds from the ISO stamp the Gateway puts on its own lines, or None."""
    m = ISO_TS.match(line)
    if not m:
        return None
    try:
        t = time.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None
    sign, hh, mm = m.group(2)[0], int(m.group(2)[1:3]), int(m.group(2)[4:6])
    off = (hh * 3600 + mm * 60) * (1 if sign == "+" else -1)
    return calendar.timegm(t) - off


def scan_main_thread(journal):
    """Events from the Gateway's own liveness diagnostics in this window.

    saturated: [(epoch, degradedFor s)] warnings with the loop pinned for a minute+
    freezes:   [(epoch, overdue ms)] heartbeats at least FREEZE_OVERDUE_MS late
    """
    saturated, freezes = [], []
    for line in journal.splitlines():
        if "liveness" not in line:
            continue
        m = LIVENESS.search(line)
        if m and int(m.group(1)) >= SATURATED_DEGRADED_S and float(m.group(2)) >= SATURATED_ELU:
            saturated.append((line_time(line), int(m.group(1))))
            continue
        m = HEARTBEAT_LATE.search(line)
        if m and int(m.group(1)) >= FREEZE_OVERDUE_MS:
            freezes.append((line_time(line), int(m.group(1))))
    return saturated, freezes


def scan_inter_session_turns(journal):
    """[(sessionKey, start epoch s, end epoch s)] of the inter-session turns whose
    Feishu handler finished in this window, from their [firsttext-e2e.1] records."""
    out = []
    for d in e2e_records(journal):
        if not is_a2a_record(d):
            continue
        marks = [d[k] for k in ("sentAtMs", "receivedAtMs", "dispatcherAtMs")
                 if isinstance(d.get(k), (int, float))]
        end = d.get("endAtMs")
        if marks and isinstance(end, (int, float)) and d.get("sessionKey"):
            out.append((d["sessionKey"], min(marks) / 1000.0, end / 1000.0))
    return out


def in_a2a_turn(t, key, turns):
    """Whether a failure logged at t (whole seconds) for session `key` fell inside
    one of those turns. Feishu runs one chat's inbound messages one after the
    other, so a failure in that session between the turn's start and the end of
    its handler is the turn's own."""
    return t is not None and any(k == key and s - 1 <= t <= e + 1 for k, s, e in turns)


def scan_dispatch_failures(journal, a2a_turns=()):
    """[(epoch, sessionKey, error)] for messages that failed before reaching the agent.

    The core's "message dispatch completed" line carries the session but no
    runId, so an inter-session turn is recognised by a mark on the line or by
    falling inside one of a2a_turns (scan_inter_session_turns)."""
    out = []
    for line in journal.splitlines():
        if "message dispatch completed" not in line or "outcome=error" not in line:
            continue
        if is_a2a_line(line):
            continue
        m = DISPATCH_FAIL.search(line)
        if m:
            t = line_time(line)
            if in_a2a_turn(t, m.group(1), a2a_turns):
                continue
            out.append((t, m.group(1), (m.group(2) or "?").strip()))
    return out


def scan_user_waits(journal):
    """[(inbound message id, sessionKey, first-visible s or None, dispatch delay s)].

    One [firsttext-e2e.1] line is written per inbound message when its turn ends.
    first-visible is the earliest status card or answer push after the person
    sent it; None when nothing was pushed (a deliberate silence or a failure).
    Inter-session turns, BUSY attempts included, are nobody's wait (A2A_MARKS).
    """
    out = []
    for d in e2e_records(journal):
        if is_a2a_record(d):
            continue
        sent = d.get("sentAtMs")
        if not sent:
            continue
        pushes = [d[k] for k in ("firstStatusPushAtMs", "firstPushAtMs", "firstAnswerPushAtMs") if d.get(k)]
        fv = (min(pushes) - sent) / 1000 if pushes else None
        dd = (d["dispatcherAtMs"] - sent) / 1000 if d.get("dispatcherAtMs") else None
        out.append((d.get("inboundMessageId") or "%s@%s" % (d.get("sessionKey"), sent),
                    d.get("sessionKey") or "?", fv, dd))
    return out


def recent(events, now_s, window_s):
    return [e for e in events if e[0] is not None and now_s - e[0] <= window_s]


def short_key(k):
    """agent:makaron:feishu:group:oc_39d9f852... -> group:oc_39d9f852"""
    parts = k.split(":")
    return ":".join(parts[-2:])[:28] if len(parts) >= 2 else k[:28]


def missing_plugin_paths(path):
    """plugins.load.paths entries that do not exist on disk; None if unreadable."""
    try:
        with open(path) as f:
            c = json.load(f)
    except Exception:
        return None
    paths = ((c.get("plugins") or {}).get("load") or {}).get("paths") or []
    return [p for p in paths if isinstance(p, str) and not os.path.exists(p)]


def config_missing_message(where, path, missing, effect):
    """Alert text for missing_plugin_paths(); built every tick, so [] must not raise."""
    if missing is None:
        return "%s 读不出来（%s）。" % (where, path)
    if not missing:
        return ""
    return ("%s 的 plugins.load.paths 里有 %d 个目录已不存在（%s）。%s"
            "停用插件请改 plugins.entries.<id>.enabled=false，不要删目录。"
            % (where, len(missing), missing[0], effect))


def scan_worker_failures(journal):
    """(Worker requests that failed before the model, how many for invalid config)."""
    lines = [l for l in journal.splitlines() if "Worker Agent request failed" in l]
    return len(lines), sum(1 for l in lines if "InvalidConfigError" in l)


def gateway_cli():
    """node + dist/index.js exactly as the running unit starts them."""
    m = re.search(r"(/\S+/node)\b[^;]*?\s(/\S+/dist/index\.js)",
                  sh("systemctl show %s -p ExecStart --value" % UNIT))
    return (m.group(1), m.group(2)) if m else None


def validate_config(path, cli):
    """(ok, first error line). Runs as the service user, like the Gateway."""
    if not cli:
        return True, ""
    out = sh("cd /tmp && runuser -u openclaw -- env HOME=/home/openclaw OPENCLAW_CONFIG_PATH=%s "
             "timeout 60 %s %s config validate 2>&1; echo \"rc=$?\"" % (path, cli[0], cli[1]),
             timeout=75)
    if out.rstrip().endswith("rc=0"):
        return True, ""
    if out.rstrip().endswith("rc=124") or not out.strip():
        # The validator timing out says nothing about the file; do not cry wolf.
        return True, ""
    lines = [l.strip() for l in out.splitlines() if l.strip() and not l.startswith("rc=")]
    first = next((l for l in lines if "\u00d7" in l or "path not found" in l),
                 lines[0] if lines else "validator gave no output")
    return False, first[:200]


BYTE_UNITS = {"b": 1, "kb": 1024, "k": 1024, "mb": 1024 ** 2, "m": 1024 ** 2,
              "gb": 1024 ** 3, "g": 1024 ** 3, "tb": 1024 ** 4, "t": 1024 ** 4}
MIGRATION_ARCHIVE = re.compile(r"\.migrated(?:\.\d+)?$|\.jsonl\.pre-doctor-(?:branch|openai-codex)-repair-.*\.bak$")


def parse_byte_size(raw):
    """OpenClaw's parseByteSize: binary units, plain numbers are bytes. None = disabled/unknown."""
    if raw is False or raw is None:
        return None if raw is False else 10 * 1024 ** 3
    m = re.match(r"^(\d+(?:\.\d+)?)([a-z]+)?$", str(raw).strip().lower())
    if not m or (m.group(2) or "b") not in BYTE_UNITS:
        return None
    return int(round(float(m.group(1)) * BYTE_UNITS[m.group(2) or "b"]))


def measure_session_budgets():
    """[(agent, totalBytes, maxBytes, mode)] the way disk-budget measureSessionPhysicalDiskUsage counts.

    Measured in warn mode too: the Gateway then never cleans up, so the budget is
    only a capacity line and this is the only thing watching it."""
    try:
        cfg = json.load(open(CONFIG_PATH))
    except Exception:
        return []
    m = ((cfg.get("session") or {}).get("maintenance") or {})
    mode = m.get("mode", "enforce")
    max_bytes = parse_byte_size(m.get("maxDiskBytes"))
    if not max_bytes:
        return []
    out = []
    for agent in sorted(os.listdir(SESSION_STORES_ROOT)) if os.path.isdir(SESSION_STORES_ROOT) else []:
        sessions = os.path.join(SESSION_STORES_ROOT, agent, "sessions")
        if not os.path.isdir(sessions):
            continue
        total = 0
        with os.scandir(sessions) as it:
            for e in it:
                if e.is_file(follow_symlinks=False) and not MIGRATION_ARCHIVE.search(e.name):
                    total += e.stat(follow_symlinks=False).st_size
        blobs = os.path.join(sessions, "skills-prompts", "sha256")
        if os.path.isdir(blobs):
            for prefix in os.listdir(blobs):
                d = os.path.join(blobs, prefix)
                if re.match(r"^[a-f0-9]{2}$", prefix) and os.path.isdir(d):
                    total += sum(e.stat().st_size for e in os.scandir(d) if e.is_file(follow_symlinks=False))
        db = os.path.join(SESSION_STORES_ROOT, agent, "agent", "openclaw-agent.sqlite")
        for f in (db, db + "-wal"):
            if os.path.isfile(f):
                total += os.path.getsize(f)
        out.append((agent, total, max_bytes, mode))
    return out


def sample(cursor=None):
    out = {}
    out["pool"] = len(re.findall(r"worker/worker\.mjs",
                                 sh("ps -eo args")))
    out["active"] = sh("systemctl is-active %s" % UNIT).strip()
    out["nrestarts"] = sh("systemctl show %s -p NRestarts --value" % UNIT).strip()
    # Seconds since the unit last entered active, from the monotonic clock so
    # wall-clock changes cannot fake it.
    try:
        mono = int(sh("systemctl show %s -p ActiveEnterTimestampMonotonic --value" % UNIT).strip() or 0)
        boot = float(open("/proc/uptime").read().split()[0])
        out["gw_up_s"] = int(boot - mono / 1e6) if mono else None
    except Exception:
        out["gw_up_s"] = None
    j = sh("journalctl -u %s --since '-%ds' --no-pager -o cat" % (UNIT, WINDOW), timeout=60)
    out["closing"] = j.count("worker pool is closing")
    out["stall"] = (j.count("Worker stream acknowledgement timed out")
                    + j.count("made no progress for")
                    + j.count("Request timed out before a response"))
    out["complete"] = j.count("dispatch complete")
    def lookback(run_ids):
        # Only the failed runs, only their streamed marker: a few lines, not a
        # 20-minute dump. scan_cutoffs only yields [0-9a-zA-Z:_-] ids, none of
        # which is special in an ERE or inside single quotes.
        pat = "|".join(run_ids)
        return sh("journalctl -u %s --since '-1200s' --no-pager -o cat "
                  "| grep -aE '(%s).*first-nonempty-text'" % (UNIT, pat), timeout=60)
    out["cutoff_ids"], out["cutoff_cause"], out["compact_fail"] = scan_cutoffs(j, lookback)
    out["cutoff"] = len(out["cutoff_ids"])
    out["received"] = j.count("received message from")
    out["worker_fail"], out["worker_invalid"] = scan_worker_failures(j)
    out["saturated"], out["freezes"] = scan_main_thread(j)
    out["a2a_turns"] = scan_inter_session_turns(j)
    out["dispatch_fail"] = scan_dispatch_failures(j, out["a2a_turns"])
    out["waits"] = scan_user_waits(j)
    # Each stalled event logs two lines (the stall, then "spooled update … failed"); count events.
    out["ingress_stalled"] = sum(1 for l in j.splitlines()
                                 if "claim→adoption stalled" in l and "spooled update" not in l
                                 and not is_a2a_line(l))
    out["budget_exhausted"] = j.count("session history disk budget exhausted")
    out["cfg_missing"] = {name: missing_plugin_paths(path) for name, path in CONFIG_FILES}
    out["crash_lines"], out["journal_cursor"] = scan_crashes(cursor)
    df = sh("df -BM --output=avail / | tail -1")
    out["disk_mb"] = int(re.sub(r"\D", "", df) or 0)
    fr = sh("free -m | awk '/^Mem:/{print $7}'").strip()
    out["mem_mb"] = int(fr or 0)
    return out


def main():
    st = load_state()
    s = sample(st.get("journal_cursor"))
    st["journal_cursor"] = s.pop("journal_cursor")
    now = time.strftime("%H:%M")
    now_s = int(time.time())
    alerts, recovers, notices = [], [], []

    # Crashes. The first one alerts at once; further ones within ten minutes
    # are folded into the next message so a crash loop is not a message stream.
    crash_lines = s.pop("crash_lines")
    if crash_lines:
        if not st.get("crash_pending"):
            st["crash_first"] = now
        st["last_crash_at"] = now_s
        st["crash_pending"] = st.get("crash_pending", 0) + len(crash_lines)
        st["crash_last_lines"] = crash_lines[-3:]
        st["crash_last"] = now
    if st.get("crash_pending") and now_s - st.get("crash_last_alert", 0) >= 600:
        span = st.get("crash_first", now)
        if st.get("crash_last", now) != span:
            span += "–" + st["crash_last"]
        alerts.append("Gateway 日志在 %s 出现 %d 条崩溃/损坏信号（当前 NRestarts=%s，已运行 %s 秒）：\n%s"
                      % (span, st["crash_pending"], s["nrestarts"], s.get("gw_up_s"),
                         "\n".join(st.get("crash_last_lines", []))))
        st["crash_pending"] = 0
        st["crash_last_alert"] = now_s
    s["crashes"] = len(crash_lines)

    # Restarts the unit-state rule cannot see: a restart finishing inside one
    # timer interval leaves the unit "active" at both samples. NRestarts only
    # counts automatic restarts, so also compare uptime with the time elapsed.
    prev = st.get("last_sample") or {}
    elapsed = now_s - st.get("last_run", now_s)
    up = s.get("gw_up_s")
    restarted = (up is not None and prev.get("gw_up_s") is not None and elapsed > 0
                 and up + 5 < elapsed) or \
                (prev.get("nrestarts", "").isdigit() and s["nrestarts"].isdigit()
                 and int(s["nrestarts"]) > int(prev["nrestarts"]))
    crashed_recently = now_s - st.get("last_crash_at", 0) <= CRASH_SUSPENDS_GRACE_S
    if restarted and not crash_lines:
        notices.append("openclaw-gateway 重启了（已运行 %s 秒，NRestarts %s→%s）。%s"
                       % (up, prev.get("nrestarts", "?"), s["nrestarts"],
                          "这是崩溃之后的重新启动。" if crashed_recently else
                          "日志里没有崩溃信号，多半是手动或发版重启；若不是计划内的，请查是谁。"))

    def latch(key, bad, fire_msg, clear_msg, need=1):
        c = st.get(key + "_n", 0)
        c = c + 1 if bad else 0
        st[key + "_n"] = c
        was = st.get(key, False)
        if c >= need and not was:
            st[key] = True
            alerts.append(fire_msg)
        elif not bad and was:
            st[key] = False
            recovers.append(clear_msg)

    # When the unit itself is down an empty pool is merely a consequence, and
    # the separate unit alert says so. The dangerous case is the one where
    # every ordinary signal stays green, so say that plainly only when it is true.
    if crashed_recently:
        pool_msg = ("Worker 池空了（0 个 worker 进程），Gateway 在崩溃后反复重启"
                    "（NRestarts=%s，本次只运行了 %s 秒）。重启解决不了，先看崩溃原因。"
                    % (s["nrestarts"], up))
    elif s["active"] == "active":
        pool_msg = ("Worker 池空了（0 个 worker 进程），而 openclaw-gateway 仍显示 active、"
                    "health 200、NRestarts=0。服务看起来正常但一个请求都处理不了。"
                    "这不会自愈，要 sudo systemctl restart openclaw-gateway 才能重建。")
    else:
        pool_msg = "Worker 池空了（0 个 worker 进程），openclaw-gateway 状态为 %s。" % s["active"]
    starting = (up is not None and up < STARTUP_GRACE_S and not crashed_recently)
    latch("pool_empty", s["pool"] == 0 and not starting, pool_msg,
          "Worker 池已恢复（%d 个 worker）。" % s["pool"],
          need=POOL_EMPTY_SAMPLES)

    latch("pool_closing", s["closing"] > 0,
          "%d 个请求被 'worker pool is closing' 拒绝。用户会看到「Agent couldn't generate a response」。"
          "池子已关闭且不会自己重建，需要重启 Gateway。" % s["closing"],
          "'pool is closing' 已停止出现。")

    latch("unit_down", s["active"] != "active",
          "openclaw-gateway 不在运行（状态 %s）。" % s["active"],
          "openclaw-gateway 恢复运行。")

    latch("stalled", s["stall"] >= STALL_WARN,
          "%d 个请求卡住（%d 分钟内）。Worker 池 %d 个，可能被一个大批次占满，"
          "普通消息排不上。正常值是 0。" % (s["stall"], WINDOW // 60, s["pool"]),
          "卡住的请求已清零。", need=STALL_SAMPLES)

    latch("disk", s["disk_mb"] and s["disk_mb"] < DISK_MIN_MB,
          "根分区只剩 %.1f GB。" % (s["disk_mb"] / 1024),
          "磁盘空间已恢复（%.1f GB）。" % (s["disk_mb"] / 1024))

    latch("mem", s["mem_mb"] and s["mem_mb"] < MEM_MIN_MB,
          "主机可用内存只剩 %.1f GB。" % (s["mem_mb"] / 1024),
          "内存已恢复（%.1f GB）。" % (s["mem_mb"] / 1024))

    # Config files. A missing plugin directory is checked every tick (cheap);
    # OpenClaw's validator every CONFIG_VALIDATE_EVERY_S, its verdict kept in
    # state so the latch sees a steady signal in between.
    for name, path in CONFIG_FILES:
        missing = s["cfg_missing"].get(name)
        where = "worker 配置" if name == "worker" else "主配置 openclaw.json"
        effect = ("worker 每个请求都会重新校验它，所以现在每个 worker 回合都会失败。"
                  if name == "worker" else
                  "正在运行的 Gateway 暂时不受影响，但下次重启时会起不来，在修好之前不要重启。")
        latch("cfg_missing_" + name, missing is None or bool(missing),
              config_missing_message(where, path, missing, effect),
              "%s 里的插件目录都已存在。" % where)
    if now_s - st.get("cfg_validated_at", 0) >= CONFIG_VALIDATE_EVERY_S:
        cli = gateway_cli()
        st["cfg_valid"] = {name: validate_config(path, cli) for name, path in CONFIG_FILES}
        st["cfg_validated_at"] = now_s
    for name, verdict in (st.get("cfg_valid") or {}).items():
        ok, why = verdict
        where = "worker 配置" if name == "worker" else "主配置 openclaw.json"
        latch("cfg_invalid_" + name, not ok,
              "%s 通不过 openclaw config validate：%s" % (where, why),
              "%s 重新通过校验。" % where)
    s["cfg_valid"] = st.get("cfg_valid")

    latch("worker_invalid", s["worker_invalid"] > 0,
          "%d 分钟内有 %d 个 worker 请求因为配置无效直接失败（InvalidConfigError），"
          "用户看到的是「Agent couldn't generate a response」。" % (WINDOW // 60, s["worker_invalid"]),
          "worker 请求不再因为配置无效失败。")

    # --- Session disk budget and the ingress it starves (2026-10-15) ---
    if now_s - st.get("budget_measured_at", 0) >= DISK_BUDGET_EVERY_S:
        try:
            st["budgets"] = [list(row) for row in measure_session_budgets()]
        except Exception as e:
            st["budgets"] = []
            print("session budget measurement failed: %s" % e, file=sys.stderr)
        st["budget_measured_at"] = now_s
    budgets = [tuple(b[:3]) for b in st.get("budgets") or []]
    enforcing = any((b[3] if len(b) > 3 else "enforce") == "enforce" for b in st.get("budgets") or [])
    s["budget_max_ratio"] = round(max([t / m for _, t, m in budgets] or [0]), 3)
    near = [(a, t, m) for a, t, m in budgets if t >= DISK_BUDGET_WARN_RATIO * m]
    over = [(a, t, m) for a, t, m in budgets if t > m]
    fmt = lambda rows: "、".join("%s %.1f/%.1f GB（%d%%）" % (a, t / 1e9, m / 1e9, round(100 * t / m)) for a, t, m in rows)
    consequence = ("超过后 Gateway 会自动清理（enforce），未打补丁时会长时间占住 session 写队列，飞书消息进不来（10-15 21:11 起的事故）。"
                   if enforcing else
                   "当前是 warn 模式，超过也不会自动清理；这条线是容量线，需要人处理（扩上限、冷存储或源头减量）。")
    latch("budget_near", bool(near),
          "session 磁盘用量到了预算的 %d%% 以上：%s。%s" % (round(DISK_BUDGET_WARN_RATIO * 100), fmt(near), consequence),
          "session 磁盘预算余量已恢复。")
    latch("budget_over", bool(over),
          "session 磁盘用量已超预算：%s。%s" % (fmt(over), consequence),
          "session 磁盘用量已回到预算以内。")
    latch("budget_exhausted", s.pop("budget_exhausted", 0) > 0,
          "Gateway 报告 session 磁盘预算已耗尽（能删的都删了仍超预算），自动维护退避 30 分钟。"
          "调高 session.maintenance.maxDiskBytes 或导出删除旧会话。",
          "session 磁盘预算耗尽告警已不再出现。")
    latch("ingress_stalled", s.get("ingress_stalled", 0) >= INGRESS_STALL_COUNT,
          "%d 分钟内 %d 条飞书消息被认领 5 分钟仍没进入 agent（claim→adoption stalled）。"
          "用户发的消息 V 没开始处理；常见原因是 Gateway 主线程或 session 写队列被占住。"
          % (WINDOW // 60, s.get("ingress_stalled", 0)),
          "飞书入站已不再卡在认领阶段。")

    # --- What the people talking to V actually experience (2026-10-12) ---
    # Each window overlaps the previous one, so events are kept by identity
    # and judged over a rolling window rather than per sample.
    sat = st.setdefault("sat_events", {})
    for t, deg in s.pop("saturated"):
        if t is not None:
            sat[str(t)] = deg
    frz = st.setdefault("freeze_events", {})
    new_freezes = []
    for t, ms in s.pop("freezes"):
        if t is not None and str(t) not in frz:
            frz[str(t)] = ms
            new_freezes.append(ms)
    df = st.setdefault("dispatch_fail_events", {})
    for t, key, err in s.pop("dispatch_fail"):
        if t is not None:
            df["%d|%s" % (t, key)] = err
    # A failure the previous window caught before its inter-session turn's
    # record was written (the window edge fell between the two lines).
    a2a_turns = s.pop("a2a_turns", [])
    s["a2a_turns"] = len(a2a_turns)
    for k in [k for k in df if in_a2a_turn(int(k.split("|", 1)[0]), k.split("|", 1)[1], a2a_turns)]:
        del df[k]
    waits = st.setdefault("wait_events", {})
    for mid, key, fv, dd in s.pop("waits"):
        if mid not in waits:
            waits[mid] = [now_s, key, fv, dd]
    for d, horizon in ((sat, 1800), (frz, 1800), (waits, 1800)):
        for k in [k for k, v in d.items() if now_s - (int(k) if d is not waits else v[0]) > horizon]:
            del d[k]
    for k in [k for k in df if now_s - int(k.split("|", 1)[0]) > 7200]:
        del df[k]

    sat_recent = [int(k) for k in sat if now_s - int(k) <= SATURATED_WINDOW_S]
    s["saturated_10m"] = len(sat_recent)
    latch("saturated", len(sat_recent) >= SATURATED_COUNT,
          "Gateway 主线程持续满负荷：10 分钟内 %d 次「事件循环占满超过 1 分钟」（最长连续 %d 秒）。"
          "所有消息都在排队，用户会等很久甚至收不到回复；worker 有空位也没用。"
          "常见原因是大会话被整段同步读取。" % (len(sat_recent), max([sat[str(t)] for t in sat_recent] or [0])),
          "Gateway 主线程已不再持续满负荷。")

    if new_freezes and now_s - st.get("freeze_last_alert", 0) >= 600:
        alerts.append("Gateway 主线程刚刚整个卡住了 %d 秒（%d 次超过 %d 秒）。卡住期间没有任何消息被处理；"
                      "超过 75 秒会进入每 30 秒关一次入口的循环，只有重启能清。"
                      % (max(new_freezes) // 1000, len(new_freezes), FREEZE_OVERDUE_MS // 1000))
        st["freeze_last_alert"] = now_s

    slow = [(v[2], v[3], v[1]) for v in waits.values()
            if now_s - v[0] <= SLOW_TURNS_WINDOW_S
            and ((v[2] or 0) > SLOW_FIRST_VISIBLE_S or (v[3] or 0) > SLOW_DISPATCH_S)]
    s["slow_turns_10m"] = len(slow)
    worst = max([max(fv or 0, dd or 0) for fv, dd, _ in slow] or [0])
    latch("slow_turns", len(slow) >= SLOW_TURNS_COUNT,
          "用户在等：10 分钟内 %d 条消息要等 %d 秒以上才看到 V 的第一个反应（最长 %d 秒，涉及 %d 个会话）。"
          "平时一天不超过几条。" % (len(slow), SLOW_DISPATCH_S, worst, len({k for _, _, k in slow})),
          "用户等待时间已恢复正常。")

    per = {}
    for k, err in df.items():
        t, key = k.split("|", 1)
        if now_s - int(t) <= DISPATCH_FAIL_WINDOW_S:
            n, _ = per.get(key, (0, err))
            per[key] = (n + 1, err)
    bad = {k: v for k, v in per.items() if v[0] >= DISPATCH_FAIL_PER_SESSION}
    told = st.setdefault("dispatch_fail_told", {})
    fresh_bad = {k: v for k, v in bad.items() if now_s - told.get(k, 0) >= REPEAT_ALERT_S}
    if fresh_bad:
        for k in fresh_bad:
            told[k] = now_s
        total = {k: sum(1 for x in df if x.split("|", 1)[1] == k) for k in fresh_bad}
        alerts.append("%d 个会话发给 V 的消息在进入 agent 之前就失败了，对方收不到任何回复：\n%s"
                      % (len(fresh_bad), "\n".join("  · %s：近 2 小时 %d 次，%s" % (short_key(k), total[k], v[1][:60])
                                                   for k, v in sorted(fresh_bad.items()))))
    for k in [k for k in told if k not in per and now_s - told[k] >= 1800]:
        del told[k]
        recovers.append("会话 %s 30 分钟内没有再出现分发失败。" % short_key(k))
    s["dispatch_fail_sessions"] = len(bad)

    # Discrete events, not a state, so no latch. Measured 2026-09-23: about
    # five a day. Say it at most once an hour, carrying the count, so a bad
    # evening is one message rather than a stream of them.
    # The journal window (180s) overlaps the 120s timer, so the same run can
    # appear in two consecutive samples. Count each run once.
    seen = st.setdefault("cutoff_seen", {})
    fresh = [r for r in s.get("cutoff_ids", []) if r not in seen]
    for r in fresh:
        seen[r] = now_s
    for r in [r for r, t in seen.items() if now_s - t > 900]:
        del seen[r]
    st["cutoff_pending"] = st.get("cutoff_pending", 0) + len(fresh)
    if fresh:
        st["cutoff_last_cause"] = s.get("cutoff_cause", "")
    if st["cutoff_pending"] and now_s - st.get("cutoff_last_alert", 0) >= 3600:
        alerts.append("%d 次回复说到一半断掉（用户看到了开头，没收到结尾）。最近一次原因：%s。"
                      "这不是 V 选择不回复，那种情况不会开始输出。"
                      % (st["cutoff_pending"], st.get("cutoff_last_cause") or "未知"))
        st["cutoff_pending"] = 0
        st["cutoff_last_alert"] = now_s

    # The person asked in a session too large for the model and compaction
    # could not shrink it, so they got the "context too large" error instead
    # of an answer. Rare; same once-an-hour cap as above.
    if s.get("compact_fail") and now_s - st.get("compact_fail_last_alert", 0) >= 3600:
        alerts.append("%d 次会话超出模型上下文后自动压缩失败，用户收到的是报错而不是回答。"
                      "可以让对方 /new 开新会话。" % s["compact_fail"])
        st["compact_fail_last_alert"] = now_s

    st["last_run"] = now_s
    st["last_sample"] = s
    save_state(st)

    for m in alerts:
        feishu("V 线上告警 %s\n\n%s" % (now, m))
    for m in recovers:
        feishu("V 恢复 %s\n\n%s" % (now, m))
    for m in notices:
        feishu("V 通知 %s\n\n%s" % (now, m))

    print(json.dumps({"at": now, **s, "alerts": len(alerts),
                      "recovers": len(recovers), "notices": len(notices)},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
