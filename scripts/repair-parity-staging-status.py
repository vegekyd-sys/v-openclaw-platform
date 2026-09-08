"""Correct the owned staging script's terminal status, without replaying tasks."""
import json,pathlib,sqlite3,socket,os,subprocess
assert socket.gethostname()=='VM-0-4-ubuntu' and os.geteuid()==0
root=pathlib.Path('/srv/vlab-production-mirror/labs/instances/db91-parity')
assert subprocess.check_output(['systemctl','show','openclaw-lab-db91-parity.service','-p','MainPID','--value'],text=True).strip()=='0'
assert (root/'tmp/staging-completed.json').exists()
report={}
for file in (root/'state/agents').glob('*/agent/openclaw-agent.sqlite'):
    c=sqlite3.connect(file)
    changes=0
    for key,raw,status in c.execute('SELECT session_key,entry_json,status FROM session_nodes').fetchall():
        entry=json.loads(raw)
        if entry.get('status')!='aborted':continue
        assert status=='running' and entry.get('abortedLastRun') is True
        entry['status']='killed'
        c.execute('UPDATE session_nodes SET entry_json=?,status=? WHERE session_key=?',(json.dumps(entry,ensure_ascii=False),'killed',key))
        changes+=1
    c.commit();c.execute('PRAGMA wal_checkpoint(TRUNCATE)');c.close()
    report[file.parent.parent.name]=changes
(root/'tmp/staging-status-correction.json').write_text(json.dumps(report))
print(json.dumps(report))
