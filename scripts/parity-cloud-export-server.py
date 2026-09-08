"""Temporary, authenticated, Tailscale-only export of this task's sealed files."""
import hashlib
import hmac
import http.server
import json
import os
import pathlib
import secrets
import socket
import subprocess
import threading
import time

assert socket.gethostname() == 'VM-8-2-ubuntu' and os.geteuid() == 0
os.umask(0o077)
root=pathlib.Path('/home/openclaw/.openclaw/backups/db91-production-parity-20260908')
meta=json.loads((root/'manifest.json').read_text())
assert meta.get('exportSealedAt') and len(meta['databases'])==9
files={'/manifest.json':root/'manifest.json'}
files.update({'/'+r['file']:root/r['file'] for r in meta['databases']})
code={'/core.tar.zst':pathlib.Path('/opt/openclaw-2026.9.1-v/openclaw'),'/worker.tar.zst':pathlib.Path('/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.11-steer91')}
token=secrets.token_hex(32)
tokenfile=root/'transfer-token'
with tokenfile.open('x') as f:f.write(token)
started=time.time()

def code_manifest():
    result={}
    for key,folder in code.items():
        records=[]
        for directory,dirs,names in os.walk(folder,followlinks=False):
            for name in sorted(names+dirs):
                p=pathlib.Path(directory)/name
                rel=str(p.relative_to(folder))
                if p.is_symlink():records.append({'path':rel,'link':os.readlink(p)})
                elif p.is_file():
                    h=hashlib.sha256()
                    with p.open('rb') as f:
                        for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
                    records.append({'path':rel,'bytes':p.stat().st_size,'sha256':h.hexdigest()})
        result[key]=records
    return json.dumps(result).encode()

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def allowed(self):
        return self.client_address[0]=='100.75.190.64' and hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token)
    def do_POST(self):
        if not self.allowed() or self.path!='/shutdown':self.send_error(403);return
        self.send_response(204);self.end_headers()
        threading.Thread(target=self.server.shutdown,daemon=True).start()
    def do_GET(self):
        if not self.allowed():self.send_error(403);return
        if self.path=='/runtime-manifest.json':
            data=code_manifest();self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
        if self.path in code:
            proc=subprocess.Popen(['nice','-n','15','tar','-C',str(code[self.path]),'-I','zstd -T1 -1','-cf','-','.'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            self.send_response(200);self.send_header('Content-Type','application/zstd');self.end_headers()
            try:
                while chunk:=proc.stdout.read(1024*1024):self.wfile.write(chunk)
            finally:
                proc.stdout.close()
                if proc.poll() is None:proc.terminate()
                proc.wait()
            return
        p=files.get(self.path)
        if p is None:self.send_error(404);return
        size=p.stat().st_size;start=0
        requested=self.headers.get('Range')
        if requested:
            if not requested.startswith('bytes=') or not requested.endswith('-') or not requested[6:-1].isdigit():self.send_error(416);return
            start=int(requested[6:-1])
            if start>=size:self.send_error(416);return
        self.send_response(206 if start else 200)
        self.send_header('Content-Type','application/octet-stream')
        self.send_header('Content-Length',str(size-start))
        if start:self.send_header('Content-Range',f'bytes {start}-{size-1}/{size}')
        self.end_headers()
        with p.open('rb') as f:self.connection.sendfile(f,offset=start,count=size-start)

server=http.server.ThreadingHTTPServer(('100.82.39.107',29340),Handler)
timer=threading.Timer(3600,server.shutdown);timer.daemon=True;timer.start()
print(json.dumps({'ready':True,'bind':'100.82.39.107:29340','allowedPeer':'100.75.190.64','ttlSeconds':3600,'exports':len(files),'runtimeArchives':2}),flush=True)
try:server.serve_forever(poll_interval=0.5)
finally:
    timer.cancel();server.server_close();tokenfile.unlink(missing_ok=True)
    print(json.dumps({'closed':True,'elapsedSeconds':round(time.time()-started)}),flush=True)
