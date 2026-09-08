"""Bounded, read-only SQLite online snapshots for the authorized VLab rehearsal.

No runtime/config mutations. A read transaction stabilizes each individual DB;
the set is not represented as one cross-database atomic snapshot. Private output
stays on V until streamed directly to VLab. No row contents or credentials logged.
"""
import hashlib
import json
import os
import pathlib
import socket
import sqlite3
import time

assert socket.gethostname() == 'VM-8-2-ubuntu'
assert os.geteuid() == 0
os.umask(0o077)
state = pathlib.Path('/home/openclaw/.openclaw')
output = state / 'backups/db91-production-parity-20260908'
output.mkdir(mode=0o700, exist_ok=False)
assert os.statvfs(output).f_bavail * os.statvfs(output).f_frsize > 25 * 1024**3
cfg = json.loads((state / 'openclaw.json').read_text())
worker = cfg['plugins']['entries']['vlab-agent-worker-isolation']['config']
meta = {
    'startedAt': time.time(), 'host': socket.gethostname(),
    'consistency': 'per-database stable read transaction; not atomic across agents',
    'worker': {k: worker.get(k) for k in ['minWorkers','maxWorkers','sessionsPerWorker','warmSpareWorkers']},
    'defaults': {k: cfg.get('agents',{}).get('defaults',{}).get(k) for k in ['maxConcurrent','subagents']},
    'configSha256': hashlib.sha256((state/'openclaw.json').read_bytes()).hexdigest(),
    'databases': [],
}
def save():
    (output/'manifest.json').write_text(json.dumps(meta, indent=2))
save()
files = sorted((state/'agents').glob('*/agent/openclaw-agent.sqlite'), key=lambda p:p.stat().st_size)
assert len(files) == 7
for src in files:
    agent = src.parent.parent.name
    dst = output / (agent + '.sqlite')
    start = time.monotonic()
    deadline = start + 900
    last_notice = [start - 30]
    source = sqlite3.connect(src.as_uri()+'?mode=ro', uri=True, timeout=2)
    source.execute('BEGIN')
    source.execute('PRAGMA schema_version').fetchone()
    dest = sqlite3.connect(dst)
    def progress(status, remaining, total):
        now = time.monotonic()
        if now > deadline:
            raise TimeoutError('bounded snapshot exceeded 900 seconds')
        wal = pathlib.Path(str(src)+'-wal')
        if wal.exists() and wal.stat().st_size > 2*1024**3:
            raise RuntimeError('source WAL exceeds snapshot safety boundary')
        if now - last_notice[0] >= 30:
            print(json.dumps({'agent':agent,'phase':'backup','remainingPages':remaining,'totalPages':total,'elapsedSeconds':round(now-start)}), flush=True)
            last_notice[0] = now
        # Bound scan pressure (~40 MiB/s at 4 KiB pages before I/O cost).
        time.sleep(0.01)
    try:
        source.backup(dest, pages=100, progress=progress, sleep=0.1)
    finally:
        dest.close()
        source.rollback()
        source.close()
    digest = hashlib.sha256()
    with dst.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''):
            digest.update(chunk)
    record={'agent':agent,'file':dst.name,'bytes':dst.stat().st_size,'sha256':digest.hexdigest(),'elapsedSeconds':round(time.monotonic()-start,3)}
    meta['databases'].append(record)
    save()
    print(json.dumps({'phase':'complete',**record}), flush=True)
meta['completedAt'] = time.time()
save()
print(json.dumps({'phase':'all-complete','count':len(meta['databases']),'bytes':sum(x['bytes'] for x in meta['databases'])}), flush=True)
