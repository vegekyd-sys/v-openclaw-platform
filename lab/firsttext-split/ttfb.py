import sqlite3,json,glob,bisect,collections
from datetime import datetime
def ms(s): return datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000
c=sqlite3.connect("file:/home/openclaw/.openclaw/agents/makaron/agent/codex-home/logs_2.sqlite?mode=ro",uri=True)
hdr=collections.defaultdict(list)
for ts,ns,tid,body in c.execute("select ts,ts_nanos,thread_id,substr(feedback_log_body,1,400) from logs where feedback_log_body like '%Request completed%api.deepseek.com%'"):
    if tid: hdr[tid].append(ts*1000+ns/1e6)
base="/home/openclaw/.openclaw/agents/makaron/agent/codex-home/sessions/"
out=[]
for tid,hs in hdr.items():
    fs=glob.glob(base+"2026/11/*/*"+tid+".jsonl")
    if not fs: continue
    ev=[]
    lo=min(hs)-3600e3
    for raw in open(fs[0],'rb'):
        if b'"timestamp":"2026-11-19' not in raw[:40]: continue
        d=json.loads(raw); t=ms(d['timestamp'])
        if t<lo: continue
        p=d.get('payload') or {}; pt=p.get('type') if isinstance(p,dict) else None
        if d['type']=='token_usage_record':
            u=p.get('usage') or {}; ev.append((t,'req',u.get('input_tokens'),u.get('cached_input_tokens'),u.get('reasoning_output_tokens'),u.get('output_tokens')))
        elif pt=='item_completed' and (p.get('item') or {}).get('type') in ('UserMessage','DynamicToolCall','CommandExecution','McpToolCall','FileChange','WebSearch'):
            ev.append((t,'start'))
        elif pt=='task_started': ev.append((t,'task'))
        elif d['type']=='response_item' and pt=='function_call_output': ev.append((t,'start'))
    ev.sort(); ts_=[e[0] for e in ev]
    for h in hs:
        i=bisect.bisect_left(ts_,h)
        nxt=[e for e in ev[i:i+40] if e[1]=='req'][:1]
        prev=[e for e in ev[max(0,i-60):i] if e[1] in ('start','req','task')]
        if not nxt or not prev: continue
        st=prev[-1][0]; r=nxt[0]
        out.append(dict(thread=tid,start=st,hdr=h,done=r[0],inp=r[2],cached=r[3],rt=r[4],out=r[5],prevKind=prev[-1][1]))
for o in out: print(json.dumps(o))
