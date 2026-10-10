import json,sys,os,glob,time,datetime,re
IMG=re.compile(rb'data:image/[a-z]+;base64,[A-Za-z0-9+/=]+')
MODEL={'reasoning','function_call','custom_tool_call','local_shell_call'}
def ts(s):
  return datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
since=time.time()-float(sys.argv[1])*86400
out=[]
for root in sys.argv[2:]:
  for p in glob.glob(root+'/sessions/**/rollout-*.jsonl',recursive=True):
    if os.stat(p).st_mtime<since: continue
    prov=None;cum=0;prev_model=True;last_in_ts=None;imgs=0;imgB=0
    with open(p,'rb') as f:
      for line in f:
        head=line[:300]
        if b'"session_meta"' in head or b'"turn_context"' in head:
          try:
            pl=json.loads(line)['payload'];prov=pl.get('model_provider') or prov
          except: pass
          continue
        if b'"compacted"' in head:
          cum=len(line);imgs=line.count(b'data:image');imgB=sum(len(m) for m in IMG.findall(line));prev_model=False;continue
        if b'"response_item"' not in head: continue
        try: o=json.loads(line)
        except: continue
        pl=o['payload'];t=pl.get('type')
        is_model = t in MODEL or (t=='message' and pl.get('role')=='assistant')
        T=ts(o['timestamp'])
        if is_model and not prev_model and T>=since:
          out.append([prov,os.path.basename(p)[-42:-34],round(T),cum,imgs,round(T-last_in_ts,2) if last_in_ts else None,imgB])
        if not is_model: last_in_ts=T
        prev_model=is_model
        cum+=len(line); imgs+=line.count(b'data:image')
        if b'data:image' in line: imgB+=sum(len(m) for m in IMG.findall(line))
print(json.dumps(out))
