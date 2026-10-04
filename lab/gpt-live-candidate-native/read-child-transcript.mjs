import assert from 'node:assert/strict';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Equivalent to the native SQLite active transcript branch. No Gateway/database
// admission helper is imported and no JSONL or terminal-text fallback is used.
export function readPrivateChildTranscript({state,candidateData,sessionId,runId,requestedSessionKey}) {
  assert(path.isAbsolute(state)&&path.isAbsolute(candidateData)&&sessionId&&runId);
  const db=path.join(state,'agents/makaron/agent/openclaw-agent.sqlite');
  const value=JSON.parse(execFileSync('python3',['-c',String.raw`
import json,os,sqlite3,sys,urllib.parse
database,root,session_id=sys.argv[1:4]
assert os.path.realpath(database).startswith(os.path.realpath(root)+os.sep),'Child transcript escaped Candidate'
db=sqlite3.connect('file:'+urllib.parse.quote(os.path.realpath(database))+'?mode=ro',uri=True)
db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
assert db.execute('SELECT agent_id FROM schema_meta LIMIT 1').fetchone()[0]=='makaron'
key=db.execute('SELECT session_key FROM session_windows WHERE session_id=?',(session_id,)).fetchone()
assert key,'Exact terminal child session is absent from private SQLite'
rows=list(db.execute('SELECT event.seq,event.created_at,event.event_json FROM session_transcript_active_events active JOIN transcript_events event ON event.session_id=active.session_id AND event.seq=active.event_seq WHERE active.session_id=? AND active.message_position IS NOT NULL ORDER BY active.message_position',(session_id,)))
raw=list(db.execute('SELECT seq,created_at,event_json FROM transcript_events WHERE session_id=? ORDER BY seq',(session_id,)))
decode=lambda rs:[{'seq':r[0],'createdAt':r[1],'event':json.loads(r[2])} for r in rs]
print(json.dumps({'canonicalSessionKey':key[0],'activeEvents':decode(rows),'rawEvents':decode(raw),'queryOnly':True,'agentId':'makaron'}))
db.rollback();db.close()
  `,db,candidateData,sessionId],{encoding:'utf8',maxBuffer:8*1024**2}));
  assert.equal(value.canonicalSessionKey,requestedSessionKey,'Exact child terminal transcript identity mismatch');
  return {...value,sessionId,runId,requestedSessionKey,source:'private-sqlite-active-transcript',observedAt:Date.now()};
}

export function activeTranscriptMessages(transcript) {
  return (transcript?.activeEvents??[]).filter(row=>row.event?.message)
    .map(row=>({...row.event.message,_transcriptSeq:row.seq,_transcriptCreatedAt:row.createdAt}));
}
