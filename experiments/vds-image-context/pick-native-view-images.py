# Pick the largest distinct images that Codex-native view_image put into /vds (deepseek) rollouts.
import json,sys,os,re,glob,time,base64,hashlib,struct
IMG=re.compile(r'data:image/([a-z]+);base64,([A-Za-z0-9+/=]+)')
root=sys.argv[1]; out=sys.argv[2]; N=int(sys.argv[3])
since=time.time()-12*86400
cands={}
for p in glob.glob(root+'/sessions/**/rollout-*.jsonl',recursive=True):
  if os.stat(p).st_mtime<since or os.path.getsize(p)<2_000_000: continue
  prov=None;calls={};lines=open(p,'rb').read().split(b'\n')
  for i,line in enumerate(lines):
    head=line[:400]
    if b'session_meta' in head or b'turn_context' in head:
      try: prov=json.loads(line)['payload'].get('model_provider') or prov
      except: pass
    if b'"function_call"' in head:
      try:
        pl=json.loads(line)['payload']
        if pl.get('type')=='function_call': calls[pl['call_id']]=(pl['name'],pl.get('arguments',''))
      except: pass
    if prov=='deepseek' and b'data:image' in line and b'function_call_output' in head:
      pl=json.loads(line)['payload']; nm=calls.get(pl.get('call_id'),('?',''))
      if nm[0]!='view_image': continue
      for m in IMG.finditer(line.decode()):
        b=m.group(2)
        if len(b)<1_500_000: continue
        h=hashlib.sha1(b[:200000].encode()).hexdigest()[:12]
        if h in cands: continue
        # what the model said right after (to know what it was looking for)
        after=''
        for j in range(i+1,min(i+40,len(lines))):
          if b'"agent_message"' in lines[j][:300] or (b'"role":"assistant"' in lines[j] and b'output_text' in lines[j]):
            try:
              o=json.loads(lines[j]);pl2=o['payload']
              after=pl2.get('message') or ''.join(c.get('text','') for c in pl2.get('content',[]))
            except: pass
            if after: break
        before=''
        for j in range(i-1,max(0,i-200),-1):
          if b'"user_message"' in lines[j][:300]:
            try: before=json.loads(lines[j])['payload'].get('message','')
            except: pass
            break
        cands[h]=dict(h=h,fmt=m.group(1),b64=len(b),rollout=os.path.basename(p),line=i,arg=nm[1][:300],after=after[:600],before=before[:400],data=b)
sel=sorted(cands.values(),key=lambda c:-c['b64'])[:N]
os.makedirs(out,exist_ok=True); os.chmod(out,0o700)
meta=[]
for c in sel:
  raw=base64.b64decode(c.pop('data'))
  fn=f"{c['h']}.{ 'png' if raw[:4]==b'\x89PNG' else 'jpg'}"
  open(os.path.join(out,fn),'wb').write(raw); c['file']=fn; c['bytes']=len(raw)
  if raw[:4]==b'\x89PNG': c['w'],c['h_px']=struct.unpack('>II',raw[16:24])
  meta.append(c)
json.dump(meta,open(os.path.join(out,'meta.json'),'w'),ensure_ascii=False,indent=1)
print(len(cands),'candidates >=1.5MB b64;', 'selected',len(meta),'total',sum(c['bytes'] for c in meta))
for c in meta: print(c['file'],c['bytes'],c.get('w'),c.get('h_px'),c['rollout'][-46:-38],c['arg'][:90].replace('\n',' '))
