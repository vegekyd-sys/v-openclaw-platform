"""Private, consistent projection-only copy, retaining actual FTS segments/rowids."""
import json
import os
from pathlib import Path
import sqlite3
import time

data = Path(os.environ['VLAB_CANDIDATE_DATA']).resolve()
source = Path(os.environ['VLAB_SHARED_STATE_DIR']) / 'agents/makaron/agent/openclaw-agent.sqlite'
dest = data / 'transcript-index.sqlite'
assert not dest.exists()
assert data != source.parent and data in dest.parents
disk = os.statvfs(data)
assert disk.f_bavail * disk.f_frsize > 2 * 1024**3, 'Need 2 GiB for bounded projection copies'
started = time.monotonic()
db = sqlite3.connect(dest, timeout=5)
db.execute('PRAGMA journal_mode=DELETE')
db.execute('ATTACH DATABASE ? AS live', ('file:' + str(source) + '?mode=ro',))
db.execute('PRAGMA foreign_keys=OFF')
def guard():
    if time.monotonic() - started > 120:
        return 1
    if dest.stat().st_size > 256 * 1024**2:
        return 1
    return 0
db.set_progress_handler(guard, 10000)
try:
    db.execute('BEGIN')
    # First read fixes the source snapshot; no source checkpoint or write.
    schema = db.execute("SELECT sql FROM live.sqlite_master WHERE name='session_transcript_fts'").fetchone()[0]
    db.execute(schema)
    for name, in db.execute("SELECT name FROM live.sqlite_master WHERE type='table' AND name GLOB 'session_transcript_fts_*'").fetchall():
        assert name.replace('_', '').isalnum()
        db.execute('DELETE FROM main."' + name + '"')
        db.execute('INSERT INTO main."' + name + '" SELECT * FROM live."' + name + '"')
    for name in ['session_transcript_active_events', 'session_transcript_index_state']:
        db.execute(db.execute('SELECT sql FROM live.sqlite_master WHERE name=?', (name,)).fetchone()[0])
        db.execute('INSERT INTO main.' + name + ' SELECT * FROM live.' + name)
    db.commit()
    rows = db.execute('SELECT session_id, count(*) AS n FROM session_transcript_fts GROUP BY session_id ORDER BY n DESC LIMIT 8').fetchall()
    # Choose a real, indexed session with sufficient existing rows.
    chosen = next((sid for sid, count in rows if count > 512 and db.execute('SELECT 1 FROM session_transcript_index_state WHERE session_id=?', (sid,)).fetchone()), None)
    assert chosen, 'No representative large indexed session in this real snapshot'
    counts = dict(db.execute('SELECT session_id, count(*) FROM session_transcript_fts GROUP BY session_id'))
    metadata = {'file': str(dest), 'sourceBytes': source.stat().st_size,
                'snapshotBytes': dest.stat().st_size, 'ftsRows': sum(counts.values()),
                'sessionId': chosen, 'targetFtsRows': counts[chosen],
                'sessions': len(counts), 'snapshotMs': round((time.monotonic()-started)*1000)}
    (data / 'transcript-index.metadata.json').write_text(json.dumps(metadata))
    # IDs and raw contents remain private. Receipts carry aggregate evidence only.
    print(json.dumps({k: v for k, v in metadata.items() if k not in ['file', 'sessionId']}))
finally:
    db.close()
