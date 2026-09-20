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
ALERT_TO = "ou_cb133fd4414f0607e8b46a3195c7b9d8"   # Tianyi
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
    r = call("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
             {"receive_id": ALERT_TO, "msg_type": "text",
              "content": json.dumps({"text": text}, ensure_ascii=False)}, tok)
    ok = r.get("code") == 0
    if not ok:
        print("feishu send failed: %s" % r, file=sys.stderr)
    return ok


def sample():
    out = {}
    out["pool"] = len(re.findall(r"worker/worker\.mjs",
                                 sh("ps -eo args")))
    out["active"] = sh("systemctl is-active %s" % UNIT).strip()
    out["nrestarts"] = sh("systemctl show %s -p NRestarts --value" % UNIT).strip()
    j = sh("journalctl -u %s --since '-%ds' --no-pager -o cat" % (UNIT, WINDOW), timeout=60)
    out["closing"] = j.count("worker pool is closing")
    out["stall"] = (j.count("Worker stream acknowledgement timed out")
                    + j.count("made no progress for")
                    + j.count("Request timed out before a response"))
    out["complete"] = j.count("dispatch complete")
    out["received"] = j.count("received message from")
    df = sh("df -BM --output=avail / | tail -1")
    out["disk_mb"] = int(re.sub(r"\D", "", df) or 0)
    fr = sh("free -m | awk '/^Mem:/{print $7}'").strip()
    out["mem_mb"] = int(fr or 0)
    return out


def main():
    st = load_state()
    s = sample()
    now = time.strftime("%H:%M")
    alerts, recovers = [], []

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
    pool_msg = ("Worker 池空了（0 个 worker 进程），而 openclaw-gateway 仍显示 active、"
                "health 200、NRestarts=0。服务看起来正常但一个请求都处理不了。"
                "这不会自愈，要 sudo systemctl restart openclaw-gateway 才能重建。"
                if s["active"] == "active" else
                "Worker 池空了（0 个 worker 进程），openclaw-gateway 状态为 %s。" % s["active"])
    latch("pool_empty", s["pool"] == 0, pool_msg,
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

    st["last_run"] = int(time.time())
    st["last_sample"] = s
    save_state(st)

    for m in alerts:
        feishu("V 线上告警 %s\n\n%s" % (now, m))
    for m in recovers:
        feishu("V 恢复 %s\n\n%s" % (now, m))

    print(json.dumps({"at": now, **s,
                      "alerts": len(alerts), "recovers": len(recovers)},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
