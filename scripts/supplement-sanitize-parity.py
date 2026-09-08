"""Prepare only the private export snapshot; never mutate production databases."""
import hashlib
import json
import os
import pathlib
import socket
import sqlite3
import time

assert socket.gethostname() == 'VM-8-2-ubuntu' and os.geteuid() == 0
os.umask(0o077)
state = pathlib.Path('/home/openclaw/.openclaw')
root = state/'backups/db91-production-parity-20260908'
meta = json.loads((root/'manifest.json').read_text())
assert 'completedAt' in meta and len(meta['databases']) == 7
assert not meta.get('sanitizedAt')
for name, src in [('global-state',state/'state/openclaw.sqlite'),('nightshift-state',state/'nightshift/nightshift.sqlite')]:
    dst = root/(name+'.sqlite')
    if not dst.exists():
        a = sqlite3.connect(src.as_uri()+'?mode=ro',uri=True,timeout=2)
        a.execute('BEGIN');a.execute('PRAGMA schema_version').fetchone()
        b = sqlite3.connect(dst)
        try:
            a.backup(b,pages=100,progress=lambda *args:time.sleep(0.01),sleep=0.1)
        finally:
            b.close();a.rollback();a.close()
    else:
        # The prior guarded invocation finished these two backups before aborting.
        b = sqlite3.connect(dst.as_uri()+'?mode=ro',uri=True)
        assert b.execute('PRAGMA quick_check').fetchall() == [('ok',)]
        b.close()
    meta['databases'].append({'agent':name,'file':dst.name,'bytes':dst.stat().st_size})
    print(json.dumps({'phase':'supplemented','name':name,'bytes':dst.stat().st_size}),flush=True)
for row in meta['databases']:
    p = root/row['file']
    assert p.resolve().parent == root.resolve() and p.is_file()
    d = sqlite3.connect(p)
    tables = {x[0] for x in d.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
    counts = {}
    d.execute('PRAGMA secure_delete=ON')
    for table in ['auth_profile_state','auth_profile_store']:
        if table in tables:
            counts[table]=d.execute('SELECT count(*) FROM '+table).fetchone()[0]
            d.execute('DELETE FROM '+table)
    d.commit()
    d.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchall()
    d.close()
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    row['preSanitizeSha256']=row.pop('sha256',None)
    row['sha256']=h.hexdigest()
    row['bytes']=p.stat().st_size
    row['clearedCredentialTables']=counts
    if row['agent'].endswith('-state'):
        row['tableNames']=sorted(tables)
    print(json.dumps({'phase':'sanitized','agent':row['agent'],'bytes':row['bytes'],'clearedCredentialTables':counts, 'tableNames':row.get('tableNames',[])}),flush=True)
meta['sanitizedAt']=time.time()
meta['sanitization']='secure-delete known auth_profile_state/store in export only; no config/credential files exported; conversation content not redacted'
temporary=root/'manifest.sanitized.json'
temporary.write_text(json.dumps(meta,indent=2))
os.replace(temporary,root/'manifest.json')
print(json.dumps({'phase':'all-sanitized','count':len(meta['databases']),'bytes':sum(r['bytes'] for r in meta['databases'])}),flush=True)
