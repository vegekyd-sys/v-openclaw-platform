#!/usr/bin/env python3
"""Night Shift check for V. Runs on the host itself, on its own five-minute timer.

It exists because Night Shift fails quietly. On 2026-09-24 its scheduler failed
every fifteen seconds from 03:39 to 10:05 while the service stayed active and
the Gateway stayed healthy; nobody knew until someone looked. The same week a
retried card could never be dispatched, a paid card was judged failed while
its Agent was still working, and a test project sat active for two days.

Beside sentinel.py, like release-drift.py: it borrows only that module's Feishu
path, so an alert never travels through the service being watched. Every input
comes from sample(), so the rules can be exercised with fixtures.

    ./nightshift-check.py --check   print findings, send nothing, keep no state
    ./nightshift-check.py           alert on what is new since the last run

Service-level findings latch: one alert on entry, silence while they persist,
one on recovery. Card-level findings alert once when they first appear,
grouped by project and kind, each block ending in what a person should do.
The first run records a baseline and sends nothing.
"""
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

STATE_PATH = "/var/lib/v-sentinel/nightshift.json"
NS_DB = "/home/openclaw/.openclaw/nightshift/nightshift.sqlite"
WB_DB = "/home/openclaw/.openclaw/plugins/workboard/workboard.sqlite"
HEALTH_URL = "http://127.0.0.1:24879/api/health"
UNIT = "nightshift-workboard.service"
BOARD = "nightshift"

DASHBOARD = "https://nightshift.tianyi.live/?project=%s&view=workflows"

STALE_READY_MIN = 45        # ready this long while dispatch is allowed
# Running with no execution update this long. Measured on V over the 14 days
# to 2026-09-30, the longest silence inside runs that went on to succeed:
# produce p99 97 min (39 runs past 40), brief p99 46 min (15 past 40), every
# other stage under 30. A flat 40 called healthy paid renders stuck.
STUCK_RUNNING_MIN = {"produce": 120, "brief": 60}
STUCK_RUNNING_DEFAULT_MIN = 40
PAID_EXECUTING_MIN = 60     # paid operation executing with no card running
# A full board read is ~13 KB per card. The Gateway client drops frames over
# 25 MiB (1006); reads are chunked since 4434cfe, but a board this size also
# costs the Gateway main thread on every unscoped walk.
BOARD_CARD_LIMIT = 5000


def sh(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:
        return ""


def ro(path):
    return sqlite3.connect("file:%s?mode=ro" % path, uri=True, timeout=10)


def sample(now_ms=None):
    """Everything the rules look at, read-only."""
    now_ms = now_ms or int(time.time() * 1000)
    out = {"now_ms": now_ms, "unit": sh(["systemctl", "is-active", UNIT]), "health": None, "health_error": None}
    try:
        out["health"] = json.load(urllib.request.urlopen(HEALTH_URL, timeout=20))
    except Exception as error:
        out["health_error"] = str(error)[:160]

    ns, wb = ro(NS_DB), ro(WB_DB)
    active = {iid: bool(auto) for iid, auto in ns.execute(
        "select i.id, coalesce(c.automatic_dispatch,1) from instances i "
        "left join instance_controls c on c.instance_id=i.id where i.status='active'")}
    out["active"] = active
    out["faults"] = [(iid, fault) for iid, fault in ns.execute(
        "select instance_id, fault_json from instance_controls where coalesce(fault_json,'')<>''") if iid in active]
    out["blocked"] = []
    for iid, item, stage, card, kind, summary in ns.execute(
            "select instance_id, content_item_id, stage_id, card_id, coalesce(json_extract(failure_json,'$.kind'),'?'), "
            "substr(coalesce(json_extract(failure_json,'$.message'),summary,''),1,110) from content_item_runs "
            "where status='blocked' and updated_at > datetime('now','-1 day') "
            "union all select instance_id, null, stage_id, card_id, coalesce(json_extract(failure_json,'$.kind'),'?'), "
            "substr(coalesce(json_extract(failure_json,'$.message'),summary,''),1,110) from stage_runs "
            "where status='blocked' and updated_at > datetime('now','-1 day')"):
        op = ns.execute("select status from external_operations where content_item_id=? and stage_id=?",
                        (item, stage)).fetchone() if item else None
        # A person sending work back blocks the stage on purpose; that is not a failure.
        verdict = ns.execute("select status from approvals where instance_id=? and stage_id=? "
                             "and coalesce(content_item_id,'')=coalesce(?,'') order by created_at desc limit 1",
                             (iid, stage, item)).fetchone()
        out["blocked"].append({"instance": iid, "item": item, "stage": stage, "card": card,
                               "kind": kind, "summary": summary, "paid": op[0] if op else None,
                               "verdict": verdict[0] if verdict else None})
    out["live_cards"] = []
    for cid, status, updated, exec_updated, failures, automation in wb.execute(
            "select id, status, updated_at, execution_updated_at, coalesce(failure_count,0), automation_json "
            "from workboard_cards where board_id=? and archived_at is null and status in ('ready','running')", (BOARD,)):
        labels = [row[0] for row in wb.execute("select label from workboard_card_labels where card_id=?", (cid,))]
        out["live_cards"].append({
            "id": cid, "status": status, "updated": updated, "exec_updated": exec_updated,
            "failures": failures, "max_retries": (json.loads(automation or "{}") or {}).get("maxRetries"),
            "instance": next((l[9:] for l in labels if l.startswith("instance:")), None),
            "item": next((l[13:] for l in labels if l.startswith("content-item:")), None),
            "stage": next((l[6:] for l in labels if l.startswith("stage:")), None),
            "approval": "nightshift:approval" in labels,
        })
    out["paid_executing"] = [
        {"key": key, "instance": iid, "item": item, "task": task}
        for key, iid, item, task in ns.execute(
            "select idempotency_key, instance_id, content_item_id, external_task_id from external_operations "
            "where status='executing' and updated_at < datetime('now', ?)", ("-%d minutes" % PAID_EXECUTING_MIN,))]
    out["board_cards"] = wb.execute("select count(*) from workboard_cards where board_id=?", (BOARD,)).fetchone()[0]
    return out


def evaluate(s):
    """(service finding or None, brake reading or None, {card-level key: message})."""
    health = s.get("health") or {}
    if s.get("unit") != "active":
        service = "夜班服务 %s" % (s.get("unit") or "unknown")
    elif s.get("health") is None:
        service = "夜班接口不可用: %s" % s.get("health_error")
    elif health.get("lastSchedulerError"):
        service = "夜班调度器报错: %s" % str(health["lastSchedulerError"])[:160]
    elif health.get("ok") is False:
        service = "夜班 health=false"
    else:
        service = None

    pressure = health.get("dispatchPressure") or {}
    brake = pressure.get("agentDbPressure") or None
    if brake:
        brake = dict(brake, targetMaxActive=pressure.get("targetMaxActive"))

    # Card-level findings: key -> (group, line). Findings of one kind in one
    # project share a group and go out as one block ending in what to do;
    # group None is a line on its own.
    issues = {}
    for iid, fault in s.get("faults", []):
        issues["fault:%s" % iid] = (None, "项目 %s 带故障标记: %s" % (iid, str(fault)[:140]))
    active = s.get("active", {})
    for b in s.get("blocked", []):
        if b["instance"] not in active or b.get("verdict") in ("changes_requested", "rejected"):
            continue
        issues["blocked:%s" % b["card"]] = (("blocked", b["instance"]), "%s：%s" % (
            where(b), blocked_reason(b)))
    dispatch_allowed = pressure.get("dispatchAllowed")
    now_ms = s["now_ms"]
    running_items = {c["item"] for c in s.get("live_cards", []) if c["status"] == "running" and c.get("item")}
    for c in s.get("live_cards", []):
        # Approval cards wait on people by design and the scheduler never
        # starts them; how long they wait is business flow, not an alert
        # (Tianyi, 2026-09-30).
        if c["instance"] not in active or c.get("approval"):
            continue
        idle = now_ms - c["updated"] if c.get("updated") else 0
        if c["status"] == "ready":
            if c.get("max_retries") and c["failures"] > c["max_retries"]:
                issues["budget:%s" % c["id"]] = (("budget", c["instance"]), "%s 失败 %d 次，上限 %d" % (
                    where(c), c["failures"], c["max_retries"]))
            elif active[c["instance"]] and dispatch_allowed and idle > STALE_READY_MIN * 60_000:
                issues["stale:%s" % c["id"]] = (("stale", c["instance"]), "%s 已等 %s" % (where(c), minutes(idle)))
        elif c["status"] == "running":
            last = c.get("exec_updated") or c.get("updated")
            limit = STUCK_RUNNING_MIN.get(c.get("stage"), STUCK_RUNNING_DEFAULT_MIN)
            if last and now_ms - last > limit * 60_000:
                issues["stuck:%s" % c["id"]] = (("stuck", c["instance"]), "%s 已 %s 没有进展（这个阶段按 %d 分钟算异常）" % (
                    where(c), minutes(now_ms - last), limit))
    # A blocked line already tells whoever reads it to check the paid task.
    reported = {(b["instance"], b.get("item")) for b in s.get("blocked", [])
                if "blocked:%s" % b["card"] in issues and b.get("paid")}
    for p in s.get("paid_executing", []):
        if p.get("item") not in running_items and (p["instance"], p.get("item")) not in reported:
            issues["paid:%s" % p["key"]] = (("paid", p["instance"]), "%s 超过 %d 分钟，外部任务 %s" % (
                p.get("item") or "（整个项目）", PAID_EXECUTING_MIN, p.get("task")))
    if s.get("board_cards", 0) > BOARD_CARD_LIMIT:
        issues["board-size"] = (None, "夜班看板 %d 张卡（阈值 %d）" % (s["board_cards"], BOARD_CARD_LIMIT))
    return service, brake, issues


# kind -> (what happened, what to do). None: each line carries its own action.
GROUPS = {
    "stale": ("调度器允许派工，卡却一直停在 ready 没被派出", "多半是调度器的问题，查 nightshift-workboard 日志"),
    "budget": ("重试次数已用完，不会再自动跑", "人工重试（会重置次数）或者跳过这条"),
    "stuck": ("在跑，但很久没有进展", "Agent 可能挂了。付费阶段先核对外部任务再重试，免得重复付费"),
    "blocked": ("有内容停住了（blocked）", None),
    "paid": ("付费任务还在执行，但没有卡在跟进", "核对外部任务状态。不要直接重试，会重复付费"),
}
INFRA_KINDS = {"gateway_unavailable", "worker_unavailable", "database_lock", "connection_reset",
               "provider_error", "upstream_unavailable"}
AGENT_KINDS = {"agent_error", "agent_interrupted", "agent_not_started", "run_cancelled"}


def where(c):
    return "%s / %s" % (c.get("item") or "（整个项目）", c.get("stage") or "?")


def minutes(ms):
    m = int(ms // 60_000)
    return "%d 分钟" % m if m < 120 else "%d 小时 %d 分" % (m // 60, m % 60)


def blocked_reason(b):
    kind, detail = b.get("kind"), (b.get("summary") or "").strip()
    detail = "（%s）" % detail if detail else ""
    if kind in INFRA_KINDS:
        return "基础设施或上游临时故障 [%s] → 通常直接重试就行" % kind
    if kind in AGENT_KINDS:
        return "Agent 没跑完 [%s] → 看一眼原因再重试" % kind
    if kind == "decision":
        return "在等人拍板 → 去「需要你」面板处理"
    if b.get("paid") == "failed":
        return "付费任务失败了 → 看原因再重试，重试会再付一次费%s" % detail
    if b.get("paid") and b["paid"] != "succeeded":
        return "付费任务已发出，但成功记录没回写（付费=%s）→ 先核对外部任务，别重试%s" % (b["paid"], detail)
    if kind == "contract_error":
        return "产物没通过交付校验 → 要人看一下%s" % detail
    return "原因没记录 [%s] → 要人看一下%s" % (kind, detail)


def decide(state, service, brake, issues):
    """Update state in place and return the lines to send."""
    lines = []
    if service != state.get("service"):
        if service:
            lines.append("⚠️ " + service)
        elif state.get("service"):
            lines.append("✅ 已恢复正常（此前异常: %s）" % state["service"])
        state["service"] = service

    level = (brake or {}).get("level")
    if level and level != "unknown" and level != state.get("brake"):
        reading = {k: brake.get(k) for k in ("at", "coordinatorTimeouts", "interactiveTimeouts",
                                              "slowAdmissions", "userHarm", "targetMaxActive")}
        previous = state.get("brake")
        if level != "green" or (previous and previous != "green"):
            mark = "✅" if level == "green" else "⚠️"
            lines.append("%s 写锁刹车 %s → %s %s %s" % (mark, previous or "-", level,
                                                   (brake.get("reason") or ""), json.dumps(reading, ensure_ascii=False)))
        state["brake"] = level

    seen = set(state.get("seen", []))
    if state.get("baseline"):
        groups = {}
        for key, (group, line) in sorted(issues.items()):
            if key in seen:
                continue
            if group is None:
                lines.append("⚠️ " + line)
            else:
                groups.setdefault(group, []).append(line)
        for (kind, iid), members in sorted(groups.items()):
            title, action = GROUPS[kind]
            block = ["⚠️ 项目 %s：%s" % (iid, title)] + ["  · " + m for m in members]
            if action:
                block.append("  → " + action)
            block.append("  " + DASHBOARD % iid)
            lines.append("\n".join(block))
    state["baseline"] = True
    state["seen"] = sorted(issues)
    return lines


def load_state():
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, STATE_PATH)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    service, brake, issues = evaluate(sample())
    if "--check" in argv:
        print(json.dumps({"service": service, "brake": brake, "issues": issues}, ensure_ascii=False, indent=1))
        return 1 if service or issues else 0
    state = load_state()
    lines = decide(state, service, brake, issues)
    if lines:
        from sentinel import feishu  # noqa: E402  (same directory, installed alongside)
        text = "【夜班】\n" + "\n".join(lines[:20]) + ("\n…另有 %d 项" % (len(lines) - 20) if len(lines) > 20 else "")
        if not feishu(text):
            return 2  # keep the old state so the next run tries again
    save_state(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
