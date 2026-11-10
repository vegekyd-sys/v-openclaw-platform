#!/usr/bin/env python3
"""scripts/codex-compaction-audit.py classifies where a compaction fell in its turn."""
import importlib.util
import json
import os
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("audit", os.path.join(HERE, "..", "scripts", "codex-compaction-audit.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def rec(t, kind, **payload):
    if kind in ("task_started", "task_complete", "token_count", "thread_settings_applied"):
        return {"timestamp": t, "type": "event_msg", "payload": {"type": kind, **payload}}
    if kind == "compacted":
        return {"timestamp": t, "type": "compacted", "payload": {"message": "summary"}}
    return {"timestamp": t, "type": "response_item", "payload": {"type": kind, **payload}}


def tokens(t, n, cached):
    return rec(t, "token_count", info={"last_token_usage": {"input_tokens": n, "cached_input_tokens": cached}})


def developer(t, chars):
    return rec(t, "message", role="developer", content=[{"type": "input_text", "text": "x" * chars}])


def assistant(t, text="answer"):
    return rec(t, "message", role="assistant", content=[{"type": "output_text", "text": text}])


EVENTS = [
    {"timestamp": "2026-11-10T00:00:00.000Z", "type": "session_meta", "payload": {"id": "thread-1", "model_provider": "deepseek"}},
    # Turn 1 ends at 887k.
    rec("2026-11-10T01:00:00.000Z", "task_started"),
    tokens("2026-11-10T01:00:05.000Z", 887_365, 880_000),
    assistant("2026-11-10T01:00:06.000Z"),
    rec("2026-11-10T01:00:07.000Z", "task_complete"),
    # Six hours later: the context is re-delivered, Codex compacts before answering (pre-turn).
    developer("2026-11-10T07:00:00.000Z", 75_735),
    rec("2026-11-10T07:00:01.000Z", "task_started"),
    tokens("2026-11-10T07:00:21.000Z", 732_055, 72_192),
    assistant("2026-11-10T07:00:21.300Z", "**Handoff Summary**"),
    rec("2026-11-10T07:00:21.400Z", "compacted"),
    assistant("2026-11-10T07:00:25.000Z"),
    rec("2026-11-10T07:00:26.000Z", "task_complete"),
    # A working turn compacts between tool rounds (mid-turn).
    rec("2026-11-10T08:00:00.000Z", "task_started"),
    rec("2026-11-10T08:00:02.000Z", "function_call", name="exec_command"),
    tokens("2026-11-10T08:00:30.000Z", 760_000, 4_000),
    assistant("2026-11-10T08:00:30.100Z", "**Handoff Summary**"),
    rec("2026-11-10T08:00:30.200Z", "compacted"),
    rec("2026-11-10T08:00:33.000Z", "function_call", name="exec_command"),
    assistant("2026-11-10T08:00:40.000Z"),
    rec("2026-11-10T08:00:41.000Z", "task_complete"),
    # A turn answers and then compacts before it ends (post-turn).
    rec("2026-11-10T09:00:00.000Z", "task_started"),
    assistant("2026-11-10T09:00:04.000Z", "391"),
    tokens("2026-11-10T09:00:22.000Z", 871_428, 3_968),
    assistant("2026-11-10T09:00:22.100Z", "**Handoff Summary**"),
    rec("2026-11-10T09:00:22.200Z", "compacted"),
    rec("2026-11-10T09:00:22.300Z", "task_complete"),
]

with tempfile.TemporaryDirectory() as root:
    day = os.path.join(root, "2026", "11", "10")
    os.makedirs(day)
    path = os.path.join(day, "rollout-2026-11-10T00-00-00-thread-1.jsonl")
    with open(path, "w") as fh:
        for e in EVENTS:
            fh.write(json.dumps(e) + "\n")
    meta, rows = audit.audit_file(path, "2026-11-10T00:00:00")
    assert meta["model_provider"] == "deepseek"
    kinds = [r["kind"] for r in rows]
    assert kinds == ["pre-turn", "mid-turn", "post-turn"], kinds
    pre = rows[0]
    assert pre["waitSec"] == 20.4, pre
    assert pre["previousTurnEndedAt"] == 887_365, pre
    assert pre["developerCharsAtTurnStart"] == 75_735, pre
    assert pre["idleMin"] == 359.9, pre
    assert (pre["requestInput"], pre["requestCached"]) == (732_055, 72_192), pre
    assert rows[1]["waitSec"] is None and rows[2]["waitSec"] is None
    # Compactions before --since are left out.
    _, later = audit.audit_file(path, "2026-11-10T08:30:00")
    assert [r["kind"] for r in later] == ["post-turn"], later

print("codex-compaction-audit: ok")
