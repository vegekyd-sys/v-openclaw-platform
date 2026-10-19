import sqlite3,json,os,time,hashlib
from pathlib import Path
start=time.monotonic();data=Path(os.environ['VLAB_CANDIDATE_DATA']).resolve();state=Path(os.environ['OPENCLAW_STATE_DIR']);shared=Path(os.environ['VLAB_SHARED_STATE_DIR'])
assert state.resolve().is_relative_to(data)
space=os.statvfs(data);assert space.f_bavail*space.f_frsize>=1024**3,'Need 1GiB after private runtime copy; refusing metadata snapshot'
q=lambda s:'"'+s.replace('"','""')+'"'
def digest(c,table):
 h=hashlib.sha256()
 for row in c.execute('SELECT * FROM '+q(table)+' ORDER BY 1'):
  h.update(json.dumps(row,ensure_ascii=False,default=lambda v:v.hex(),separators=(',',':')).encode());h.update(b'\n')
 return h.hexdigest()
def copy(source,dest,selected):
 assert source!=dest and not dest.exists();dest.parent.mkdir(parents=True,exist_ok=True)
 src=sqlite3.connect(source.as_uri()+'?mode=ro',uri=True,timeout=5);src.execute('PRAGMA query_only=ON');src.execute('BEGIN')
 dst=sqlite3.connect(dest);dst.execute('PRAGMA foreign_keys=OFF')
 schema=src.execute('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL').fetchall();virtuals={n for k,n,t,s in schema if k=='table' and 'CREATE VIRTUAL TABLE' in s.upper()};tables=[]
 for kind,name,table,sql in schema:
  if kind!='table' or name.startswith('sqlite_') or name in virtuals or any(name.startswith(v+'_') for v in virtuals):continue
  dst.execute(sql);tables.append(name)
 for kind,name,table,sql in schema:
  if name in virtuals and 'USING fts5' in sql:dst.execute(sql)
 counts={};hashes={}
 for table in selected:
  if table not in tables:continue
  cols=[x[1] for x in src.execute('PRAGMA table_info('+q(table)+')')];n=0
  select=src.execute('SELECT '+','.join(map(q,cols))+' FROM '+q(table))
  insert='INSERT INTO '+q(table)+' ('+','.join(map(q,cols))+') VALUES ('+','.join('?' for _ in cols)+')'
  while rows:=select.fetchmany(64):
   dst.executemany(insert,rows);n+=len(rows)
   assert time.monotonic()-start<90,'Metadata snapshot timeout'
   assert dest.stat().st_size<384*1024**2,'Metadata copy exceeds384MiB cap'
  counts[table]=n;hashes[table]=digest(src,table);assert digest(dst,table)==hashes[table]
 for kind,name,table,sql in schema:
  if (kind=='index' and table in tables) or kind in ('trigger','view'):dst.execute(sql)
 dst.execute('PRAGMA user_version='+str(src.execute('PRAGMA user_version').fetchone()[0]));dst.commit()
 assert dst.execute('PRAGMA quick_check').fetchone()[0]=='ok'
 out={'tables':counts,'hashes':hashes,'bytes':dest.stat().st_size,'sourceBytes':source.stat().st_size}
 if 'session_nodes' in tables:
  out['entryJson']=dict(zip(['rows','jsonBytes','maxJsonBytes'],dst.execute('SELECT count(*),sum(length(CAST(entry_json AS BLOB))),max(length(CAST(entry_json AS BLOB))) FROM session_nodes').fetchone()))
  out['visibilityCounts']=dst.execute("SELECT coalesce(json_extract(entry_json,'$.visibility'),'shared'),count(*) FROM session_nodes GROUP BY 1").fetchall()
 dst.close();src.rollback();src.close();return out
agentTables=['schema_meta','session_key_contract','session_nodes','session_windows','session_participants','session_members','session_conversations','conversations']
metadata={'agent':copy(shared/'agents/makaron/agent/openclaw-agent.sqlite',state/'agents/makaron/agent/openclaw-agent.sqlite',agentTables)}
sourceState=shared/'state/openclaw.sqlite'
assert sourceState.exists() and sourceState.stat().st_size>0,'Actual profile/alias state must be present'
metadata['profiles']=copy(sourceState,state/'state/openclaw.sqlite',['schema_meta','user_profiles','user_profile_identities','user_profile_emails'])
metadata['snapshotMs']=round((time.monotonic()-start)*1000);metadata['sharedReadOnly']=True;metadata['transcriptRowsCopied']=0;metadata['credentialRowsCopied']=0
(data/'sharing-snapshot.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2));print(json.dumps(metadata,ensure_ascii=False))
