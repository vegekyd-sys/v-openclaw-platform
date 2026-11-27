#!/usr/bin/env python3
"""Grow V's Lighthouse data disk before it fills, and pay for it. Runs on V.

Version 1 (2026-11-18, never in git) could not work: the disk is prepaid, so a
resize is an order that has to be paid from the account balance, and the CAM
user it ran as had no `finance:trade`. Its first real attempt on 2026-11-25
03:05 failed with FailedOperation.ResizeDisksFailed, it retried every 30
minutes for two days (116 times), and its failure alert could not be sent.
On 2026-11-27 Tianyi granted that user `finance:trade` (policy V-FinanceTrade)
and asked for V itself to own this.

What this does every 5 minutes:
  * sample the filesystem; keep one sample an hour for 14 days to measure growth
  * trigger when free space stays below max(25% of the disk, 21 days of growth,
    30 GiB) for 15 minutes
  * size the new disk so that free space is at least max(30%, 45 days of growth)
  * price it first; buy only under the per-order and per-month spending caps,
    otherwise ask Tianyi with the price
  * after the cloud disk grows, grow ext4 and verify the block count
  * back off 1h / 4h / 24h after a failed order, alert on the first failure,
    and stop after three until someone runs --reset
  * once a day, check that the balance covers the next order and the next
    renewal, and that the disk is not about to expire

    autogrow.py              one tick (the timer)
    autogrow.py --check      status, plan and price; buys nothing
    autogrow.py --reset      clear failures/pause after a fix
    autogrow.py --approve N  allow one order up to N GiB that exceeds a cap

Alerts go through sentinel.py's direct Feishu path, never through the Gateway.
"""
import datetime
import fcntl
import json
import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tc  # noqa: E402

DISK = "lhdisk-n2q8rj3e"
INSTANCE = "lhins-89f5exr5"
DEVICE = Path("/dev/disk/by-id/virtio-disk-n2q8rj3e")
MOUNT = Path("/srv/openclaw-data/disk1")
STATE_DIR = Path(os.environ.get("V_AUTOGROW_STATE_DIR", "/var/lib/v-disk-autogrow"))
STATE = STATE_DIR / "state.json"
STATUS = STATE_DIR / "status.json"
POLICY_PATH = Path(os.environ.get("V_STORAGE_POLICY", "/etc/v-storage/policy.json"))
SENTINEL = "/opt/v-sentinel"
GIB = 1024 ** 3
DAY = 86400
TZ = datetime.timezone(datetime.timedelta(hours=8))

DEFAULTS = {
    "cap_gib": 1200,                 # never grow past this without --approve
    "step_gib": 10,                  # Lighthouse disk size step
    "trigger_free_ratio": 0.25,
    "trigger_growth_days": 21,
    "target_free_ratio": 0.30,
    "target_growth_days": 45,
    "min_free_gib": 30,
    "sustain_s": 900,
    "default_growth_gib_per_day": 7,  # used until a day of samples exists
    "max_order_cny": 100,
    "max_month_cny": 200,
    "balance_reserve_cny": 50,
    "expiry_warn_days": 7,
}
BACKOFF = (3600, 4 * 3600, DAY)
MAX_FAILURES = 3


def load_policy():
    p = dict(DEFAULTS)
    if POLICY_PATH.exists():
        p.update(json.loads(POLICY_PATH.read_text()).get("autogrow", {}))
    return p


# ---------- pure decisions (tested) ----------

def record_sample(state, now, used):
    """One sample per hour, 14 days."""
    samples = state.setdefault("samples", [])
    if not samples or now - samples[-1][0] >= 3600:
        samples.append([now, used])
    del samples[:max(0, len(samples) - 14 * 24)]


def growth_per_day(state, now, policy):
    """GiB/day over the last 7 days (or what history there is, at least a day)."""
    samples = [s for s in state.get("samples", []) if now - s[0] <= 7 * DAY]
    if len(samples) < 2 or samples[-1][0] - samples[0][0] < DAY:
        return float(policy["default_growth_gib_per_day"])
    span = (samples[-1][0] - samples[0][0]) / DAY
    return max(0.0, (samples[-1][1] - samples[0][1]) / GIB / span)


def trigger_free_gib(size_gib, growth, policy):
    return max(policy["trigger_free_ratio"] * size_gib, policy["trigger_growth_days"] * growth,
               policy["min_free_gib"])


def target_size_gib(size_gib, used_gib, growth, policy):
    """Smallest step-aligned size whose free space meets the target. May exceed the cap;
    the caller decides what to do about that."""
    need = max(used_gib / (1 - policy["target_free_ratio"]),
               used_gib + policy["target_growth_days"] * growth,
               used_gib + policy["min_free_gib"])
    step = policy["step_gib"]
    return max(size_gib + step, int(math.ceil(need / step) * step))


def under_pressure(state, now, free_gib, threshold, sustain):
    """True once free space has stayed under the threshold for `sustain` seconds."""
    if free_gib >= threshold:
        state.pop("low_since", None)
        return False
    last = state.get("last_tick", 0)
    if "low_since" not in state or now - last > 2 * 390:
        state["low_since"] = now  # a gap in sampling restarts the clock
    return now - state["low_since"] >= sustain


def order_cost(per_gib_month, add_gib, now, expires_at):
    """Prorated upgrade price: monthly delta x remaining months (Lighthouse rule)."""
    months = max(0.0, (expires_at - now) / (365 / 12 * DAY))
    return round(per_gib_month * add_gib * months, 2)


def month_key(now):
    return datetime.datetime.fromtimestamp(now, TZ).strftime("%Y-%m")


def spend_check(state, now, cost, policy, target):
    """None if the order may go ahead, else the reason it needs approval."""
    approved = state.get("approved_gib")
    if approved and target <= approved:
        return None
    if target > policy["cap_gib"]:
        return "目标 %d GiB 超过上限 %d GiB" % (target, policy["cap_gib"])
    if cost > policy["max_order_cny"]:
        return "单次 %.2f 元超过上限 %d 元" % (cost, policy["max_order_cny"])
    spent = state.get("spent", {}).get(month_key(now), 0)
    if spent + cost > policy["max_month_cny"]:
        return "本月已花 %.2f 元，加上这次 %.2f 元超过 %d 元" % (spent, cost, policy["max_month_cny"])
    return None


def may_attempt(state, now):
    if state.get("paused"):
        return False
    return now >= state.get("next_attempt", 0)


def note_failure(state, now):
    n = state.get("failures", 0) + 1
    state["failures"] = n
    state["next_attempt"] = now + BACKOFF[min(n, len(BACKOFF)) - 1]
    if n >= MAX_FAILURES:
        state["paused"] = True
    return n


# ---------- side effects ----------

def run(args, timeout=120, env=None):
    r = subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=env)
    if r.returncode:
        raise RuntimeError("%s exited %d: %s" % (Path(args[0]).name, r.returncode, r.stderr.strip()[:200]))
    return r.stdout.strip()


def local_status():
    device = DEVICE.resolve(strict=True)
    source = run(["/usr/bin/findmnt", "-rn", "-M", str(MOUNT), "-o", "SOURCE,FSTYPE"])
    if source != "%s ext4" % device or os.stat(MOUNT).st_dev != device.stat().st_rdev:
        raise RuntimeError("local mount identity mismatch")
    size = int(run(["/usr/sbin/blockdev", "--getsize64", str(device)]))
    fs = os.statvfs(MOUNT)
    used = (fs.f_blocks - fs.f_bfree) * fs.f_frsize
    free = fs.f_bavail * fs.f_frsize
    return size // GIB, used, free


def filesystem_gib():
    fs = os.statvfs(MOUNT)
    return fs.f_blocks * fs.f_frsize / GIB


def migrate_v1(state):
    """v1 kept {target, started, attempt, sample, high_usage}. Its target was never paid
    for; drop it and let v2 decide afresh (the device/filesystem check covers a v1
    order that did go through)."""
    if "started" in state or "attempt" in state:
        for k in ("target", "started", "attempt", "sample", "high_usage", "alert_key", "alert_time"):
            state.pop(k, None)
        return True
    return False


def remote_disk():
    disks = tc.call("DescribeDisks", {"DiskIds": [DISK]})["DiskSet"]
    if len(disks) != 1:
        raise RuntimeError("expected one disk")
    d = disks[0]
    if (d["DiskId"], d["InstanceId"], d["DiskUsage"]) != (DISK, INSTANCE, "DATA_DISK"):
        raise RuntimeError("cloud disk identity mismatch")
    return d


def parse_time(s):
    return int(datetime.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=datetime.timezone.utc).timestamp())


def per_gib_month(disk):
    r = tc.call("InquirePriceRenewDisks", {"DiskIds": [DISK], "RenewDiskChargePrepaid": {
        "Period": 1, "RenewFlag": disk.get("RenewFlag") or "NOTIFY_AND_AUTO_RENEW", "TimeUnit": "m"}})
    monthly = float(r["DiskPrice"]["DiscountPrice"])
    return monthly / disk["DiskSize"], monthly


def balance_cny():
    return tc.call("DescribeAccountBalance", {}, service="billing", region="")["Balance"] / 100.0


def resize(target):
    disk = remote_disk()
    if disk["DiskState"] != "ATTACHED" or disk["DiskSize"] >= target:
        raise RuntimeError("cloud disk is %s at %d GiB; not ordering %d" % (disk["DiskState"], disk["DiskSize"], target))
    return tc.call("ResizeDisks", {"DiskIds": [DISK], "DiskSize": target})["RequestId"]


def grow_filesystem(target):
    run(["/usr/sbin/resize2fs", str(DEVICE)], timeout=600)
    meta = run(["/usr/sbin/tune2fs", "-l", str(DEVICE)], env={"LC_ALL": "C"})
    blocks = int(re.search(r"^Block count:\s+(\d+)", meta, re.M)[1])
    bsize = int(re.search(r"^Block size:\s+(\d+)", meta, re.M)[1])
    if blocks * bsize != target * GIB:
        raise RuntimeError("ext4 is %d bytes after resize, expected %d GiB" % (blocks * bsize, target))


def notify(text):
    sys.path.insert(0, SENTINEL)
    try:
        import sentinel
        return sentinel.feishu(text)
    except Exception as e:  # never let alerting take the controller down
        print("alert failed: %s" % e, file=sys.stderr)
        return False


def alert(state, key, text, now, every=DAY):
    sent = state.setdefault("alerts", {})
    if now - sent.get(key, 0) < every:
        return
    stamp = datetime.datetime.fromtimestamp(now, TZ).strftime("%m-%d %H:%M")
    if notify("V 数据盘 %s\n\n%s" % (stamp, text)):
        sent[key] = now


def save(state):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state))
    os.replace(tmp, STATE)


def write_status(status):
    tmp = STATUS.with_suffix(".tmp")
    tmp.write_text(json.dumps(status, ensure_ascii=False, indent=1))
    os.replace(tmp, STATUS)


# ---------- the tick ----------

def reconcile(state, now, size_gib):
    """A purchase is in flight: wait for the cloud, then grow ext4."""
    target = state["target"]
    if size_gib >= target:
        grow_filesystem(target)
        alert(state, "grown-%d" % target, "已扩到 %d GiB，文件系统已同步并校验。" % target, now, every=0)
        for k in ("target", "ordered_at", "low_since"):
            state.pop(k, None)
        state["failures"] = 0
        state.pop("approved_gib", None)
        return "grown to %d GiB" % target
    if now - state["ordered_at"] > 3600:
        alert(state, "stuck", "扩容订单已过 1 小时，系统里的盘仍是 %d GiB（目标 %d）。" % (size_gib, target), now)
    # Linux sees the new size only after the cloud side finishes; rescan is automatic on virtio.
    return "waiting for %d GiB (device %d)" % (target, size_gib)


def tick(state, now, policy):
    size_gib, used, free = local_status()
    if "target" not in state and size_gib - filesystem_gib() >= 1:
        # The disk grew (a console resize, or an order from before a restart) but ext4 did not.
        grow_filesystem(size_gib)
        alert(state, "grown-%d" % size_gib, "数据盘已是 %d GiB，文件系统已同步并校验。" % size_gib, now, every=0)
        size_gib, used, free = local_status()
    used_gib, free_gib = used / GIB, free / GIB
    record_sample(state, now, used)
    growth = growth_per_day(state, now, policy)
    threshold = trigger_free_gib(size_gib, growth, policy)
    status = {"at": now, "sizeGiB": size_gib, "usedGiB": round(used_gib, 1), "freeGiB": round(free_gib, 1),
              "growthGiBPerDay": round(growth, 2), "triggerFreeGiB": round(threshold, 1),
              "capGiB": policy["cap_gib"], "failures": state.get("failures", 0),
              "paused": bool(state.get("paused")), "spentThisMonth": state.get("spent", {}).get(month_key(now), 0)}
    try:
        if "target" in state:
            status["action"] = reconcile(state, now, size_gib)
            return status
        if not under_pressure(state, now, free_gib, threshold, policy["sustain_s"]):
            status["action"] = "ok"
            return status
        target = min(target_size_gib(size_gib, used_gib, growth, policy),
                     max(policy["cap_gib"], state.get("approved_gib") or 0))
        status["targetGiB"] = target
        if target <= size_gib:
            alert(state, "cap", "数据盘已到上限 %d GiB，可用 %.0f GiB，每天约 +%.1f GiB。需要批准才能继续扩："
                  "`autogrow.py --approve <GiB>`，或调高 /etc/v-storage/policy.json 的 cap_gib。"
                  % (size_gib, free_gib, growth), now)
            status["action"] = "at cap"
            return status
        if not may_attempt(state, now):
            status["action"] = "paused" if state.get("paused") else "backing off"
            return status
        disk = remote_disk()
        per_gib, _ = per_gib_month(disk)
        cost = order_cost(per_gib, target - disk["DiskSize"], now, parse_time(disk["ExpiredTime"]))
        status["orderCostCNY"] = cost
        reason = spend_check(state, now, cost, policy, target)
        if reason:
            alert(state, "approve-%d" % target, "需要扩到 %d GiB（现在 %d，可用 %.0f GiB，每天约 +%.1f GiB），"
                  "预计补差价 %.2f 元。没有自动下单：%s。批准：`sudo /opt/v-storage/autogrow.py --approve %d`"
                  % (target, size_gib, free_gib, growth, cost, reason, target), now)
            status["action"] = "needs approval"
            return status
        try:
            request_id = resize(target)
        except Exception as e:
            n = note_failure(state, now)
            alert(state, "fail-%d" % n, "扩容到 %d GiB 失败（第 %d 次）：%s\n%s" % (
                target, n, e, "已暂停自动扩容，修好后执行 `sudo /opt/v-storage/autogrow.py --reset`。"
                if state.get("paused") else "将在 %s 后重试。" % datetime.datetime.fromtimestamp(
                    state["next_attempt"], TZ).strftime("%m-%d %H:%M")), now, every=0)
            status["action"] = "order failed"
            status["error"] = str(e)
            return status
        spent = state.setdefault("spent", {})
        spent[month_key(now)] = round(spent.get(month_key(now), 0) + cost, 2)
        state.update(target=target, ordered_at=now)
        alert(state, "ordered-%d" % target, "已自动扩容 %d → %d GiB，预计补差价 %.2f 元（本月累计 %.2f 元）。"
              "可用 %.0f GiB，每天约 +%.1f GiB。RequestId %s"
              % (size_gib, target, cost, spent[month_key(now)], free_gib, growth, request_id), now, every=0)
        status["action"] = "ordered %d GiB" % target
        return status
    finally:
        state["last_tick"] = now


def daily_checks(state, now, policy):
    """Balance and expiry, once a day. Read-only."""
    if now - state.get("daily_at", 0) < DAY:
        return {}
    state["daily_at"] = now
    disk = remote_disk()
    per_gib, monthly = per_gib_month(disk)
    size_gib, used, _ = local_status()
    growth = growth_per_day(state, now, policy)
    nxt = min(target_size_gib(size_gib, used / GIB, growth, policy), policy["cap_gib"])
    next_order = order_cost(per_gib, max(0, nxt - size_gib), now + 30 * DAY, parse_time(disk["ExpiredTime"]) + 30 * DAY)
    need = monthly + next_order + policy["balance_reserve_cny"]
    bal = balance_cny()
    out = {"balanceCNY": bal, "renewCNY": monthly, "perGiBMonthCNY": round(per_gib, 4),
           "expiresAt": disk["ExpiredTime"], "renewFlag": disk.get("RenewFlag")}
    if bal < need:
        alert(state, "balance", "腾讯云余额 %.2f 元，不够下一次续费 %.2f 元 + 下一次扩容约 %.2f 元 + 预留 %d 元。"
              "请充值，否则数据盘可能无法扩容或续费。" % (bal, monthly, next_order, policy["balance_reserve_cny"]), now)
    days_left = (parse_time(disk["ExpiredTime"]) - now) / DAY
    if days_left < policy["expiry_warn_days"] and disk.get("RenewFlag") != "NOTIFY_AND_AUTO_RENEW":
        alert(state, "expiry", "数据盘 %.0f 天后到期，且没有开自动续费。" % days_left, now)
    try:
        denied = tc.call("DescribeDisksDeniedActions", {"DiskIds": [DISK]})["DiskDeniedActionSet"][0]["DeniedActions"]
        if any(a["Action"] == "ResizeDisks" for a in denied):
            alert(state, "denied", "腾讯云当前不允许扩容这块盘：%s" % [a["Message"] for a in denied
                                                                    if a["Action"] == "ResizeDisks"], now)
    except Exception as e:
        print("denied-actions check failed: %s" % e, file=sys.stderr)
    return out


def main():
    args = sys.argv[1:]
    policy = load_policy()
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with (STATE_DIR / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = json.loads(STATE.read_text()) if STATE.exists() else {}
        migrate_v1(state)
        now = int(time.time())
        if args == ["--reset"]:
            for k in ("failures", "next_attempt", "paused"):
                state.pop(k, None)
            save(state)
            print("reset")
            return
        if len(args) == 2 and args[0] == "--approve":
            state["approved_gib"] = int(args[1])
            state.pop("next_attempt", None)
            save(state)
            print("approved one order up to %s GiB" % args[1])
            return
        if args == ["--check"]:
            size_gib, used, free = local_status()
            growth = growth_per_day(state, now, policy)
            disk = remote_disk()
            per_gib, monthly = per_gib_month(disk)
            target = target_size_gib(size_gib, used / GIB, growth, policy)
            print(json.dumps({
                "local": {"sizeGiB": size_gib, "usedGiB": round(used / GIB, 1), "freeGiB": round(free / GIB, 1)},
                "cloud": {k: disk[k] for k in ("DiskSize", "DiskState", "DiskType", "DiskChargeType",
                                               "RenewFlag", "ExpiredTime")},
                "growthGiBPerDay": round(growth, 2),
                "triggerFreeGiB": round(trigger_free_gib(size_gib, growth, policy), 1),
                "nextTargetGiB": target, "capGiB": policy["cap_gib"],
                "nextOrderCostCNY": order_cost(per_gib, target - disk["DiskSize"], now, parse_time(disk["ExpiredTime"])),
                "renewMonthlyCNY": monthly, "balanceCNY": balance_cny(),
                "state": {k: v for k, v in state.items() if k not in ("samples", "alerts")}},
                ensure_ascii=False, indent=1))
            return
        if args:
            raise SystemExit(__doc__)
        status = {}
        try:
            status = tick(state, now, policy)
            status.update(daily_checks(state, now, policy) or {})
        except Exception as e:
            status["error"] = str(e)
            alert(state, "error", "自动扩容检查出错：%s" % e, now)
            raise
        finally:
            save(state)
            prev = json.loads(STATUS.read_text()) if STATUS.exists() else {}
            for k in ("balanceCNY", "renewCNY", "perGiBMonthCNY", "expiresAt", "renewFlag"):
                if k not in status and k in prev:
                    status[k] = prev[k]
            write_status(status)
        print(json.dumps(status, ensure_ascii=False))


if __name__ == "__main__":
    main()
