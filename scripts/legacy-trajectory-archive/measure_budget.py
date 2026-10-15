#!/usr/bin/env python3
"""Session disk-budget usage for makaron, counted like scripts/v-sentinel (PR #384)
and OpenClaw's measureSessionPhysicalDiskUsage: top-level sessions files except
migration archives, skills-prompts blobs, the agent DB and its WAL.
Run on V as openclaw or root. Prints JSON."""
import json
import os
import re

CONFIG = "/home/openclaw/.openclaw/openclaw.json"
AGENT = "/home/openclaw/.openclaw/agents/makaron"
MIGRATION_ARCHIVE = re.compile(r"\.migrated(?:\.\d+)?$|\.jsonl\.pre-doctor-(?:branch|openai-codex)-repair-.*\.bak$")
UNITS = {"b": 1, "kb": 1024, "k": 1024, "mb": 1024 ** 2, "m": 1024 ** 2,
         "gb": 1024 ** 3, "g": 1024 ** 3, "tb": 1024 ** 4, "t": 1024 ** 4}

m = json.load(open(CONFIG))["session"]["maintenance"]
v = re.match(r"^(\d+(?:\.\d+)?)([a-z]+)?$", str(m["maxDiskBytes"]).strip().lower())
max_bytes = int(round(float(v.group(1)) * UNITS[v.group(2) or "b"]))
files = files_bytes = 0
with os.scandir(AGENT + "/sessions") as it:
    for e in it:
        if e.is_file(follow_symlinks=False) and not MIGRATION_ARCHIVE.search(e.name):
            files += 1
            files_bytes += e.stat(follow_symlinks=False).st_size
blobs_bytes = 0
blobs = AGENT + "/sessions/skills-prompts/sha256"
if os.path.isdir(blobs):
    for prefix in os.listdir(blobs):
        d = os.path.join(blobs, prefix)
        if re.match(r"^[a-f0-9]{2}$", prefix) and os.path.isdir(d):
            blobs_bytes += sum(e.stat().st_size for e in os.scandir(d) if e.is_file(follow_symlinks=False))
db = AGENT + "/agent/openclaw-agent.sqlite"
db_bytes = sum(os.path.getsize(f) for f in (db, db + "-wal") if os.path.isfile(f))
total = files_bytes + blobs_bytes + db_bytes
print(json.dumps({
    "mode": m.get("mode"), "maxDiskBytes": max_bytes,
    "sessions_files": files, "sessions_files_bytes": files_bytes,
    "skills_prompts_bytes": blobs_bytes, "agent_db_and_wal_bytes": db_bytes,
    "total_bytes": total, "ratio": round(total / max_bytes, 4),
}))
