#!/usr/bin/env python3
"""Plan which legacy trajectory files in agents/makaron/sessions may move to cold storage.

Read-only. Run on V as openclaw (it needs the agent DB's -shm):
  sudo -u openclaw nice -n19 python3 plan.py > plan.json

Only trajectory artifacts move (Tianyi, 2026-10-16: chat transcripts that exist
only here stay in place). A file moves only when it is a trajectory artifact,
not a .zst canonical archive, a regular top-level file, unreferenced by any
session entry, and untouched for 14 days. "Referenced" is OpenClaw's own
disk-budget rule plus a superset: the file name carries a session id that is
some entry's current session (current_session_id / entry.sessionId), or is in
session_windows or session_transcript_archives.

Other mentions of an id inside entry_json (usageFamilySessionIds,
compactionCheckpoints[].sessionId, ...) do not make the runtime read trajectory
files: usage grouping reads transcripts, and trajectory export follows only the
entry's own sessionFile, which is a sqlite: marker for every entry. Those files
move, and each row records where its id is still mentioned (db_mentions).
Trajectories of a session named in a compaction checkpoint stay, next to the
checkpoint transcript that must stay.

The DB is read in rowid chunks, each its own short read transaction: one long
read on V's agent DB grew the WAL to 2 GB on 2026-10-15.
"""
import json
import os
import re
import sqlite3
import sys
import time

ROOT = "/home/openclaw/.openclaw/agents/makaron"
SD = os.path.realpath(ROOT + "/sessions")
DB = ROOT + "/agent/openclaw-agent.sqlite"
MIN_AGE_S = 14 * 86400
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)


def trajectory_kind(name):
    if name.endswith(".zst"):
        return None
    if name.endswith(".trajectory.jsonl"):
        return "trajectory.jsonl"
    if name.endswith(".trajectory.jsonl.gz"):
        return "trajectory.jsonl.gz"
    if name.endswith(".trajectory-path.json"):
        return "trajectory-path.json"
    if ".trajectory.jsonl.deleted." in name:
        return "trajectory.jsonl.deleted"
    return None


con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True, isolation_level=None, timeout=30)


def chunks(table, cols, step):
    lo, hi = con.execute("select min(rowid), max(rowid) from %s" % table).fetchone()
    a = lo
    while a is not None and a <= hi:
        yield from con.execute(
            "select %s from %s where rowid >= ? and rowid < ?" % (cols, table), (a, a + step)
        ).fetchall()
        a += step
        time.sleep(0.02)


def inside(p):
    rp = os.path.realpath(p if os.path.isabs(p) else os.path.join(SD, p))
    rel = os.path.relpath(rp, SD)
    return None if rel.startswith("..") or rel == "." else rp


mentions = {}


def walk(o, path):
    if isinstance(o, dict):
        for k, v in o.items():
            walk(v, path + "." + k)
    elif isinstance(o, list):
        for v in o:
            walk(v, path + "[]")
    elif isinstance(o, str):
        for m in UUID.findall(o):
            mentions.setdefault(m.lower(), set()).add(path)


# Rule A: disk-budget resolveReferencedSessionArtifactPaths (core/dist disk-budget-*.js).
referenced = {}
ids = set()
entries = 0
for key, cur, ej in chunks("session_nodes", "session_key, current_session_id, entry_json", 200):
    entries += 1
    try:
        e = json.loads(ej)
    except Exception:
        e = {}
        for m in UUID.findall(ej or ""):
            ids.add(m.lower())
    sid = e.get("sessionId") or cur
    for s in (sid, cur):
        if isinstance(s, str) and s:
            ids.add(s.lower())
    walk(e, "entry")
    sf = e.get("sessionFile")
    sf = sf.strip() if isinstance(sf, str) else None
    tp = None
    if sf and not sf.startswith("sqlite:"):
        tp = inside(sf)
    elif not sf and sid:
        tp = inside(sid + ".jsonl")
    if tp:
        referenced[tp] = "sessionFile" if sf else "default <sessionId>.jsonl"
        stem = tp[:-6] if tp.endswith(".jsonl") else tp
        for t in (stem + ".trajectory-path.json", stem + ".trajectory.jsonl"):
            referenced.setdefault(t, "trajectory of entry")
    for cp in e.get("compactionCheckpoints") or []:
        for side in ("preCompaction", "postCompaction"):
            f = ((cp or {}).get(side) or {}).get("sessionFile")
            if isinstance(f, str) and f.strip():
                p = inside(f.strip())
                if p:
                    referenced.setdefault(p, "compactionCheckpoint")
for (sid,) in chunks("session_windows", "session_id", 2000):
    ids.add(str(sid).lower())
for (sid,) in chunks("session_transcript_archives", "session_id", 2000):
    ids.add(str(sid).lower())
con.close()

now = time.time()
move, kept = [], {}
other_trajectory_like = 0


def keep(reason, size):
    c = kept.setdefault(reason, [0, 0])
    c[0] += 1
    c[1] += size


with os.scandir(SD) as it:
    for d in it:
        if not d.is_file(follow_symlinks=False):
            continue
        st = d.stat(follow_symlinks=False)
        path = os.path.join(SD, d.name)
        kind = trajectory_kind(d.name)
        if kind is None:
            if "trajectory" in d.name and not d.name.endswith(".zst"):
                other_trajectory_like += 1
            keep("not a trajectory artifact" if not d.name.endswith(".zst") else "zst canonical archive", st.st_size)
            continue
        if st.st_nlink != 1:
            keep("hard-linked", st.st_size)
            continue
        if path in referenced:
            keep("referenced: " + referenced[path], st.st_size)
            continue
        if any(m.lower() in ids for m in UUID.findall(d.name)):
            keep("session id still in DB", st.st_size)
            continue
        named = set().union(*(mentions.get(m.lower(), set()) for m in UUID.findall(d.name)))
        if any("compactionCheckpoints" in p for p in named):
            # Same session as a checkpoint transcript that stays in place; keep the set together.
            keep("compaction checkpoint session", st.st_size)
            continue
        if now - st.st_mtime < MIN_AGE_S or now - st.st_ctime < MIN_AGE_S:
            keep("changed within 14 days", st.st_size)
            continue
        move.append({
            "name": d.name,
            "kind": kind,
            "size": st.st_size,
            "mtime_ns": st.st_mtime_ns,
            "mode": "%04o" % (st.st_mode & 0o7777),
            "uid": st.st_uid,
            "gid": st.st_gid,
            "month": time.strftime("%Y-%m", time.localtime(st.st_mtime)),
            "db_mentions": sorted(named),
        })

move.sort(key=lambda r: (r["month"], r["name"]))
by_month, by_kind = {}, {}
for r in move:
    for agg, k in ((by_month, r["month"]), (by_kind, r["kind"])):
        c = agg.setdefault(k, [0, 0])
        c[0] += 1
        c[1] += r["size"]
json.dump({
    "planned_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    "sessions_dir": SD,
    "session_nodes_entries": entries,
    "known_session_ids": len(ids),
    "referenced_paths_resolved": len(referenced),
    "move_files": len(move),
    "move_bytes": sum(r["size"] for r in move),
    "move_by_month": by_month,
    "move_by_kind": by_kind,
    "kept": kept,
    "other_trajectory_like_names_kept": other_trajectory_like,
    "move_with_db_mentions": [sum(1 for r in move if r["db_mentions"]), sum(r["size"] for r in move if r["db_mentions"])],
    "move": move,
}, sys.stdout, ensure_ascii=False)
