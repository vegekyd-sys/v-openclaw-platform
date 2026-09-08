"""Stage the verified snapshot in the owned, stopped VLab; never production."""
import pathlib, os, socket, json, sqlite3, subprocess, pwd, time

assert socket.gethostname()=='VM-0-4-ubuntu' and os.geteuid()==0
os.umask(0o077)
r=pathlib.Path('/srv/vlab-production-mirror/labs/instances/db91-parity')
control=r.parent.parent/'control'
m=json.loads((control/'db91-parity.json').read_text())
assert m['owner']=='codex-db91-production-equivalent-20260908' and m['root']==str(r)
assert json.loads((control/'integration.json').read_text())['owner']==m['owner']
assert subprocess.check_output(['systemctl','show',m['unit'],'-p','MainPID','--value'],text=True).strip()=='0'
snap=r/'tmp/production-snapshot'
assert json.loads((snap/'cloud-transfer-verified.json').read_text())['allSha256Verified']
assert not (r/'tmp/staging-completed.json').exists(), 'Already staged; inspect rather than repeat'
backup=r/'tmp/staging-preimages';backup.mkdir(mode=0o700,exist_ok=False)
report={'at':time.time(),'databaseMutations':{},'preservedPreimages':str(backup)}
meta=json.loads((snap/'manifest.json').read_text())

def preserve_rows(c,table,tag):
    c.row_factory=sqlite3.Row
    rows=[dict(x) for x in c.execute('SELECT * FROM '+table)]
    (backup/(tag+'-'+table+'.json')).write_text(json.dumps(rows))
    return len(rows)

for rec in meta['databases']:
    source=snap/rec['file'];tag=source.stem
    if tag=='global-state':target=r/'state/state/openclaw.sqlite'
    elif tag=='nightshift-state':target=r/'state/nightshift/nightshift.sqlite'
    else:target=r/'state/agents'/tag/'agent/openclaw-agent.sqlite'
    assert source.is_file() and source.stat().st_size==rec['bytes']
    assert not target.exists()
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    # Rename on the data filesystem: do not allocate another 14 GB copy.
    source.rename(target)
    c=sqlite3.connect(target);c.execute('PRAGMA foreign_keys=ON');changes={}
    tables={row[0] for row in c.execute('SELECT name FROM sqlite_master WHERE type=?',('table',))}
    if tag=='global-state':
        for table in ['subagent_runs','gateway_restart_handoff','gateway_restart_intent','gateway_restart_sentinel']:
            if table in tables:
                n=preserve_rows(c,table,tag);c.execute('DELETE FROM '+table);changes[table]=n
        preserve_rows(c,'task_runs',tag)
        changes['task_runs_cancelled']=c.execute("UPDATE task_runs SET status='cancelled',notify_policy='none',delivery_status='skipped',ended_at=? WHERE status IN ('running','queued','pending','paused')",(int(time.time()*1000),)).rowcount
        preserve_rows(c,'delivery_queue_entries',tag)
        changes['delivery_queue_stopped']=c.execute("UPDATE delivery_queue_entries SET status='completed',recovery_state=NULL WHERE status!='completed'").rowcount
        # Rebuild discovery cache from this instance, not old absolute paths.
        preserve_rows(c,'config_machine_state',tag)
        changes['discovery_cache_removed']=c.execute("DELETE FROM config_machine_state WHERE state_key LIKE 'plugins.%'").rowcount
    elif tag!='nightshift-state':
        if 'session_pending_inputs' in tables:
            preserve_rows(c,'session_pending_inputs',tag)
            changes['pending_inputs_cancelled']=c.execute("UPDATE session_pending_inputs SET state='cancelled' WHERE state!='cancelled'").rowcount
        preimages=[]
        for key,raw,status in c.execute('SELECT session_key,entry_json,status FROM session_nodes').fetchall():
            entry=json.loads(raw);new=dict(entry)
            for k in list(new):
                if k.startswith('restartRecovery') or k in ['activeWriterRunId','pendingFinalDelivery','pendingDeliveryNotice','liveModelSwitchPending','subagentRecovery','cronRunContinuation','quotaSuspension']:
                    del new[k]
            if new.get('status') in ['running','queued','pending','paused']:
                new['status']='killed';new['abortedLastRun']=True
            if new!=entry:
                preimages.append({'key':key,'entry_json':raw,'status':status})
                c.execute('UPDATE session_nodes SET entry_json=?, status=? WHERE session_key=?',(json.dumps(new,ensure_ascii=False),'killed' if status=='running' else status,key))
        (backup/(tag+'-session_nodes.json')).write_text(json.dumps(preimages))
        changes['session_recovery_disabled']=len(preimages)
    c.commit()
    assert not c.execute('PRAGMA foreign_key_check').fetchmany(1), 'FK validation failed'
    c.execute('PRAGMA wal_checkpoint(TRUNCATE)');c.close()
    report['databaseMutations'][tag]=changes

profile=json.loads((snap/'production-profile.json').read_text())
cfg=json.loads((r/'state/openclaw.json').read_text())
(backup/'openclaw.json').write_text(json.dumps(cfg))
(backup/'worker-openclaw.json').write_text((r/'state/worker-openclaw.json').read_text())
workspaces={p:str(r/'workspace'/('w'+str(i))) for i,p in enumerate(profile['bootstrap'])}
def rewrite(value):
    if isinstance(value,dict):return {k:rewrite(v) for k,v in value.items()}
    if isinstance(value,list):return [rewrite(v) for v in value]
    if isinstance(value,str):
        for old,new in sorted(workspaces.items(),key=lambda p:-len(p[0])):
            if value==old or value.startswith(old+'/'):return new+value[len(old):]
    return value
cfg['agents']=rewrite(profile['agents'])
for name,a in cfg['agents']['entries'].items():a['agentDir']=str(r/'state/agents'/name/'agent')
for old,items in profile['bootstrap'].items():
    folder=pathlib.Path(workspaces[old]);folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    for name,item in items.items():
        content=item['content']
        if name=='AGENTS.md':content+='\n\nVLAB ISOLATION: This is a production-data test copy. Do not resume old work, contact users or services, send messages, change external state, or act outside this instance. Execute only the current explicitly numbered test request.\n'
        (folder/name).write_text(content)
cfg['session']=profile['session']
worker=rewrite(profile['worker'])
worker['workerConfigPath']=str(r/'state/worker-openclaw.json')
worker['gatewayConfigPath']=str(r/'state/openclaw.json')
cfg['plugins']['entries']['vlab-agent-worker-isolation']['config']=worker
cfg['plugins']['load']['paths']=[p if p!=str(r/'runtime/worker') else str(r/'runtime/production-worker') for p in cfg['plugins']['load']['paths']]
cfg['tools']={'profile':'full','elevated':{'enabled':False}}
cfg['mcp']={'servers':{'universal-memory':{'enabled':False}}}
# Channels/cron/browser remain explicitly disabled from labctl's safe base.
assert cfg['channels']=={} and cfg['cron']['enabled'] is False and cfg['browser']['enabled'] is False
overlay=json.loads(json.dumps(cfg))
def native_models(value):
    if isinstance(value,dict):
        if value.get('agentRuntime',{}).get('id')=='vlab-worker':value['agentRuntime']['id']='openclaw'
        for v in value.values():native_models(v)
    elif isinstance(value,list):
        for v in value:native_models(v)
native_models(overlay['agents'])
overlay['plugins']['allow']=[p for p in overlay['plugins']['allow'] if p!='vlab-agent-worker-isolation']
overlay['plugins']['load']['paths']=[p for p in overlay['plugins']['load']['paths'] if p!=str(r/'runtime/production-worker')]
del overlay['plugins']['entries']['vlab-agent-worker-isolation']
for filename,value in [('openclaw.json',cfg),('worker-openclaw.json',overlay)]:
    (r/'state'/filename).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
env=r/'secrets.env'
with env.open('a') as f:
    f.write('\nOPENCLAW_WORKER_SESSION_AFFINITY_ENABLE=1\nOPENCLAW_DB91_INTEGRITY_ENABLE=1\nOPENCLAW_DB91_INTEGRITY_STATE_ROOT='+str(r/'state')+'\n')
# Quarantine the two verified baseline-only leftovers, never touch production.
for name in ['dist/loader-UHuBXZwI.js.before-context-v2','dist/registry-lookup-MnRZoGSI.js.vlab-native-channel-registry-v1.bak']:
    p=r/'runtime/openclaw'/name
    if p.exists():p.rename(backup/p.name)
user=pwd.getpwnam(m['user'])
for directory in [r/'state',r/'workspace',r/'runtime/production-worker']:
    subprocess.run(['chown','-R',m['user']+':'+m['user'],str(directory)],check=True)
report['differences']=['VLab 4 cores/15 GiB vs production 8 cores/30 GiB','Channels, cron, browser and external-delivery plugins isolated','Static VLab DeepSeek credential; production OAuth not copied','Workspaces contain 31 production bootstrap files but not full skill/media trees','Pre-existing recovery markers disabled; controlled restart fixtures required']
(r/'tmp/staging-completed.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
