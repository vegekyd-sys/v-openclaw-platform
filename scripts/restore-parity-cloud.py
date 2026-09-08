"""VLab receives compressed baselines DIRECTLY from V; stdin is a control token only."""
import json, os, pathlib, re, socket, subprocess, sys, time, urllib.request, urllib.error
assert socket.gethostname()=='VM-0-4-ubuntu' and os.geteuid()==0
root=pathlib.Path('/srv/vlab-production-mirror/labs/instances/db91-parity')
arm=sys.argv[1];assert re.fullmatch('[a-z0-9-]{1,32}',arm)
record=json.loads((root.parent.parent/'control/db91-parity.json').read_text());assert record['owner']=='codex-db91-production-equivalent-20260908'
assert subprocess.check_output(['systemctl','show',record['unit'],'-p','MainPID','--value'],text=True).strip()=='0'
token=sys.stdin.read().strip();assert re.fullmatch('[a-f0-9]{64}',token)
base='http://100.82.39.107:29340';opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def request(endpoint):return opener.open(urllib.request.Request(base+endpoint,headers={'Authorization':'Bearer '+token}),timeout=180)
try:
    try:
        with opener.open(base+'/manifest.json',timeout=10):raise AssertionError('Unauthenticated export must fail')
    except urllib.error.HTTPError as error:assert error.code==403
    print(json.dumps({'unauthenticatedStatus':403,'transport':'V to VLab directly over Tailscale'}),flush=True)
    local=json.loads((root/'tmp/production-snapshot/manifest.json').read_text())
    with request('/manifest.json') as response:remote=json.load(response)
    assert remote['databases']==local['databases'] and remote['exportSealedAt']==local['exportSealedAt']
    for row in local['databases']:
        started=time.time();tag=pathlib.Path(row['file']).stem
        decompress=subprocess.Popen(['zstd','-q','-d','-c'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        restore=subprocess.Popen(['/opt/vlab/node-v22.23.1-linux-x64/bin/node',str(root/'source/scripts/restore-parity-database.mjs'),arm,tag],stdin=decompress.stdout,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        decompress.stdout.close()
        try:
            with request('/'+row['file']+'.zst') as response:
                while chunk:=response.read(1024*1024):decompress.stdin.write(chunk)
            decompress.stdin.close()
            assert decompress.wait(timeout=60)==0,'Compressed frame failed verification'
            output,error=restore.communicate(timeout=120)
            assert restore.returncode==0,error.decode()[-2000:]
            print(output.decode().strip(),flush=True)
            print(json.dumps({'restored':tag,'seconds':round(time.time()-started,2)}),flush=True)
        finally:
            for process in [decompress,restore]:
                if process.poll() is None:process.terminate();process.wait(timeout=15)
    subprocess.run(['python3',str(root/'source/scripts/normalize-parity-restored-state.py'),arm],check=True)
    print(json.dumps({'complete':True,'databases':9,'allSealedHashesVerified':True,'localBulkRelay':False}),flush=True)
finally:
    try:
        req=urllib.request.Request(base+'/shutdown',headers={'Authorization':'Bearer '+token},method='POST')
        with opener.open(req,timeout=20) as response:assert response.status==204
        print(json.dumps({'exportServerShutdownRequested':True}),flush=True)
    except Exception as error:print(json.dumps({'shutdownError':type(error).__name__,'serverHasOneHourExpiry':True}),flush=True)
