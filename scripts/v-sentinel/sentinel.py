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
import json, os, re, subprocess, sys, time, urllib.request, urllib.error

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
MEM_MIN_MB = 2048


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
    # A user-facing run that emitted first-nonempty-text and still ended
    # isError=true: someone watched an answer start and stop. This cannot be
    # confused with the agent choosing not to reply, which never streams.
    streamed, failed = set(), {}
    for line in j.splitlines():
        if "first-nonempty-text" in line:
            m = re.search(r'"runId":"([^"]+)"', line)
            if m: streamed.add(m.group(1))
        elif "isError=true" in line:
            m = re.search(r"runId=([0-9a-zA-Z:_-]+)", line)
            if m:
                cause = re.search(r"rawError=([^\"]{0,60})", line)
                failed[m.group(1)] = cause.group(1).strip() if cause else "?"
    hits = [r for r in streamed & set(failed)
            if not r.startswith(("workboard", "nightshift", "announce"))
            and "internal-session-effects" not in r and "skill-workshop" not in r]
    out["cutoff"] = len(hits)
    out["cutoff_ids"] = hits
    out["cutoff_cause"] = failed[hits[0]] if hits else ""
    out["received"] = j.count("received message from")
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
