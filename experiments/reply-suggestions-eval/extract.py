import sqlite3, json, sys, re
DB="/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite"
con=sqlite3.connect(f"file:{DB}?mode=ro",uri=True)
sids=json.loads(sys.argv[1])
def text_of(msg):
    c=msg.get("content")
    if isinstance(c,str): return c
    out=[]
    for p in c or []:
        if p.get("type")=="text": out.append(p.get("text",""))
    return "\n".join(out)
def tools_of(msg):
    out=[]
    for p in msg.get("content") or []:
        if isinstance(p,dict) and p.get("type") in ("toolCall","tool_use","tool-call"):
            args=json.dumps(p.get("arguments") or p.get("input") or {},ensure_ascii=False)[:160]
            out.append(f'{p.get("name")}({args})')
    return out
res=[]
for sid,meta in sids.items():
    rows=con.execute("select seq,event_json from transcript_events where session_id=? order by seq desc limit 400",(sid,)).fetchall()
    rows.reverse()
    turns=[]  # list of dict(user, tools, reply, ts)
    cur=None
    for seq,ej in rows:
        try: e=json.loads(ej)
        except: continue
        if e.get("type")!="message": continue
        m=e.get("message") or {}
        role=m.get("role")
        if role=="user":
            t=text_of(m)
            if cur: turns.append(cur)
            cur={"user":t[:3000],"tools":[],"toolResults":[],"reply":"","ts":e.get("timestamp"),"model":None}
        elif role=="assistant" and cur is not None:
            tl=tools_of(m)
            cur["tools"]+=tl
            t=text_of(m)
            if t.strip(): cur["reply"]=t[:6000]
            cur["model"]=m.get("model")
        elif role=="toolResult" and cur is not None:
            cur["toolResults"].append((m.get("toolName") or "")+": "+text_of(m)[:300])
    if cur: turns.append(cur)
    res.append({"sid":sid,**meta,"turns":turns[-12:]})
json.dump(res,sys.stdout,ensure_ascii=False)
