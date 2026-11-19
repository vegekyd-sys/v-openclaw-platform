#!/usr/bin/env python3
"""Archive finished Workboard sub-agent sessions older than N days.

Why (2026-11-18): the Workboard lifecycle sweep reads at most 10,000 sessions
(WORKBOARD_SESSION_SWEEP_LIMIT). OpenClaw normally keeps the unarchived count
under that with session.maintenance (enforce, maxEntries), but V runs
`mode: warn` since 2026-10-15 to stop the disk-budget stall, which also stopped
entry cleanup. Unarchived makaron sessions reached 22,869, 20,507 of them
Night Shift `:subagent:workboard-` rows. 9.1's own count/age cleanup would
delete those rows; Tianyi's rule is not to lose history, so this job archives
them through the official `sessions.patchMany {archived: true}` instead
(archivedAt is set, transcript and entry stay, readable by key, reversible with
archived:false). Archived rows are excluded from sessions.list by default and
the Workboard sweep skips cards whose session it does not see.

A session is archived only when all of these hold:
  - unarchived, key contains `:subagent:workboard-`
  - session status is terminal (done / failed / killed / timeout)
  - updated_at and last_activity_at are older than --older-than-days
  - every Workboard card that points at it is `done` or itself archived
    (blocked/ready/review/todo cards can be retried on the same session)

Selection reads both SQLite files read-only. Writes go only through the
Gateway, in small batches with a pause, and the run stops on the first sign of
trouble (a failed call, or a call slower than --stop-call-s).
"""
import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time

STATE_ROOT = "/home/openclaw/.openclaw"
STATE_DIR = "/var/lib/v-session-archive"
UNIT = "openclaw-gateway"
SUBAGENT_MARK = ":subagent:workboard-"
SUFFIX_MARK = "subagent:workboard-"
TERMINAL_SESSION = ("done", "failed", "killed", "timeout")
MAX_TARGETS = 100  # SessionsPatchManyParamsSchema maxItems


def ro(path):
    con = sqlite3.connect("file:%s?mode=ro" % path, uri=True, timeout=10)
    con.execute("PRAGMA query_only=1")
    return con


def suffix(key):
    i = key.find(SUFFIX_MARK)
    return key[i:] if i >= 0 else None


def card_blockers(workboard_db):
    """suffix -> True if some card on that session may still use it."""
    out = {}
    con = ro(workboard_db)
    try:
        rows = con.execute(
            "SELECT session_key, execution_session_key, status, archived_at FROM workboard_cards "
            "WHERE session_key LIKE ? OR execution_session_key LIKE ?",
            ("%" + SUFFIX_MARK + "%", "%" + SUFFIX_MARK + "%")).fetchall()
    finally:
        con.close()
    for session_key, exec_key, status, archived_at in rows:
        settled = archived_at is not None or status == "done"
        for k in {session_key, exec_key}:
            sfx = suffix(k) if k else None
            if sfx:
                out[sfx] = out.get(sfx, False) or not settled
    return out


def select(agent_db, blockers, cutoff_ms, limit):
    con = ro(agent_db)
    try:
        rows = con.execute(
            "SELECT session_key, current_session_id, status FROM session_nodes "
            "WHERE archived_at IS NULL AND session_key LIKE ? AND updated_at < ? "
            "AND (last_activity_at IS NULL OR last_activity_at < ?) "
            "ORDER BY updated_at ASC",
            ("%" + SUBAGENT_MARK + "%", cutoff_ms, cutoff_ms)).fetchall()
        unarchived = con.execute("SELECT count(*) FROM session_nodes WHERE archived_at IS NULL").fetchone()[0]
    finally:
        con.close()
    picked, skipped = [], {"status": 0, "card_open": 0, "no_card": 0}
    for key, sid, status in rows:
        if status not in TERMINAL_SESSION:
            skipped["status"] += 1
            continue
        sfx = suffix(key)
        if sfx not in blockers:
            skipped["no_card"] += 1
            continue
        if blockers[sfx]:
            skipped["card_open"] += 1
            continue
        picked.append((key, sid))
    return picked[:limit] if limit else picked, skipped, unarchived, len(rows)


def gateway_cli(unit):
    """node + dist/index.js exactly as the running unit starts them."""
    out = subprocess.run(["systemctl", "show", unit, "-p", "ExecStart", "--value"],
                         capture_output=True, text=True).stdout
    m = re.search(r"(/\S+/node)\b[^;]*?\s(/\S+/dist/index\.js)", out)
    if not m:
        raise SystemExit("cannot find the Gateway's node/dist in %s ExecStart" % unit)
    return m.group(1), m.group(2)


def call(cli, method, params, timeout_ms):
    cmd = [cli[0], cli[1], "gateway", "call", method, "--json",
           "--timeout", str(timeout_ms), "--params", json.dumps(params)]
    t0 = time.monotonic()
    p = subprocess.run(cmd, capture_output=True, text=True, cwd="/tmp",
                       timeout=timeout_ms / 1000 + 60)
    dt = time.monotonic() - t0
    if p.returncode != 0:
        return None, dt, (p.stderr or p.stdout).strip()[-400:]
    try:
        return json.loads(p.stdout), dt, ""
    except ValueError:
        return None, dt, "unparseable output: " + p.stdout[-200:]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="archive (default: dry run)")
    ap.add_argument("--agent", default="makaron")
    ap.add_argument("--older-than-days", type=float, default=7)
    ap.add_argument("--batch", type=int, default=25)
    ap.add_argument("--pause-s", type=float, default=3)
    ap.add_argument("--max-per-run", type=int, default=3000, help="0 = no limit")
    ap.add_argument("--max-run-s", type=int, default=1800)
    ap.add_argument("--stop-call-s", type=float, default=15,
                    help="stop when one batch call takes longer than this")
    ap.add_argument("--call-timeout-ms", type=int, default=60000)
    ap.add_argument("--state-root", default=os.environ.get("OPENCLAW_STATE_DIR") or STATE_ROOT)
    ap.add_argument("--unit", default=UNIT)
    ap.add_argument("--state-dir", default=STATE_DIR)
    a = ap.parse_args(argv)
    a.batch = max(1, min(a.batch, MAX_TARGETS))
    agent_db = os.path.join(a.state_root, "agents", a.agent, "agent", "openclaw-agent.sqlite")
    workboard_db = os.path.join(a.state_root, "plugins", "workboard", "workboard.sqlite")

    started = time.time()
    cutoff_ms = int((started - a.older_than_days * 86400) * 1000)
    blockers = card_blockers(workboard_db)
    picked, skipped, unarchived_before, old_rows = select(agent_db, blockers, cutoff_ms, a.max_per_run)
    summary = {
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(started)),
        "mode": "apply" if a.apply else "dry-run", "agent": a.agent,
        "olderThanDays": a.older_than_days, "unarchivedBefore": unarchived_before,
        "oldWorkboardSessions": old_rows, "eligible": len(picked), "skipped": skipped,
        "archived": 0, "failed": 0, "batches": 0, "maxCallS": 0.0, "stopped": None,
    }
    print("v-session-archive: %s" % json.dumps(summary, ensure_ascii=False), flush=True)
    if not a.apply or not picked:
        return finish(a, summary)

    cli = gateway_cli(a.unit)
    errors = {}
    for i in range(0, len(picked), a.batch):
        if time.time() - started > a.max_run_s:
            summary["stopped"] = "max-run-s"
            break
        chunk = picked[i:i + a.batch]
        params = {"targets": [{"key": k, "agentId": a.agent, "expectedSessionId": sid} for k, sid in chunk],
                  "patch": {"archived": True}}
        res, dt, err = call(cli, "sessions.patchMany", params, a.call_timeout_ms)
        summary["batches"] += 1
        summary["maxCallS"] = round(max(summary["maxCallS"], dt), 2)
        if res is None:
            summary["stopped"] = "call failed: " + err
            break
        for o in res.get("outcomes") or []:
            if o.get("ok"):
                summary["archived"] += 1
            else:
                summary["failed"] += 1
                msg = ((o.get("error") or {}).get("message") or "?")[:120]
                msg = re.sub(r"agent:[^\s]+", "<key>", msg)
                errors[msg] = errors.get(msg, 0) + 1
        print("batch %d: %d targets in %.2fs, archived=%d failed=%d"
              % (summary["batches"], len(chunk), dt, summary["archived"], summary["failed"]), flush=True)
        if dt > a.stop_call_s:
            summary["stopped"] = "slow call %.1fs" % dt
            break
        time.sleep(a.pause_s)
    summary["errors"] = errors
    return finish(a, summary, agent_db)


def finish(a, summary, agent_db=None):
    if agent_db and summary["archived"]:
        con = ro(agent_db)
        try:
            summary["unarchivedAfter"] = con.execute(
                "SELECT count(*) FROM session_nodes WHERE archived_at IS NULL").fetchone()[0]
        finally:
            con.close()
    summary["durationS"] = round(time.time() - time.mktime(time.strptime(summary["startedAt"][:19], "%Y-%m-%dT%H:%M:%S")), 1)
    print("v-session-archive done: %s" % json.dumps(summary, ensure_ascii=False), flush=True)
    if a.apply:
        try:
            os.makedirs(a.state_dir, exist_ok=True)
            tmp = os.path.join(a.state_dir, "last-run.json.tmp")
            with open(tmp, "w") as f:
                json.dump(summary, f, ensure_ascii=False, indent=1)
            os.replace(tmp, os.path.join(a.state_dir, "last-run.json"))
        except OSError as e:
            print("cannot write state: %s" % e, file=sys.stderr)
    return 1 if summary.get("stopped") and summary["stopped"] != "max-run-s" else 0


if __name__ == "__main__":
    sys.exit(main())
