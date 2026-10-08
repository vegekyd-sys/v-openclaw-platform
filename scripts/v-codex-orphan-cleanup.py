#!/usr/bin/env python3
"""Drop Codex app-server registrations whose processes are gone, before the Gateway starts.

The Codex plugin records every app-server it spawns in state/openclaw.sqlite
(plugin_state_entries, plugin_id "codex", namespace "app-server-processes"), with
the parent (Gateway) and child pids and their start identity "<boot_id>:<starttime>"
(field 22 of /proc/<pid>/stat). When the Gateway stops, systemd kills the children,
but the rows stay. The new Gateway tries to reap every registered process before
starting an app-server; its /proc scan has a short deadline, right after a start it
often runs out, and the turn fails with "Cannot reap registered Codex process <pid>"
(V, almost every restart since 2026-09-25; see memory codex-orphan-reaper-after-restart).

Runs as ExecStartPre of openclaw-gateway.service, as the service user, while no
Gateway is running. A row is removed only when neither its parent nor its child
process is alive with the recorded identity. A row whose child is still alive is a
real orphan for the plugin's own reaper and is left alone. Never fails the start:
every outcome, including errors, is one line on stdout (journal) and exit 0.
"""
import argparse
import json
import os
import sqlite3
import sys

DEFAULT_DB = "/home/openclaw/.openclaw/state/openclaw.sqlite"


def start_ticks(proc_root, pid):
    try:
        with open(os.path.join(proc_root, str(pid), "stat")) as f:
            stat = f.read()
    except (FileNotFoundError, ProcessLookupError, NotADirectoryError):
        return None
    # comm may contain spaces and parentheses; fields after the last ")" start at field 3
    fields = stat[stat.rindex(")") + 2:].split()
    return fields[19]


def alive(proc_root, boot_id, info):
    """Is the process recorded in info still the same running process?"""
    if not isinstance(info, dict) or not isinstance(info.get("pid"), int):
        return False
    ticks = start_ticks(proc_root, info["pid"])
    if ticks is None:
        return False
    started = info.get("startedAt")
    if not isinstance(started, str) or ":" not in started:
        return True  # no identity recorded: a live pid is treated as the same process
    boot, _, recorded = started.rpartition(":")
    return boot == boot_id and recorded == ticks


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--proc", default="/proc")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    out = {"event": "codex-orphan-cleanup", "db": args.db, "dryRun": args.dry_run}
    try:
        with open(os.path.join(args.proc, "sys/kernel/random/boot_id")) as f:
            boot_id = f.read().strip()
        if not os.path.exists(args.db):
            out["skipped"] = "no state database"
            return out
        db = sqlite3.connect(args.db, timeout=5)
        db.execute("PRAGMA busy_timeout = 5000")
        rows = db.execute(
            "select rowid, value_json from plugin_state_entries "
            "where plugin_id = 'codex' and namespace = 'app-server-processes'").fetchall()
        stale, kept_child, kept_parent = [], 0, 0
        for rowid, value in rows:
            try:
                rec = json.loads(value)
            except (TypeError, ValueError):
                continue
            if alive(args.proc, boot_id, rec.get("child")):
                kept_child += 1
            elif alive(args.proc, boot_id, rec.get("parent")):
                kept_parent += 1
            else:
                stale.append((rowid, value, (rec.get("parent") or {}).get("pid"), (rec.get("child") or {}).get("pid")))
        removed = 0
        if stale and not args.dry_run:
            with db:
                for rowid, value, _, _ in stale:
                    # value_json in the WHERE: never delete a row the plugin rewrote meanwhile
                    removed += db.execute(
                        "delete from plugin_state_entries where rowid = ? and plugin_id = 'codex' "
                        "and namespace = 'app-server-processes' and value_json = ?", (rowid, value)).rowcount
        db.close()
        out.update(checked=len(rows), stale=len(stale), removed=removed,
                   keptAliveChild=kept_child, keptAliveParent=kept_parent,
                   stalePids=[[p, c] for _, _, p, c in stale][:20])
    except Exception as e:  # never block the Gateway start
        out["error"] = f"{type(e).__name__}: {e}"
    return out


if __name__ == "__main__":
    print(json.dumps(main()), flush=True)
    sys.exit(0)
