"""Remove global authentication material from the private snapshot before export."""
import hashlib
import json
import os
import pathlib
import socket
import sqlite3
import time

assert socket.gethostname() == 'VM-8-2-ubuntu' and os.geteuid() == 0
os.umask(0o077)
root=pathlib.Path('/home/openclaw/.openclaw/backups/db91-production-parity-20260908')
meta=json.loads((root/'manifest.json').read_text())
assert meta.get('sanitizedAt') and not meta.get('exportSealedAt')
p=root/'global-state.sqlite'
d=sqlite3.connect(p)
d.execute('PRAGMA secure_delete=ON')
tables={r[0] for r in d.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
names=['audit_identity_keys','config_revision_keys','device_auth_tokens','device_bootstrap_tokens','device_identities','device_pair_setup_completions','device_pairing_join_codes','device_pairing_paired','device_pairing_pending','gateway_origin_device_tokens','mcp_oauth_stores','secret_store_entries','worker_environment_credentials','channel_pairing_requests','channel_pairing_allow_entries','apns_registrations','web_push_subscriptions']
counts={}
for t in names:
    if t in tables:
        counts[t]=d.execute('SELECT count(*) FROM '+t).fetchone()[0]
        d.execute('DELETE FROM '+t)
counts['config_machine_state.auth']=d.execute("SELECT count(*) FROM config_machine_state WHERE state_key LIKE 'auth.%' OR state_key LIKE 'authProfiles.%'").fetchone()[0]
d.execute("DELETE FROM config_machine_state WHERE state_key LIKE 'auth.%' OR state_key LIKE 'authProfiles.%'")
d.commit();d.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchall();d.close()
h=hashlib.sha256()
with p.open('rb') as f:
    for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
row=next(r for r in meta['databases'] if r['agent']=='global-state')
row['sha256']=h.hexdigest();row['clearedGlobalCredentialTables']=counts
meta['exportSealedAt']=time.time()
meta['exportScope']='9 SQLite snapshots only; known structured authentication stores securely removed. No bot/config credential files. Private conversation/archival content remains authorized test data; not represented as globally secret-free.'
tmp=root/'manifest.sealed.json';tmp.write_text(json.dumps(meta,indent=2));os.replace(tmp,root/'manifest.json')
print(json.dumps({'sealed':True,'count':len(meta['databases']),'bytes':sum(r['bytes'] for r in meta['databases']),'clearedGlobalCredentialTables':counts}),flush=True)
