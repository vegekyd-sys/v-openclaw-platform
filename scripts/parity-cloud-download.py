"""Run on VLab: all artifact bytes travel directly from V over Tailscale."""
import hashlib
import json
import os
import pathlib
import socket
import subprocess
import time
import urllib.request

assert socket.gethostname()=='VM-0-4-ubuntu' and os.geteuid()==0
os.umask(0o077)
root=pathlib.Path('/srv/vlab-production-mirror/labs/instances/db91-parity')
record=json.loads(pathlib.Path('/srv/vlab-production-mirror/labs/control/db91-parity.json').read_text())
assert record['owner']=='codex-db91-production-equivalent-20260908' and record['root']==str(root)
assert subprocess.check_output(['systemctl','show',record['unit'],'-p','MainPID','--value'],text=True).strip()=='0'
tokenfile=root/'tmp/cloud-transfer-token'
token=tokenfile.read_text().strip();assert len(token)==64
folder=root/'tmp/production-snapshot'
assert folder.is_dir()
base='http://100.82.39.107:29340'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def request(endpoint,offset=0):
    headers={'Authorization':'Bearer '+token}
    if offset:headers['Range']=f'bytes={offset}-'
    return opener.open(urllib.request.Request(base+endpoint,headers=headers),timeout=180)
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
    return h.hexdigest()
def download(endpoint,p,size=None,digest=None):
    if p.exists() and size is not None and p.stat().st_size==size and sha(p)==digest:
        print(json.dumps({'file':p.name,'verifiedExisting':True}),flush=True);return
    part=pathlib.Path(str(p)+'.cloud-part')
    if size is not None and p.exists() and p.stat().st_size<size and not part.exists():p.rename(part)
    offset=part.stat().st_size if part.exists() and size is not None else 0
    assert size is None or offset<size
    begin=time.time();last=begin
    with request(endpoint,offset) as response,part.open('ab' if offset else 'wb') as out:
        if offset:assert response.status==206
        total=offset
        while chunk:=response.read(1024*1024):
            out.write(chunk);total+=len(chunk)
            if time.time()-last>=10:
                print(json.dumps({'file':p.name,'receivedBytes':total,'expectedBytes':size,'MiBps':round((total-offset)/1024**2/(time.time()-begin),2)}),flush=True);last=time.time()
    if size is not None:assert part.stat().st_size==size and sha(part)==digest
    part.replace(p)
    print(json.dumps({'file':p.name,'bytes':p.stat().st_size,'seconds':round(time.time()-begin,2),'verified':digest is not None}),flush=True)
with request('/manifest.json') as r:manifest=json.load(r)
assert manifest.get('exportSealedAt') and len(manifest['databases'])==9
(folder/'manifest.json').write_text(json.dumps(manifest,indent=2))
with request('/runtime-manifest.json') as r:runtime_manifest=json.load(r)
(folder/'runtime-manifest.json').write_text(json.dumps(runtime_manifest))
for endpoint,destination in [('/core.tar.zst',root/'runtime/openclaw'),('/worker.tar.zst',root/'runtime/production-worker')]:
    archive=root/'tmp'/endpoint[1:]
    download(endpoint,archive)
    subprocess.run(['tar','-I','unzstd','-xf',str(archive),'-C',str(destination)],check=True)
    for item in runtime_manifest[endpoint]:
        p=destination/item['path']
        assert '..' not in pathlib.PurePosixPath(item['path']).parts and not pathlib.PurePosixPath(item['path']).is_absolute()
        if 'link' in item:assert p.is_symlink() and os.readlink(p)==item['link']
        else:assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256']
    print(json.dumps({'runtime':endpoint,'verifiedFiles':len(runtime_manifest[endpoint])}),flush=True)
    archive.unlink()
for row in manifest['databases']:
    assert pathlib.PurePosixPath(row['file']).name==row['file']
    download('/'+row['file'],folder/row['file'],row['bytes'],row['sha256'])
subprocess.run(['chown','-R',record['user']+':'+record['user'],str(root/'runtime'),str(folder)],check=True)
(folder/'cloud-transfer-verified.json').write_text(json.dumps({'at':time.time(),'files':9,'bytes':sum(r['bytes'] for r in manifest['databases']),'allSha256Verified':True,'transport':'V to VLab directly over Tailscale; local computer is control plane only'}))
req=urllib.request.Request(base+'/shutdown',headers={'Authorization':'Bearer '+token},method='POST')
with opener.open(req,timeout=30) as response:assert response.status==204
tokenfile.unlink()
print(json.dumps({'complete':True,'exportServerShutdownRequested':True}),flush=True)
