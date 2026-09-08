"""Repeat the original snapshot's isolation edits, never resume copied business."""
import pathlib, os, socket, json, sqlite3, subprocess, time, sys, re
assert socket.gethostname() == 'VM-0-4-ubuntu' and os.geteuid() == 0
os.umask(0o077)
root = pathlib.Path('/srv/vlab-production-mirror/labs/instances/db91-parity')
arm = sys.argv[1]; assert re.fullmatch('[a-z0-9-]{1,32}', arm)
meta = json.loads((root.parent.parent/'control/db91-parity.json').read_text())
assert meta['owner'] == 'codex-db91-production-equivalent-20260908'
assert subprocess.check_output(['systemctl','show',meta['unit'],'-p','MainPID','--value'],text=True).strip() == '0'
audit = root/('tmp/baseline-restore-'+arm)
assert not (audit/'normalized.json').exists()
manifest=json.loads((root/'tmp/production-snapshot/manifest.json').read_text())
for record in manifest['databases']:
    proof=json.loads((audit/(pathlib.Path(record['file']).stem+'.json')).read_text())
    assert proof['complete'] and proof['sourceSha256']==record['sha256']
changes={}
for record in manifest['databases']:
    tag=pathlib.Path(record['file']).stem
    target=root/('state/state/openclaw.sqlite' if tag=='global-state' else 'state/nightshift/nightshift.sqlite' if tag=='nightshift-state' else 'state/agents/'+tag+'/agent/openclaw-agent.sqlite')
    con=sqlite3.connect(target);con.execute('PRAGMA foreign_keys=ON');counts={}
    if tag=='global-state':
        for table in ['subagent_runs','gateway_restart_handoff','gateway_restart_intent','gateway_restart_sentinel']:
            counts[table]=con.execute('DELETE FROM '+table).rowcount
        counts['tasks']=con.execute("UPDATE task_runs SET status='cancelled',notify_policy='silent',delivery_status='not_applicable',ended_at=? WHERE status IN ('running','queued')",(int(time.time()*1000),)).rowcount
        counts['delivery']=con.execute("UPDATE delivery_queue_entries SET status='completed',recovery_state=NULL WHERE status!='completed'").rowcount
        counts['discovery']=con.execute("DELETE FROM config_machine_state WHERE state_key LIKE 'plugins.%'").rowcount
    elif tag!='nightshift-state':
        counts['pending']=con.execute("UPDATE session_pending_inputs SET state='cancelled' WHERE state!='cancelled'").rowcount
        counts['recovery']=0
        for key,raw,status in con.execute('SELECT session_key,entry_json,status FROM session_nodes').fetchall():
            entry=json.loads(raw);new=dict(entry)
            for k in list(new):
                if k.startswith('restartRecovery') or k in ['activeWriterRunId','pendingFinalDelivery','pendingDeliveryNotice','liveModelSwitchPending','subagentRecovery','cronRunContinuation','quotaSuspension']:
                    del new[k]
            if new.get('status') in ['running','queued','pending','paused']:
                new['status']='killed';new['abortedLastRun']=True
            if new!=entry:
                con.execute('UPDATE session_nodes SET entry_json=?,status=? WHERE session_key=?',(json.dumps(new,ensure_ascii=False),'killed' if status=='running' else status,key));counts['recovery']+=1
    con.commit();assert not con.execute('PRAGMA foreign_key_check').fetchmany(1)
    con.execute('PRAGMA wal_checkpoint(TRUNCATE)');con.close();changes[tag]=counts
(audit/'normalized.json').write_text(json.dumps({'at':time.time(),'changes':changes,'originalBusinessDisabled':True},indent=2))
print(json.dumps({'normalized':True,'databases':len(changes),'fullNativePreflightStillRequired':True}))
