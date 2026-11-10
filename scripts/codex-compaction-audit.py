#!/usr/bin/env python3
"""Where Codex compacts the makaron agent's threads, from the rollouts alone (read-only).

    sudo ionice -c3 python3 codex-compaction-audit.py --since 2026-11-10T00:00:00Z [--provider deepseek] [--json]

For every native compaction (`compacted` record) in rollouts touched since --since, says which part of
its turn it fell in:
  pre-turn   before the turn produced anything: the user waits on "📦 正在整理上下文" before the first word
  post-turn  after the turn's last answer, before the turn ended (model_post_turn_compact_threshold_percent)
  mid-turn   between tool rounds of a working turn
and prints the compaction request's size and cache hit, how long the pre-turn wait was, the token count the
previous turn ended at, and how many developer characters were delivered at the start of the turn (the
OpenClaw workspace context / policy re-deliveries that push a thread over the line).

Opens each rollout read-only and never writes. On V the rollouts sit under
/home/openclaw/.openclaw/agents/makaron/agent/codex-home/sessions (override with --sessions).
"""
import argparse
import datetime as dt
import glob
import json
import os
import sys


def ts(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def audit_file(path, since):
    with open(path, "rb") as fh:
        raw = fh.read()
    if b'"compacted"' not in raw:
        return None, []
    lines = raw.splitlines()
    try:
        meta = json.loads(lines[0]).get("payload", {})
    except ValueError:
        return None, []
    events = []
    for line in lines:
        try:
            d = json.loads(line)
        except ValueError:
            continue
        events.append(d)
    out = []
    turn = None
    last_end = None
    last_turn_input = None
    last_input = None
    developer_since_end = 0
    for i, d in enumerate(events):
        t, p = d.get("type"), d.get("payload") or {}
        pt = p.get("type")
        stamp = d.get("timestamp", "")
        if t == "response_item" and pt == "message" and p.get("role") == "developer":
            developer_since_end += sum(len(c.get("text", "")) for c in p.get("content") or [])
        if pt == "task_started":
            turn = {"start": stamp, "outputs": 0, "developer": developer_since_end, "idle": (ts(stamp) - ts(last_end)) / 60 if last_end else None}
        elif pt in ("task_complete", "turn_aborted"):
            last_end, last_turn_input, developer_since_end, turn = stamp, last_input, 0, None
        elif pt == "token_count":
            usage = (p.get("info") or {}).get("last_token_usage") or {}
            if usage.get("input_tokens"):
                last_input = (usage["input_tokens"], usage.get("cached_input_tokens") or 0)
        elif t == "response_item" and pt in ("function_call", "custom_tool_call") and turn:
            turn["outputs"] += 1
        elif t == "response_item" and pt == "message" and p.get("role") == "assistant" and turn:
            turn["outputs"] += 1
        elif t == "compacted" and stamp >= since:
            # The summary itself is written as one assistant message right before `compacted`.
            produced = (turn["outputs"] - 1) if turn else 0
            rest = events[i + 1:]
            later_work = False
            for e in rest:
                ep = e.get("payload") or {}
                if ep.get("type") in ("task_complete", "turn_aborted"):
                    break
                if e.get("type") == "response_item" and ep.get("type") in ("function_call", "custom_tool_call"):
                    later_work = True
                    break
                if e.get("type") == "response_item" and ep.get("type") == "message" and ep.get("role") == "assistant":
                    later_work = True
                    break
            kind = "pre-turn" if produced <= 0 else ("mid-turn" if later_work else "post-turn")
            out.append({
                "at": stamp, "kind": kind, "thread": meta.get("id"),
                "idleMin": None if not turn or turn["idle"] is None else round(turn["idle"], 1),
                "waitSec": round(ts(stamp) - ts(turn["start"]), 1) if turn and kind == "pre-turn" else None,
                "previousTurnEndedAt": last_turn_input[0] if last_turn_input else None,
                "developerCharsAtTurnStart": turn["developer"] if turn else None,
                "requestInput": last_input[0] if last_input else None,
                "requestCached": last_input[1] if last_input else None,
            })
    return meta, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True, help="ISO time, e.g. 2026-11-10T00:00:00Z")
    ap.add_argument("--sessions", default="/home/openclaw/.openclaw/agents/makaron/agent/codex-home/sessions")
    ap.add_argument("--provider", default="deepseek", help="model_provider of the threads to read ('' = all)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    since_epoch = ts(args.since)
    since = dt.datetime.fromtimestamp(since_epoch, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    rows = []
    for path in glob.glob(os.path.join(args.sessions, "*", "*", "*", "rollout-*.jsonl")):
        if os.path.getmtime(path) < since_epoch:
            continue
        meta, found = audit_file(path, since)
        if meta is None or (args.provider and meta.get("model_provider") != args.provider):
            continue
        rows.extend(found)
    rows.sort(key=lambda r: r["at"])
    counts = {k: sum(1 for r in rows if r["kind"] == k) for k in ("pre-turn", "post-turn", "mid-turn")}
    waits = sorted(r["waitSec"] for r in rows if r["waitSec"] is not None)
    summary = {"since": args.since, "compactions": len(rows), **counts,
               "preTurnWaitSec": {"p50": waits[len(waits) // 2], "max": waits[-1]} if waits else None}
    if args.json:
        json.dump({"summary": summary, "compactions": rows}, sys.stdout, ensure_ascii=False, indent=1)
        print()
        return
    print(json.dumps(summary, ensure_ascii=False))
    for r in rows:
        print(json.dumps(r, ensure_ascii=False))


if __name__ == "__main__":
    main()
