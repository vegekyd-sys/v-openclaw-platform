import json,sys,glob,os,time
want=json.load(sys.stdin)
base="/home/openclaw/.openclaw/agents/makaron/agent/codex-home/sessions/"
for th,turns in want.items():
    fs=glob.glob(base+"2026/*/*/*"+th+".jsonl")
    if not fs: print(json.dumps({"thread":th,"missing":1})); continue
    f=fs[0]; ts=set(turns); cur=None; o=None; out=[]
    prevTask=None
    with open(f,"rb") as fh:
        for raw in fh:
            if cur is None and b"task_started" not in raw: continue
            d=json.loads(raw); p=d.get("payload") or {}; typ=d["type"]; pt=p.get("type") if isinstance(p,dict) else None; t=d["timestamp"]
            if pt=="task_started":
                tid=(p.get("turn_attribution") or {}).get("turn_id") or p.get("turn_id")
                if o: out.append(o)
                cur=tid; o={"thread":th,"turn":tid,"want":tid in ts,"tTask":t,"prevTaskEnd":prevTask,"ev":[]}
                continue
            if cur is None: continue
            if pt in ("task_complete","turn_aborted"):
                o["tEnd"]=t; o["endType"]=pt; prevTask=t; out.append(o); o=None; cur=None; continue
            if not o["want"]: continue
            ev=o["ev"]
            if typ=="token_usage_record":
                u=p.get("usage") or {}; ev.append(["req",t,u.get("input_tokens"),u.get("cached_input_tokens"),u.get("output_tokens"),u.get("reasoning_output_tokens")])
            elif pt=="item_completed":
                it=p.get("item") or {}; k=it.get("type")
                if k=="UserMessage": ev.append(["user",t,len(json.dumps(it.get("content"),ensure_ascii=False))])
                elif k=="Reasoning": ev.append(["reason",t,sum(len(x) for x in it.get("raw_content") or [])])
                elif k=="AgentMessage": ev.append(["msg",t,it.get("phase"),len(json.dumps(it.get("content"),ensure_ascii=False))])
                elif k in ("DynamicToolCall","CommandExecution","McpToolCall","WebSearch","FileChange"): ev.append(["tool",t,k,it.get("tool") or (it.get("command") or [""])[-1][:40]])
                elif k and "ompact" in k: ev.append(["compact",t,k])
                else: ev.append(["item",t,k])
            elif typ=="response_item" and pt=="message" and p.get("role")=="developer":
                ev.append(["dev",t,len(json.dumps(p.get("content"),ensure_ascii=False))])
            elif typ=="response_item" and pt=="function_call_output" and not o.get("sawReq"):
                ev.append(["fco",t,p.get("name"),len(json.dumps(p.get("output"),ensure_ascii=False))])
            elif pt and "ompact" in pt: ev.append(["compact",t,pt])
            elif typ=="compacted" or (pt is None and "ompact" in typ): ev.append(["compact",t,typ])
            if typ=="token_usage_record": o["sawReq"]=1
    if o: out.append(o)
    for o in out:
        if o.get("want"): print(json.dumps(o))
    try:
        if time.time()-os.path.getmtime(f)>600:
            fd=os.open(f,os.O_RDONLY); os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED); os.close(fd)
    except Exception: pass
