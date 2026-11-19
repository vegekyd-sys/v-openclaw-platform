import json,collections
from datetime import datetime,timezone,timedelta
TZ=timezone(timedelta(hours=8))
exec(open('hourly.py').read().split("print('gateway ready")[0])
def q(xs,p):
    xs=sorted(xs); return xs[min(len(xs)-1,int(p*len(xs)))] if xs else float('nan')
B=collections.defaultdict(list); BD=collections.defaultdict(list); share=collections.Counter()
for r in V:
    h=H(r['sentAtMs']/1000); w=wb[h]; b='<30' if w<30 else ('30-99' if w<100 else '>=100')
    d=datetime.fromtimestamp(r['sentAtMs']/1000,TZ).strftime('%m-%d')
    B[(d,b)].append(r['runStartAtMs']-r['dispatcherAtMs']); BD[b].append(r['runStartAtMs']-r['dispatcherAtMs']); share[(d,b)]+=1
for d in ['11-16','11-17','11-18','11-19']:
    tot=sum(share[(d,b)] for b in ['<30','30-99','>=100'])
    print(d,'  '.join(f"{b}: n={len(B[(d,b)]):3d} ({100*share[(d,b)]/tot:2.0f}%) p50={q(B[(d,b)],.5)/1000:4.2f} p90={q(B[(d,b)],.9)/1000:4.2f}" for b in ['<30','30-99','>=100']))
print('pooled', '  '.join(f"{b}: n={len(BD[b])} p50={q(BD[b],.5)/1000:.2f} p90={q(BD[b],.9)/1000:.2f}" for b in ['<30','30-99','>=100']))
