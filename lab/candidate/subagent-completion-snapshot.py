"""Copy one real session in a single read transaction; never write the shared DB."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3

session_id = "d2ca4d3a-0db1-46fa-9c91-1e58d2aee246"
relative = "agents/makaron/agent/openclaw-agent.sqlite"
source = Path(os.environ["VLAB_SHARED_STATE_DIR"]) / relative
dest = Path(os.environ["OPENCLAW_STATE_DIR"]) / relative
assert dest.resolve().is_relative_to(Path(os.environ["VLAB_CANDIDATE_DATA"]).resolve())
assert source.resolve() != dest.resolve() and not dest.exists()
dest.parent.mkdir(parents=True, exist_ok=True)
src = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
src.execute("PRAGMA query_only=ON")
src.execute("BEGIN")
out = sqlite3.connect(dest)
quote = lambda s: '"' + s.replace('"', '""') + '"'
schema = src.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL").fetchall()
virtuals = {name for kind, name, _, sql in schema if kind == "table" and "CREATE VIRTUAL TABLE" in sql.upper()}
tables = []
for kind, name, _, sql in schema:
    if kind != "table" or name.startswith("sqlite_") or name in virtuals or any(name.startswith(v + "_") for v in virtuals):
        continue
    out.execute(sql)
    tables.append(name)
# FTS tables are empty projections and may be rebuilt by the native runtime.
for kind, name, _, sql in schema:
    if name in virtuals and "USING fts5" in sql:
        out.execute(sql)
key = src.execute("SELECT session_key FROM session_windows WHERE session_id=?", (session_id,)).fetchone()[0]
conversations = [r[0] for r in src.execute("SELECT conversation_id FROM session_conversations WHERE session_id=?", (session_id,))]
counts = {}
for name in tables:
    columns = [r[1] for r in src.execute("PRAGMA table_info(" + quote(name) + ")")]
    if name in ("schema_meta", "session_key_contract"):
        where, args = "1", ()
    elif "session_id" in columns:
        where, args = "session_id=?", (session_id,)
    elif name == "session_nodes":
        where, args = "session_key=?", (key,)
    elif name == "conversations" and conversations:
        where, args = "conversation_id IN (" + ",".join("?" for _ in conversations) + ")", conversations
    else:
        continue
    rows = src.execute("SELECT " + ",".join(map(quote, columns)) + " FROM " + quote(name) + " WHERE " + where, args).fetchall()
    out.executemany("INSERT INTO " + quote(name) + " (" + ",".join(map(quote, columns)) + ") VALUES (" + ",".join("?" for _ in columns) + ")", rows)
    counts[name] = len(rows)
for kind, name, table, sql in schema:
    if kind == "index" and table in tables:
        out.execute(sql)
    elif kind in ("trigger", "view"):
        out.execute(sql)
out.execute("PRAGMA user_version=" + str(src.execute("PRAGMA user_version").fetchone()[0]))
out.commit()
def transcript_digest(db):
    rows = db.execute("SELECT seq,event_json,created_at FROM transcript_events WHERE session_id=? ORDER BY seq", (session_id,)).fetchall()
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False).encode()).hexdigest()
assert transcript_digest(src) == transcript_digest(out)
assert out.execute("PRAGMA quick_check").fetchone()[0] == "ok"
print(json.dumps({"kind": "real-session-snapshot", "rows": counts, "bytes": dest.stat().st_size, "transcriptSha256": transcript_digest(out), "sharedReadOnly": True}))
out.close()
src.rollback()
src.close()
