import json,sys,os,re,glob,time
IMG=re.compile(r'data:image/([a-z]+);base64,([A-Za-z0-9+/=]+)')
roots=sys.argv[1:]
since=time.time()-12*86400
rows=[]
for root in roots:
  for p in glob.glob(root+'/sessions/**/rollout-*.jsonl',recursive=True):
    st=os.stat(p)
    if st.st_mtime<since: continue
    prov=set();models=set();imgs=[];comp=0;last_comp_off=0;off=0;img_after=0;img_after_n=0;repl_img=0
    srcs={}
    with open(p,'rb') as f:
      for line in f:
        L=len(line)
        if b'"session_meta"' in line[:300] or b'"turn_context"' in line[:300]:
          try:
            o=json.loads(line);pl=o.get('payload',{})
            if pl.get('model_provider'):prov.add(pl['model_provider'])
            if pl.get('model'):models.add(pl['model'])
          except Exception:pass
        if b'"type":"compacted"' in line[:200] or b'"type": "compacted"' in line[:200]:
          comp+=1;last_comp_off=off;img_after=0;img_after_n=0
          repl_img=sum(len(m.group(2)) for m in IMG.finditer(line.decode('utf-8','ignore')))
        if b'data:image' in line:
          s=line.decode('utf-8','ignore')
          typ=None
          try: typ=json.loads(s)['payload'].get('type')
          except Exception: pass
          for m in IMG.finditer(s):
            b=len(m.group(2)); imgs.append((m.group(1),b,typ))
            img_after+=b; img_after_n+=1
        off+=L
    rows.append(dict(f=os.path.basename(p)[8:60],root=root.split('/')[5],size=st.st_size,prov=','.join(sorted(prov)),model=','.join(sorted(models))[:40],
      n=len(imgs),imgB=sum(b for _,b,_ in imgs),maxB=max([b for _,b,_ in imgs],default=0),fmts=','.join(sorted(set(t for t,_,_ in imgs))),
      kinds=','.join(sorted(set(str(k) for _,_,k in imgs))),comp=comp,winB=off-last_comp_off,imgWinB=img_after,imgWinN=img_after_n,replImg=repl_img))
rows.sort(key=lambda r:-r['imgB'])
print(json.dumps(rows))
