#!/usr/bin/env python3
"""Watch whether V's data actually flows hot -> warm -> cold, and what it costs. Runs on V.

Tiers (docs/v-storage-tiering-plan.md):
  T0  system disk  /                       fixed size, holds live databases
  T1  data disk    /srv/openclaw-data/disk1 grows (autogrow.py)
  T2  COS archive                           filled by the archiver (v-archive)

Once a day this records one line in history.jsonl: tier sizes, the biggest
categories, bytes moved between tiers and deleted (from the movers' receipts),
and the monthly cost. It alerts only when something is wrong:

  * T0 will be full within `t0_full_days` at the 7-day rate
  * T1 will hit the autogrow cap within `t1_cap_days`
  * a mover that is supposed to run (policy `movers`) has not succeeded for
    `mover_stale_hours`, or a category that should drain keeps growing on T0
  * projected monthly storage cost exceeds `budget_cny`
  * autogrow has not reported for 30 minutes, or reports an error / pause

and on Mondays (policy `weekly_report`) it sends one summary: sizes, flows,
cost and the trend. Everything else only goes to the history file.

Nothing here walks a large tree. Category sizes come from what the
storage-lifecycle job already measures each morning, file sizes of the live
databases, and one small `du` of yesterday's Codex rollout directory.

    flow.py            record today, alert on problems, weekly summary on Mondays
    flow.py --report   print the summary without sending or recording
    flow.py --send     record and send the summary now
"""
import datetime
import glob
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HOME = Path("/home/openclaw")
AGENT = HOME / ".openclaw/agents/makaron/agent"
STATE_DIR = Path(os.environ.get("V_FLOW_STATE_DIR", "/var/lib/v-storage-flow"))
HISTORY = STATE_DIR / "history.jsonl"
STATE = STATE_DIR / "state.json"
POLICY_PATH = Path(os.environ.get("V_STORAGE_POLICY", "/etc/v-storage/policy.json"))
AUTOGROW_STATUS = Path("/var/lib/v-disk-autogrow/status.json")
LIFECYCLE_EVIDENCE = HOME / ".openclaw/backups/storage-maintenance"
WORK_ARCHIVE_RECEIPTS = HOME / "backups/storage-maintenance"
ARCHIVE_RECEIPTS = Path("/var/lib/v-archive/receipts.jsonl")   # v-archive writes one line per move
COS_USAGE = Path("/var/lib/v-archive/cos-usage.json")           # {"STANDARD": bytes, "ARCHIVE": ..., "at": ts}
GOVERNANCE_DELETIONS = Path("/var/lib/v-storage-governance/deletions.jsonl")
SENTINEL = "/opt/v-sentinel"
GB = 1e9
GIB = 1024 ** 3
DAY = 86400
TZ = datetime.timezone(datetime.timedelta(hours=8))

DEFAULTS = {
    "t0_full_days": 14,
    "t1_cap_days": 14,
    "mover_stale_hours": 48,
    "budget_cny": 450,
    "weekly_report": True,
    # CNY per GB-month. Disk price comes from autogrow (real renew price); COS list prices
    # for Singapore, approximate; correct them from the bill when COS is live.
    "cos_price": {"STANDARD": 0.12, "STANDARD_IA": 0.09, "ARCHIVE": 0.033, "DEEP_ARCHIVE": 0.015},
    "image_cny_per_month": 7.2,      # each custom image beyond the 5 free ones
    "disk_backup_cny_per_month": 0,  # set when a data-disk backup is bought
    # Movers expected to run. Empty until each is installed, so an absent mover is not an alarm.
    "movers": {},                    # e.g. {"v-archive": {"unit": "v-archive.service"}}
    # Categories that should stop growing on T0 once their mover exists.
    "drain": {},                     # e.g. {"output-alt": "v-archive"}
}


def load_policy():
    p = json.loads(json.dumps(DEFAULTS))
    if POLICY_PATH.exists():
        p.update(json.loads(POLICY_PATH.read_text()).get("flow", {}))
    return p


# ---------- measurements ----------

def fs_usage(path):
    st = os.statvfs(path)
    used = (st.f_blocks - st.f_bfree) * st.f_frsize
    return {"size": st.f_blocks * st.f_frsize, "used": used, "free": st.f_bavail * st.f_frsize}


def file_size(*paths):
    total = 0
    for p in paths:
        try:
            total += os.stat(p).st_size
        except FileNotFoundError:
            pass
    return total


def du_bytes(path, timeout=600):
    try:
        out = subprocess.run(["ionice", "-c2", "-n7", "nice", "-n19", "du", "-sxB1", str(path)],
                             capture_output=True, text=True, timeout=timeout).stdout
        return int(out.split()[0]) if out else 0
    except Exception:
        return None


def lifecycle_inventory():
    """Newest capacity-inventory.tsv from openclaw-storage-lifecycle (already a daily du)."""
    files = sorted(glob.glob(str(LIFECYCLE_EVIDENCE / "*/capacity-inventory.tsv")))
    if not files:
        return {}, None
    names = {"/workspace/work": "work", "/srv/openclaw-data/output-alt": "output-alt",
             "/.openclaw/agents": "agents", "/.openclaw/nightshift": "nightshift"}
    out = {}
    for line in Path(files[-1]).read_text().splitlines():
        size, _, path = line.partition("\t")
        for suffix, name in names.items():
            if path.endswith(suffix):
                out[name] = int(size)
    return out, os.path.getmtime(files[-1])


def receipts_since(since):
    """Bytes moved between tiers and deleted since `since`, by (from, to)."""
    flows = {}

    def add(key, n):
        flows[key] = flows.get(key, 0) + n

    if ARCHIVE_RECEIPTS.exists():
        for line in ARCHIVE_RECEIPTS.read_text().splitlines():
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get("at", 0) >= since:
                add("%s->%s" % (r.get("from"), r.get("to")), int(r.get("bytes", 0)))
    # The hand-run work archiver (archive-to-data.sh): TSV with a header naming a `bytes`
    # column and, in later versions, a `result` column (only "moved" counts).
    for f in glob.glob(str(WORK_ARCHIVE_RECEIPTS / "work-archive-*.tsv")):
        if os.path.getmtime(f) < since:
            continue
        rows = Path(f).read_text().splitlines()
        if not rows:
            continue
        head = rows[0].split("\t")
        if "bytes" not in head:
            continue
        bi, ri = head.index("bytes"), head.index("result") if "result" in head else None
        for line in rows[1:]:
            cols = line.split("\t")
            if len(cols) > bi and cols[bi].isdigit() and (ri is None or (len(cols) > ri and cols[ri] == "moved")):
                add("T0->T1", int(cols[bi]))
    if GOVERNANCE_DELETIONS.exists():
        for line in GOVERNANCE_DELETIONS.read_text().splitlines()[-5000:]:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            at = r.get("at") or r.get("deletedAt")
            ts = at if isinstance(at, (int, float)) else _iso(at)
            if ts and ts >= since:
                add("deleted", int(r.get("bytes") or r.get("sizeBytes") or 0))
    return flows


def _iso(s):
    try:
        return datetime.datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def measure(now):
    t0 = fs_usage("/")
    t1 = fs_usage("/srv/openclaw-data/disk1") if os.path.ismount("/srv/openclaw-data/disk1") else None
    inv, inv_at = lifecycle_inventory()
    yday = datetime.datetime.fromtimestamp(now - DAY, TZ)
    rollout_dir = AGENT / "codex-home/sessions" / yday.strftime("%Y/%m/%d")
    cats = {
        "makaron-db": file_size(AGENT / "openclaw-agent.sqlite", AGENT / "openclaw-agent.sqlite-wal"),
        "codex-db": file_size(*glob.glob(str(AGENT / "codex-home/*.sqlite*"))),
        "codex-rollout-yesterday": du_bytes(rollout_dir) if rollout_dir.exists() else 0,
    }
    cats.update({k: v for k, v in inv.items()})
    cos = json.loads(COS_USAGE.read_text()) if COS_USAGE.exists() else None
    return {"at": int(now), "day": datetime.datetime.fromtimestamp(now, TZ).strftime("%Y-%m-%d"),
            "t0": t0, "t1": t1, "t2": cos, "cats": cats, "inventoryAt": inv_at}


# ---------- analysis (pure, tested) ----------

def rate_per_day(history, now, pick, days=7):
    """Average change per day of pick(record) over the window, None without two points a day apart."""
    pts = [(r["at"], pick(r)) for r in history if now - r["at"] <= days * DAY + 3600 and pick(r) is not None]
    if len(pts) < 2 or pts[-1][0] - pts[0][0] < DAY - 3600:
        return None
    return (pts[-1][1] - pts[0][1]) / ((pts[-1][0] - pts[0][0]) / DAY)


def monthly_cost(rec, autogrow, policy, image_count=0):
    disk = 0.0
    if autogrow and autogrow.get("perGiBMonthCNY") and autogrow.get("sizeGiB"):
        disk = autogrow["perGiBMonthCNY"] * autogrow["sizeGiB"]
    cos = 0.0
    for cls, b in (rec.get("t2") or {}).items():
        if cls in policy["cos_price"]:
            cos += b / GB * policy["cos_price"][cls]
    images = max(0, image_count - 5) * policy["image_cny_per_month"]
    total = disk + cos + images + policy["disk_backup_cny_per_month"]
    return {"disk": round(disk, 1), "cos": round(cos, 1), "images": round(images, 1),
            "backup": policy["disk_backup_cny_per_month"], "total": round(total, 1)}


def problems(rec, history, autogrow, policy, now, cost, mover_status):
    """List of (key, text) for things that need a person."""
    out = []
    hist = history + [rec]
    t0_rate = rate_per_day(hist, now, lambda r: r["t0"]["used"])
    if t0_rate and t0_rate > 0:
        days = rec["t0"]["free"] / t0_rate
        if days < policy["t0_full_days"]:
            growers = top_growers(hist, now)
            out.append(("t0-full", "系统盘按近 7 天速度（每天 +%.1f GB）%.0f 天后写满，现在剩 %.0f GB。增长最快：%s"
                        % (t0_rate / GB, days, rec["t0"]["free"] / GB, growers or "无记录")))
    if rec.get("t1") and autogrow and autogrow.get("capGiB"):
        t1_rate = rate_per_day(hist, now, lambda r: (r.get("t1") or {}).get("used"))
        room = autogrow["capGiB"] * GIB - rec["t1"]["used"]
        if t1_rate and t1_rate > 0 and room / t1_rate < policy["t1_cap_days"]:
            out.append(("t1-cap", "数据盘按每天 +%.1f GB，%.0f 天后到自动扩容上限 %d GiB。冷数据没有及时归档，或者需要调高上限。"
                        % (t1_rate / GB, room / t1_rate, autogrow["capGiB"])))
    if autogrow is None or now - autogrow.get("at", 0) > 1800:
        out.append(("autogrow-silent", "自动扩容 30 分钟没有上报状态（v-disk-autogrow.timer）。"))
    elif autogrow.get("error") or autogrow.get("paused"):
        out.append(("autogrow-broken", "自动扩容%s：%s" % ("已暂停" if autogrow.get("paused") else "出错",
                                                     autogrow.get("error") or "连续失败")))
    for name, ok_at in mover_status.items():
        if ok_at is None or now - ok_at > policy["mover_stale_hours"] * 3600:
            out.append(("mover-%s" % name, "%s 已 %s 没有成功运行，冷数据不会流走。" % (
                name, "很久" if ok_at is None else "%.0f 小时" % ((now - ok_at) / 3600))))
    for cat, mover in policy["drain"].items():
        if mover in mover_status:
            r = rate_per_day(hist, now, lambda x, c=cat: x["cats"].get(c), days=14)
            if r and r > 1 * GB:
                out.append(("drain-%s" % cat, "%s 在 %s 之后仍每天 +%.1f GB，规则可能没覆盖到。" % (cat, mover, r / GB)))
    if cost["total"] > policy["budget_cny"]:
        out.append(("budget", "存储月成本约 %.0f 元，超过预算 %d 元（盘 %.0f、COS %.0f、镜像 %.0f、备份 %.0f）。"
                    % (cost["total"], policy["budget_cny"], cost["disk"], cost["cos"], cost["images"], cost["backup"])))
    return out


def top_growers(history, now, days=7, n=3):
    rates = []
    for cat in history[-1]["cats"]:
        if cat.endswith("-yesterday"):
            continue
        r = rate_per_day(history, now, lambda x, c=cat: x["cats"].get(c), days=days)
        if r and r > 0.2 * GB:
            rates.append((r, cat))
    return "、".join("%s +%.1f GB/天" % (c, r / GB) for r, c in sorted(rates, reverse=True)[:n])


def summary(rec, history, autogrow, cost, policy, now):
    hist = history + [rec]
    week = receipts_since(now - 7 * DAY)

    def gb(b):
        return "%.0f" % (b / GB) if b is not None else "?"

    t0r = rate_per_day(hist, now, lambda r: r["t0"]["used"])
    t1r = rate_per_day(hist, now, lambda r: (r.get("t1") or {}).get("used"))
    lines = [
        "热 T0 系统盘：用 %s / 剩 %s GB，近 7 天 %s GB/天" % (gb(rec["t0"]["used"]), gb(rec["t0"]["free"]),
                                                       "%+.1f" % (t0r / GB) if t0r is not None else "?"),
    ]
    if rec.get("t1"):
        lines.append("温 T1 数据盘：%s GiB，用 %s / 剩 %s GB，近 7 天 %s GB/天，上限 %s GiB" % (
            (autogrow or {}).get("sizeGiB", "?"), gb(rec["t1"]["used"]), gb(rec["t1"]["free"]),
            "%+.1f" % (t1r / GB) if t1r is not None else "?", (autogrow or {}).get("capGiB", "?")))
    if rec.get("t2"):
        lines.append("冷 T2 COS：" + "，".join("%s %s GB" % (k, gb(v)) for k, v in rec["t2"].items()
                                               if k in policy["cos_price"]))
    else:
        lines.append("冷 T2 COS：未启用")
    if week:
        lines.append("近 7 天流转：" + "，".join("%s %s GB" % (k, gb(v)) for k, v in sorted(week.items())))
    else:
        lines.append("近 7 天流转：无（还没有自动归档）")
    growers = top_growers(hist, now)
    if growers:
        lines.append("增长最快：" + growers)
    lines.append("存储月成本约 %.0f 元（盘 %.0f、COS %.0f、镜像 %.0f、备份 %.0f），预算 %d 元" % (
        cost["total"], cost["disk"], cost["cos"], cost["images"], cost["backup"], policy["budget_cny"]))
    return "\n".join(lines)


# ---------- plumbing ----------

def read_history():
    if not HISTORY.exists():
        return []
    out = []
    for line in HISTORY.read_text().splitlines()[-400:]:
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


def mover_last_success(policy):
    out = {}
    for name, spec in policy["movers"].items():
        unit = spec.get("unit")
        try:
            v = subprocess.run(["systemctl", "show", unit, "-p", "ExecMainExitTimestampMonotonic",
                                "-p", "ExecMainStatus", "-p", "ExecMainExitTimestamp"],
                               capture_output=True, text=True, timeout=20).stdout
            fields = dict(l.split("=", 1) for l in v.splitlines() if "=" in l)
            ok = fields.get("ExecMainStatus") == "0" and fields.get("ExecMainExitTimestamp")
            out[name] = int(datetime.datetime.strptime(
                fields["ExecMainExitTimestamp"].rsplit(" ", 1)[0], "%a %Y-%m-%d %H:%M:%S").replace(
                tzinfo=TZ).timestamp()) if ok else None
        except Exception:
            out[name] = None
    return out


def image_count():
    try:
        import tc
        r = tc.call("DescribeBlueprints", {"Limit": 100, "Filters": [{"Name": "blueprint-type", "Values": ["PRIVATE"]}]})
        return r.get("TotalCount", 0)
    except Exception:
        return 0


def notify(text):
    sys.path.insert(0, SENTINEL)
    try:
        import sentinel
        return sentinel.feishu(text)
    except Exception as e:
        print("alert failed: %s" % e, file=sys.stderr)
        return False


def main():
    args = sys.argv[1:]
    policy = load_policy()
    now = time.time()
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    history = read_history()
    rec = measure(now)
    autogrow = json.loads(AUTOGROW_STATUS.read_text()) if AUTOGROW_STATUS.exists() else None
    cost = monthly_cost(rec, autogrow, policy, image_count())
    rec["cost"] = cost
    text = summary(rec, history, autogrow, cost, policy, now)
    if args == ["--report"]:
        print(text)
        for key, msg in problems(rec, history, autogrow, policy, now, cost, mover_last_success(policy)):
            print("! %s: %s" % (key, msg))
        return
    with HISTORY.open("a") as f:
        f.write(json.dumps(rec) + "\n")
    stamp = datetime.datetime.fromtimestamp(now, TZ)
    found = problems(rec, history, autogrow, policy, now, cost, mover_last_success(policy))
    sent = state.setdefault("alerts", {})
    active = {k for k, _ in found}
    for key, msg in found:
        if now - sent.get(key, 0) >= DAY:
            if notify("V 存储告警 %s\n\n%s\n\n%s" % (stamp.strftime("%m-%d %H:%M"), msg, text)):
                sent[key] = now
    for key in [k for k in sent if k not in active]:
        notify("V 存储恢复 %s\n\n%s 已恢复正常。" % (stamp.strftime("%m-%d %H:%M"), key))
        sent.pop(key)
    if args == ["--send"] or (policy["weekly_report"] and stamp.weekday() == 0
                              and state.get("weekly") != stamp.strftime("%G-W%V")):
        if notify("V 存储周报 %s\n\n%s" % (stamp.strftime("%m-%d"), text)):
            state["weekly"] = stamp.strftime("%G-W%V")
    STATE.write_text(json.dumps(state))
    print(text)


if __name__ == "__main__":
    main()
