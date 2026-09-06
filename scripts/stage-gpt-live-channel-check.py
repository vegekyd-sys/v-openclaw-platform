"""Owner-guarded, reversible GPT Live channel check on shared VLab only."""
import hashlib, json, os, pathlib, pwd, shutil, subprocess, sys
R=pathlib.Path('/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902')
OWNER='01a074fd-0a5f-7c02-b86a-10dbed7c4eb4'
assert subprocess.check_output(['hostname'],text=True).strip()=='VM-0-4-ubuntu'
assert json.loads(pathlib.Path('/srv/vlab-production-mirror/labs/control/integration.json').read_text())['owner']==OWNER
cfgpath=R/'state/openclaw.json'
c=json.loads(cfgpath.read_text())
assert c['gateway']['port']==24993
backup=R/'state/gpt-live-channel-check-20260906'
old=R/'runtime/plugins/worker-image-provenance-5f9e136'
new=R/'runtime/plugins/worker-gpt-live-2368bdb'
uid=pwd.getpwnam('vlab').pw_uid
gid=pwd.getpwnam('vlab').pw_gid
def write_config(value):
    p=cfgpath.with_name('gpt-live-config-pending.json')
    with p.open('x') as f:json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')
    os.chmod(p,0o600);os.chown(p,uid,gid);p.replace(cfgpath)
mode=sys.argv[1]
if mode=='stage':
    assert c['plugins']['load']['paths'].count(str(old))==1
    assert c['gateway']['reload']['mode']=='off'
    assert json.loads((R/'runtime/npm-global/lib/node_modules/openclaw/package.json').read_text())['version']=='2026.9.1'
    assert hashlib.sha256((old/'native-harness-data.mjs').read_bytes()).hexdigest()=='3e0b35195ed9652b5a2dac829ef3a67a4dcdddb915c0de50d27a5f08bff095ca'
    assert hashlib.sha256((old/'index.mjs').read_bytes()).hexdigest()=='1781be047a398732b217db3174706ba73fcb08e1f341f98330754ccf7567d36f'
    archive=pathlib.Path('/srv/vlab-production-mirror/labs/instances/gpt-live91/tmp/worker-2368bdb.tar')
    assert hashlib.sha256(archive.read_bytes()).hexdigest()=='9a6fe93a8cc150846ca2a98e2be59b3103406341ea40d928b6f39034271ea06a'
    backup.mkdir(mode=0o700)
    shutil.copy2(cfgpath,backup/'original-openclaw.json')
    (backup/'unit.before.txt').write_bytes(subprocess.check_output(['systemctl','cat','openclaw-vlab-production-mirror-v8.service']))
    os.chmod(backup/'unit.before.txt',0o600)
    new.mkdir()
    subprocess.run(['tar','-xf',str(archive),'-C',str(new),'--strip-components=2'],check=True)
    for base,dirs,files in os.walk(new):
        os.chown(base,uid,gid)
        for f in files:os.chown(pathlib.Path(base)/f,uid,gid)
    assert hashlib.sha256((new/'native-harness-data.mjs').read_bytes()).hexdigest()==hashlib.sha256((old/'native-harness-data.mjs').read_bytes()).hexdigest()
    c['plugins']['load']['paths']=[str(new) if p==str(old) else p for p in c['plugins']['load']['paths']]
    # Keep reload off until the candidate is loaded with one explicit restart.
    # Changing load.paths and enabling reload together makes native 9.1 exit;
    # a clean exit removes the transient unit before restart can reach it.
    staged=backup/'candidate-openclaw.json'
    staged.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n');os.chmod(staged,0o600)
    pid=subprocess.check_output(['systemctl','show','openclaw-vlab-production-mirror-v8.service','-p','MainPID','--value'],text=True).strip()
    env=dict(item.split('=',1) for item in pathlib.Path('/proc/'+pid+'/environ').read_text().split('\0') if '=' in item)
    env['OPENCLAW_CONFIG_PATH']=str(staged)
    result=subprocess.run(['/opt/vlab/node-v22.23.1-linux-x64/bin/node',str(R/'runtime/npm-global/lib/node_modules/openclaw/dist/index.js'),'config','validate'],env=env,capture_output=True,text=True)
    if result.returncode:raise RuntimeError('Candidate config validation failed; live config untouched')
    write_config(c)
elif mode=='arm':
    assert str(new) in c['plugins']['load']['paths']
    assert c['gateway']['reload']['mode']=='off'
    c['gateway']['reload']['mode']='hybrid'
    write_config(c)
elif mode=='enable':
    assert str(new) in c['plugins']['load']['paths']
    assert c['talk']['realtime']['provider'] in ('google','openai')
    c['talk']['realtime'].update(provider='openai',model='gpt-live-1-codex',speakerVoice='spruce',transport='webrtc')
    c['talk']['realtime'].setdefault('providers',{}).setdefault('openai',{}).update(model='gpt-live-1-codex',speakerVoice='spruce',transport='webrtc')
    write_config(c)
elif mode=='restore-talk':
    assert str(new) in c['plugins']['load']['paths']
    assert c['talk']['realtime']['provider']=='openai'
    original=json.loads((backup/'original-openclaw.json').read_text())
    if 'talk' in original:c['talk']=original['talk']
    else:c.pop('talk',None)
    write_config(c)
elif mode=='finish':
    original=json.loads((backup/'original-openclaw.json').read_text())
    assert c.get('talk')==original.get('talk')
    c['gateway']['reload']=original['gateway']['reload']
    write_config(c)
else:raise ValueError(mode)
print(json.dumps({'phase':mode,'workerCommit':'2368bdbfae2e869d0966e4a27d84e004a1291536','workerPath':str(new),'backup':str(backup)}))
