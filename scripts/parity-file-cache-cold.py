"""Evict only stopped owned database copies, never the host-wide page cache."""
import pathlib,os,json,socket,subprocess,time,ctypes,mmap
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
def residency():
    # Same kernel mincore observation used by fincore, without installing a
    # host package. Mapping alone does not read or fault database pages in.
    libc=ctypes.CDLL(None,use_errno=True)
    libc.mmap.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_longlong]
    libc.mmap.restype=ctypes.c_void_p
    libc.mincore.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p]
    libc.munmap.argtypes=[ctypes.c_void_p,ctypes.c_size_t]
    result=[];page=os.sysconf('SC_PAGE_SIZE')
    for file in files:
        size=file.stat().st_size;count=(size+page-1)//page
        fd=os.open(file,os.O_RDONLY|os.O_NOFOLLOW)
        ptr=libc.mmap(None,size,mmap.PROT_READ,mmap.MAP_SHARED,fd,0)
        try:
            assert ptr!=ctypes.c_void_p(-1).value, 'mmap failed'
            vector=(ctypes.c_ubyte*count)()
            assert libc.mincore(ptr,size,vector)==0, 'mincore failed'
            result.append({'file':str(file.relative_to(root)),'bytes':size,'pages':count,'residentPages':sum(v&1 for v in vector)})
        finally:
            if ptr!=ctypes.c_void_p(-1).value:libc.munmap(ptr,size)
            os.close(fd)
    return result
before=residency()
for file in files:
    fd=os.open(file,os.O_RDONLY|os.O_NOFOLLOW)
    try:os.fsync(fd);os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)
    finally:os.close(fd)
after=residency()
assert all(x['residentPages']==0 for x in after), 'Cold-file precondition not achieved'
report={'at':time.time(),'scope':'only-nine-owned-database-files','before':before,'after':after,'hostDropCachesUsed':False}
out=root/'tmp'/('file-cache-cold-'+str(int(time.time()*1000))+'.json');out.write_text(json.dumps(report))
print(json.dumps(report))
