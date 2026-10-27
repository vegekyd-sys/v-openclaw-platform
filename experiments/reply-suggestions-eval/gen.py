import json, sys, time, urllib.request, concurrent.futures as cf, re, os
sys.path.insert(0, os.path.dirname(__file__))
from prompts import NAIVE, DESIGNED, DESIGNED_V2
cfg=json.load(open("/home/openclaw/.openclaw/openclaw.json"))
P=cfg["models"]["providers"]
def call(provider, model, system, user, extra=None, timeout=120):
    p=P[provider]; url=p["baseUrl"].rstrip("/")+"/chat/completions"
    body={"model":model,"messages":[{"role":"system","content":system},{"role":"user","content":user}],"max_tokens":4000}
    body.update(extra or {})
    if provider=="azure-openai": body.pop("max_tokens",None)
    h={"Content-Type":"application/json"}
    key=p.get("apiKey")
    if not key:
        envname={"xai":"XAI_API_KEY"}.get(provider)
        for line in open("/home/openclaw/.openclaw/.env"):
            if envname and line.startswith(envname+"="): key=line.split("=",1)[1].strip().strip('"')
    if p.get("auth")=="api-key": h["api-key"]=key
    else: h["Authorization"]="Bearer "+key
    req=urllib.request.Request(url, data=json.dumps(body).encode(), headers=h)
    t=time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r: d=json.load(r)
    return time.time()-t, d
def clip(s,n):
    s=s or ""
    return s if len(s)<=n else s[:n*2//3]+"\n…（中间省略）…\n"+s[-n//3:]
def ctx(x, full):
    out=[f"[场景] 飞书{'群聊' if x['chat']=='group' else '私聊'}"]
    prev=x['prev'][-(4 if full else 2):]
    for p in prev:
        out.append("[更早·用户] "+clip(p['user'], 1500 if full else 300))
        out.append("[更早·V] "+clip(p['reply'], 2500 if full else 500))
    out.append("[本轮·用户] "+clip(x['user'], 2000 if full else 1000))
    if x['tools']:
        if full: out.append("[本轮·V 调用的工具]\n"+"\n".join(x['tools'][:40]))
        else:
            names=[]
            for t in x['tools']:
                n=t.split('(')[0]
                if n not in names: names.append(n)
            out.append("[本轮·V 用过的工具] "+", ".join(names[:10]))
    if full and x['toolResults']: out.append("[本轮·工具结果摘录]\n"+"\n".join(x['toolResults'][:12]))
    out.append("[本轮·V 的回复]\n"+clip(x['reply'], 5000 if full else 3000))
    return "\n\n".join(out)
def parse(text):
    m=re.search(r'\{.*\}', text or "", re.S)
    if not m: return {"skip":True,"suggestions":[],"parse_error":True}
    try: return json.loads(m.group(0))
    except Exception: return {"skip":True,"suggestions":[],"parse_error":True}
VARIANTS={
 "A0_naive_flash": lambda x: ("deepseek","deepseek-v4-flash",NAIVE,ctx(x,False),{"thinking":{"type":"disabled"}}),
 "A1_sep_flash": lambda x: ("deepseek","deepseek-v4-flash",DESIGNED,ctx(x,False),{"thinking":{"type":"disabled"}}),
 "A2_sep_flash_think": lambda x: ("deepseek","deepseek-v4-flash",DESIGNED,ctx(x,False),{"thinking":{"type":"enabled"},"reasoning_effort":"low"}),
 "A3_sep_flash_v2": lambda x: ("deepseek","deepseek-v4-flash",DESIGNED_V2,ctx(x,False),{"thinking":{"type":"disabled"}}),
 "A4_sep_flash_think_v2": lambda x: ("deepseek","deepseek-v4-flash",DESIGNED_V2,ctx(x,False),{"thinking":{"type":"enabled"},"reasoning_effort":"low"}),
 "C1_gpt_short": lambda x: ("azure-openai","gpt-5.6-sol",DESIGNED,ctx(x,False),{}),
 "C2_flash_think_full": lambda x: ("deepseek","deepseek-v4-flash",DESIGNED,ctx(x,True),{"thinking":{"type":"enabled"},"reasoning_effort":"low"}),
 "B_main_full": lambda x: (("azure-openai","gpt-5.6-sol",DESIGNED,ctx(x,True),{"max_completion_tokens":4000}) if 'gpt' in x['harness'] else ("deepseek","deepseek-v4-flash",DESIGNED,ctx(x,True),{"thinking":{"type":"enabled"},"reasoning_effort":"high"})),
}
def run(args):
    vname, x = args
    prov, model, sysm, user, extra = VARIANTS[vname](x)
    if prov=="azure-openai": extra={"max_completion_tokens":4000}
    for attempt in range(2):
        try:
            dt, d = call(prov, model, sysm, user, extra)
            msg=d["choices"][0]["message"]; out=parse(msg.get("content"))
            return {"id":x["id"],"variant":vname,"model":model,"latency":round(dt,2),"usage":d.get("usage"),"out":out,"raw":(msg.get("content") or "")[:2000],"ctx_chars":len(user)}
        except Exception as e:
            err=str(e)
            if hasattr(e,'read'):
                try: err+=" "+e.read().decode()[:300]
                except Exception: pass
    return {"id":x["id"],"variant":vname,"error":err}
if __name__=="__main__":
    samples=json.load(open(sys.argv[1])); variants=sys.argv[2].split(",")
    jobs=[(v,x) for v in variants for x in samples]
    with cf.ThreadPoolExecutor(int(sys.argv[3]) if len(sys.argv)>3 else 4) as ex:
        res=list(ex.map(run, jobs))
    json.dump(res, sys.stdout, ensure_ascii=False)
