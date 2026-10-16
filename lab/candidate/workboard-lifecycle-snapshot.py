"""One private Workboard backup plus narrow session metadata; no Agent DB backup."""
import datetime,json,os,sqlite3,time
from pathlib import Path

data=Path(os.environ['VLAB_CANDIDATE_DATA']).resolve()
shared=Path(os.environ['VLAB_SHARED_STATE_DIR'])
assert os.statvfs(data).f_bavail*os.statvfs(data).f_frsize>1024**3, 'Need 1GiB free after runtime copy'
dest=data/'lifecycle-source.sqlite'
assert not dest.exists()
start=time.monotonic()
source=shared/'plugins/workboard/workboard.sqlite'
src=sqlite3.connect(source.as_uri()+'?mode=ro',uri=True,timeout=2)
src.execute('PRAGMA query_only=ON')
out=sqlite3.connect(dest)
def progress(status,remaining,total):
    assert time.monotonic()-start<60,'bounded Workboard snapshot timed out'
    assert total*4096<256*1024**2,'Workboard snapshot exceeds256MiB'
src.backup(out,pages=128,progress=progress,sleep=0.01)
tables=['workboard_cards','workboard_card_events','workboard_card_comments','workboard_card_attempts','workboard_card_artifacts']
counts={t:out.execute('SELECT COUNT(*) FROM '+t).fetchone()[0] for t in tables}
out.close();src.close()
agent=shared/'agents/makaron/agent/openclaw-agent.sqlite'
c=sqlite3.connect(agent.as_uri()+'?mode=ro',uri=True,timeout=2)
c.execute('PRAGMA query_only=ON');deadline=time.monotonic()+15
c.set_progress_handler(lambda:int(time.monotonic()>deadline),10000)
c.execute('BEGIN')
sessions=[{'key':key,'status':status,'updatedAt':updated,**({'abortedLastRun':True} if aborted else {})}
          for key,status,updated,aborted in c.execute("SELECT session_key,status,updated_at,json_extract(entry_json,'$.abortedLastRun') FROM session_nodes ORDER BY session_key")]
c.rollback();c.close()
(data/'lifecycle-sessions.json').write_text(json.dumps(sessions))
metadata={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workboardBytes':dest.stat().st_size,
          'counts':counts,'sessionMetadataRows':len(sessions),'snapshotMs':round((time.monotonic()-start)*1000),
          'source':'shared VLab real Workboard backup and persisted session_nodes key/status/updatedAt/aborted projection',
          'scope':'two independently consistent database reads; not an atomic live sessions.list/active-run snapshot',
          'agentDatabaseCopied':False,'transcriptsCopied':False,'sharedReadOnly':True}
(data/'lifecycle-snapshot.json').write_text(json.dumps(metadata,indent=2))
print(json.dumps(metadata))
