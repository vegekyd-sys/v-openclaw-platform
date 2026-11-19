import json,collections,statistics as st
from datetime import datetime,timezone,timedelta
TZ=timezone(timedelta(hours=8))
rows=json.load(open('ft.json'))
rows.sort(key=lambda r:r['sentAtMs'])
# busy flag: same session previous end > sent
last={}
for r in rows:
    k=r['sessionKey']; p=last.get(k)
    r['_busy']= bool(p and p.get('endAtMs',0)>r['sentAtMs'])
    r['_gap']= (r['sentAtMs']-p['endAtMs'])/1000 if p and p.get('endAtMs') else None
    last[k]=r
def q(xs,p):
    xs=sorted(xs); 
    if not xs: return float('nan')
    return xs[min(len(xs)-1,int(p*len(xs)))]
def fmt(xs): return f"n={len(xs):4d} p50={q(xs,.5)/1000:6.2f} p90={q(xs,.9)/1000:6.2f}"
def day(r): return datetime.fromtimestamp(r['sentAtMs']/1000,TZ).strftime('%m-%d')
vds=[r for r in rows if r.get('model')=='vds-deepseek-flash' and r.get('firstAnswerPushAtMs') and r.get('runStartAtMs')]
print('vds with push',len(vds),'busy',sum(r['_busy'] for r in vds))
segs=[('sent->recv','sentAtMs','receivedAtMs'),('recv->disp','receivedAtMs','dispatcherAtMs'),('disp->run','dispatcherAtMs','runStartAtMs'),('sent->run','sentAtMs','runStartAtMs'),('run->tok','runStartAtMs','firstAnswerTokenAtMs'),('tok->push','firstAnswerTokenAtMs','firstAnswerPushAtMs'),('total','sentAtMs','firstAnswerPushAtMs')]
for busy in (False,True):
  print('=== busy',busy)
  by=collections.defaultdict(list)
  for r in vds:
    if r['_busy']==busy: by[day(r)].append(r)
  for d in sorted(by):
    print(d)
    for name,a,b in segs:
        xs=[r[b]-r[a] for r in by[d] if r.get(a) and r.get(b)]
        print('  ',f"{name:11s}",fmt(xs))
