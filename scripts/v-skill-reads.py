#!/usr/bin/env python3
"""Count which SKILL.md files V's agents actually read, from session transcripts, read-only.

Why: skill_usage (state/openclaw.sqlite) is not a usage count. 9.1 records a use only when the
`read` tool opens a skill that is in the session's admitted catalog (skillsSnapshot.resolvedSkills,
agent-tools.before-tool-call). A skill cut from the catalog, or read with `exec`/`bash cat`, is never
counted. On 2026-10-26 makaron showed 285 uses ending 09-04 while transcripts had 404 reads in 273
sessions up to that day.

transcript_events has no created_at index, so this never filters by time: it takes the N most
recently updated sessions through idx_agent_session_nodes_updated_at and reads the last M events of
each by primary key (session_id, seq). Defaults: 600 sessions x 3000 events, about 9 s on V.

Usage (on V):  sudo -u openclaw nice -n 19 ionice -c3 python3 v-skill-reads.py [sessions] [events]
"""
import collections
import json
import re
import sqlite3
import sys
import time

DB = "/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite"
SESSIONS = int(sys.argv[1]) if len(sys.argv) > 1 else 600
EVENTS = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
PATH = re.compile(r'([\w.~/-]*/([^/"\\\s]+)/SKILL\.md)')

db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
started = time.time()
rows = db.execute(
    "SELECT session_key, current_session_id FROM session_nodes INDEXED BY idx_agent_session_nodes_updated_at "
    "ORDER BY updated_at DESC LIMIT ?", (SESSIONS,)).fetchall()
reads = collections.defaultdict(list)
scanned = events = 0
oldest = None
for key, session_id in rows:
    last = db.execute("SELECT max(seq) FROM transcript_events WHERE session_id = ?", (session_id,)).fetchone()[0]
    if last is None:
        continue
    scanned += 1
    for event_json, created_at in db.execute(
            "SELECT event_json, created_at FROM transcript_events WHERE session_id = ? AND seq > ? ORDER BY seq",
            (session_id, last - EVENTS)):
        events += 1
        oldest = created_at if oldest is None else min(oldest, created_at)
        if "SKILL.md" not in event_json:
            continue
        try:
            message = json.loads(event_json).get("message") or {}
        except ValueError:
            continue
        if message.get("role") != "assistant":
            continue
        for block in message.get("content") or []:
            if not isinstance(block, dict) or block.get("type") != "toolCall":
                continue
            args = json.dumps(block.get("arguments") or {}, ensure_ascii=False)
            for _, name in PATH.findall(args):
                reads[name].append({"tool": block.get("name"), "session": key, "at": created_at})
summary = {
    name: {"reads": len(v), "sessions": len({r["session"] for r in v}), "lastAt": max(r["at"] for r in v),
           "tools": dict(collections.Counter(r["tool"] for r in v))}
    for name, v in reads.items()
}
print(json.dumps({"sessions": scanned, "events": events, "oldestAt": oldest,
                  "elapsedS": round(time.time() - started, 1), "skills": summary}, ensure_ascii=False))
