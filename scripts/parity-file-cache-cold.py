"""Evict only stopped owned database copies, never the host-wide page cache."""
import pathlib,os,json,socket,subprocess,time
assert socket.gethostname()=='VM-0-4-ubuntu' and os.geteuid()==0
root=pathlib.Path('/srv/vlab-production-mirror/labs/instances/db91-parity')
assert subprocess.check_output(['systemctl','show','openclaw-lab-db91-parity.service','-p','MainPID','--value'],text=True).strip()=='0'
files=sorted((root/'state/agents').glob('*/agent/openclaw-agent.sqlite'))
files+=[root/'state/state/openclaw.sqlite',root/'state/nightshift/nightshift.sqlite']
assert len(files)==9 and all(p.is_file() and p.resolve()==p for p in files)
paths={str(p) for p in files}
for proc in pathlib.Path('/proc').iterdir():
    if not proc.name.isdigit():continue
    try:
        for fd in (proc/'fd').iterdir():
            try:target=str(fd.readlink())
            except FileNotFoundError:continue
            assert target not in paths and not any(target==p+s for p in paths for s in ['-wal','-shm']), 'An active process still owns a target database'
    except (FileNotFoundError,ProcessLookupError):pass
before=subprocess.check_output(['fincore','--bytes','--output','FILE,SIZE,RES,PAGES',*map(str,files)],text=True)
for file in files:
    fd=os.open(file,os.O_RDONLY|os.O_NOFOLLOW)
    try:os.fsync(fd);os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)
    finally:os.close(fd)
after=subprocess.check_output(['fincore','--bytes','--output','FILE,SIZE,RES,PAGES',*map(str,files)],text=True)
report={'at':time.time(),'scope':'only-nine-owned-database-files','before':before,'after':after,'hostDropCachesUsed':False}
out=root/'tmp'/('file-cache-cold-'+str(int(time.time()*1000))+'.json');out.write_text(json.dumps(report))
print(json.dumps(report))
