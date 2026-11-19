import json,os,time,urllib.request,random
KEY=os.environ["DEEPSEEK_API_KEY"]
rnd=random.Random(20261119)
W=["project","meeting","video","card","budget","sample","schedule","poster","client","review","draft","deadline","logo","booth","shipment","invoice","script","scene","edit","color","music","caption","upload","render","proof","brand","team","plan","route","factory"]
def filler(ntok):
    words=[]; 
    while len(words)<int(ntok*0.78): words.append(rnd.choice(W)+str(rnd.randint(0,999)))
    return " ".join(words)
def call(prefix,q,effort):
    body={"model":"deepseek-flash","input":[{"role":"user","content":"Background log (ignore):\n"+prefix},{"role":"user","content":q}],"stream":True,"reasoning":{"effort":effort},"max_output_tokens":400}
    data=json.dumps(body).encode()
    req=urllib.request.Request("https://api.deepseek.com/v1/responses",data=data,headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
    t0=time.time(); first=None; fr=None; usage=None
    with urllib.request.urlopen(req,timeout=300) as r:
        th=time.time()-t0
        for raw in r:
            line=raw.decode().strip()
            if not line.startswith("data:") or line[5:].strip() in ("","[DONE]"): continue
            d=json.loads(line[5:]); ty=d.get("type","")
            if "reasoning" in ty and "delta" in ty and fr is None: fr=time.time()-t0
            if ty=="response.output_text.delta" and first is None: first=time.time()-t0
            if ty=="response.completed": usage=(d.get("response") or {}).get("usage")
    u=usage or {}
    return dict(bytes=len(data),hdr=round(th,2),firstReason=fr and round(fr,2),firstText=first and round(first,2),inp=u.get("input_tokens"),cached=(u.get("input_tokens_details") or {}).get("cached_tokens"),rt=(u.get("output_tokens_details") or {}).get("reasoning_tokens"))
for n in [100000,300000,600000]:
    p=filler(n)
    for i in range(4):
        r=call(p,"Reply with exactly: OK %d"%i,"none")
        print(json.dumps(dict(size=n,i=i,effort="none",**r)),flush=True)
    r=call(p,"In one sentence, which word appears to be about color?","high")
    print(json.dumps(dict(size=n,i=9,effort="high",**r)),flush=True)
