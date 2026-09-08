"""Private, per-database consistent release backup; no authentication stripping."""
import hashlib, json, os, pathlib, socket, sqlite3, time, sys
assert socket.gethostname() == 'VM-8-2-ubuntu' and os.geteuid() == 0
os.umask(0o077)
state=pathlib.Path('/home/openclaw/.openclaw')
mode=sys.argv[1]; assert mode in ['online','final']
if mode=='final':
    import subprocess
    assert subprocess.check_output(['systemctl','show','openclaw-gateway.service','-p','MainPID','--value'],text=True).strip()=='0'
output=state/'backups/v2026.9.1-db91.1'/('state-'+mode)
output.mkdir(mode=0o700,parents=True,exist_ok=False)
assert os.statvfs(output).f_bavail*os.statvfs(output).f_frsize > 22*1024**3
files=sorted((state/'agents').glob('*/agent/openclaw-agent.sqlite'),key=lambda p:p.stat().st_size)
assert len(files)==7
files += [state/'state/openclaw.sqlite',state/'nightshift/nightshift.sqlite']
meta={'mode':mode,'startedAt':time.time(),'consistency':'stable transaction per database; not cross-database atomic','databases':[],'complete':False}
def save(): (output/'manifest.json').write_text(json.dumps(meta,indent=2))
save()
for src in files:
    relative=str(src.relative_to(state));target=output/relative
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    started=time.monotonic();last=[started-30];last_stopped_check=[started-1]
    source=sqlite3.connect(src.as_uri()+'?mode=ro',uri=True,timeout=3)
    source.execute('BEGIN');source.execute('PRAGMA schema_version').fetchone()
    destination=sqlite3.connect(target)
    def progress(status,remaining,total):
        now=time.monotonic()
        if mode=='final' and now-last_stopped_check[0]>=1:
            last_stopped_check[0]=now
            if subprocess.check_output(['systemctl','show','openclaw-gateway.service','-p','MainPID','--value'],text=True).strip()!='0':
                raise RuntimeError('Gateway restarted during final backup')
        if now-started>900: raise TimeoutError('backup deadline')
        wal=pathlib.Path(str(src)+'-wal')
        if wal.exists() and wal.stat().st_size>2*1024**3: raise RuntimeError('WAL safety boundary')
        if now-last[0]>30:
            print(json.dumps({'backup':mode,'database':relative,'remainingPages':remaining,'totalPages':total}),flush=True);last[0]=now
        if mode=='online': time.sleep(.01)
    try: source.backup(destination,pages=100,progress=progress,sleep=.1)
    finally: destination.close();source.rollback();source.close()
    digest=hashlib.sha256()
    with target.open('rb') as handle:
        for chunk in iter(lambda:handle.read(1024*1024),b''): digest.update(chunk)
    row={'path':relative,'bytes':target.stat().st_size,'sha256':digest.hexdigest(),'seconds':round(time.monotonic()-started,3)}
    meta['databases'].append(row);save();print(json.dumps(row),flush=True)
if mode=='final':
    assert subprocess.check_output(['systemctl','show','openclaw-gateway.service','-p','MainPID','--value'],text=True).strip()=='0'
meta['complete']=True;meta['finishedAt']=time.time();save()
print(json.dumps({'complete':True,'backup':mode,'databases':len(files)}),flush=True)
