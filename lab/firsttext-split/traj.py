import sqlite3,json,sys
runs=json.load(sys.stdin)
c=sqlite3.connect("file:/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite?mode=ro",uri=True)
sids={}
for k in {r["sessionKey"] for r in runs}:
    row=c.execute("select current_session_id from session_nodes where session_key=?",(k,)).fetchone()
    sids[k]=row[0] if row else None
for r in runs:
    sid=sids.get(r["sessionKey"]); o={"runId":r["runId"]}
    if sid:
        for typ,ej in c.execute("select json_extract(event_json,'$.type'),event_json from trajectory_runtime_events where session_id=? and run_id=? order by seq",(sid,r["runId"])):
            d=json.loads(ej); dd=d.get("data") or {}
            ts=d.get("ts")
            if typ=="session.started":
                o["thread"]=dd.get("threadId"); o["tStart"]=ts; o["toolCount"]=dd.get("toolCount")
            elif typ=="context.compiled":
                sp=dd.get("systemPrompt"); o["sysChars"]=sp.get("originalChars") if isinstance(sp,dict) else (len(sp) if isinstance(sp,str) else None)
                p=dd.get("prompt"); o["promptChars"]=len(p) if isinstance(p,str) else None
                o["tCompiled"]=ts
            elif typ=="prompt.submitted":
                o["turn"]=dd.get("turnId"); o["tSubmit"]=ts; o["thread"]=dd.get("threadId") or o.get("thread")
            elif typ=="model.completed":
                o["usage"]=dd.get("usage"); o["tDone"]=ts; o["nMsgs"]=len(dd.get("messagesSnapshot") or [])
            o.setdefault("types",[]).append(typ)
    print(json.dumps(o))
