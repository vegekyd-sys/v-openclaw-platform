import json,sys,os,re,glob,time,base64,struct
IMG=re.compile(r'data:image/([a-z]+);base64,([A-Za-z0-9+/=]+)')
def dims(fmt,b64):
  raw=base64.b64decode(b64[:400000]+'='*(-len(b64[:400000])%4))
  if raw[:8]==b'\x89PNG\r\n\x1a\n': return struct.unpack('>II',raw[16:24])
  if raw[:2]==b'\xff\xd8':
    i=2
    while i<len(raw)-9:
      if raw[i]!=0xff: i+=1; continue
      m=raw[i+1]
      if m in (0xc0,0xc1,0xc2):
        h,w=struct.unpack('>HH',raw[i+5:i+9]); return (w,h)
      L=struct.unpack('>H',raw[i+2:i+4])[0]; i+=2+L
  return (0,0)
since=time.time()-12*86400
out=[]
for root in sys.argv[1:]:
  for p in glob.glob(root+'/sessions/**/rollout-*.jsonl',recursive=True):
    if os.stat(p).st_mtime<since: continue
    if os.path.getsize(p)<200000: continue
    prov=None;calls={};pending_exec={}
    with open(p,'rb') as f:
      for line in f:
        head=line[:400]
        if b'session_meta' in head or b'turn_context' in head:
          try:
            pl=json.loads(line)['payload']; prov=pl.get('model_provider') or prov
          except: pass
        if b'"function_call"' in head or b'"custom_tool_call"' in head:
          try:
            pl=json.loads(line)['payload']
            if pl.get('type') in('function_call','custom_tool_call'):
              inp=pl.get('arguments') or pl.get('input') or ''
              calls[pl.get('call_id')]=(pl.get('name'),inp[:300])
          except: pass
        if b'data:image' in line:
          o=json.loads(line); pl=o.get('payload',{})
          t=pl.get('type'); cid=pl.get('call_id'); nm=calls.get(cid,('?',''))
          s=line.decode()
          for m in IMG.finditer(s):
            w,h=dims(m.group(1),m.group(2))
            # detail
            i=s.find('"detail"',m.end()); det=s[i+10:i+18] if i>0 and i-m.end()<40 else ''
            hint=''
            if 'view_image' in nm[1] or nm[0]=='view_image': hint='view_image'
            out.append([prov,os.path.basename(p)[-42:-34],t,nm[0],hint,m.group(1),w,h,len(m.group(2)),det.strip('": ,')])
print(json.dumps(out))
