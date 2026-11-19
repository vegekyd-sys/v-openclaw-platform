import json,re,collections,bisect
from datetime import datetime
def q(xs,p):
    xs=sorted(xs); return xs[min(len(xs)-1,int(p*len(xs)))] if xs else float('nan')
ev=[]
for l in open('media2.log',errors='replace'):
    m=re.match(r'(\S+) ',l)
    try: t=datetime.fromisoformat(m.group(1)).timestamp()*1000
    except Exception: continue
    if 'downloaded' in l:
        ext=l.rsplit('.',1)[-1].strip()[:5].lower()
        kind='video' if ext in ('mp4','mov','m4v','webm') else ('image' if ext in ('jpg','png','jpeg','webp','gif') else ('audio' if ext in ('ogg','mp3','m4a','opus') else 'file'))
        ev.append((t,kind))
rows=json.load(open('ft.json')); rows.sort(key=lambda r:r['sentAtMs'])
last={}
for r in rows:
    p=last.get(r['sessionKey']); r['_busy']=bool(p and p.get('endAtMs',0)>r['sentAtMs']); last[r['sessionKey']]=r
V=[r for r in rows if r.get('model')=='vds-deepseek-flash' and r.get('runStartAtMs') and not r['_busy']]
ts=[e[0] for e in ev]
for r in V:
    i=bisect.bisect_left(ts,r['receivedAtMs']-5); j=bisect.bisect_right(ts,r['dispatcherAtMs']+5)
    ks={e[1] for e in ev[i:j]}
    r['_media']='video' if 'video' in ks else (sorted(ks)[0] if ks else None)
for k in [None,'image','audio','file','video']:
    s=[r for r in V if r['_media']==k]
    if s: print(f"{str(k):6s} n={len(s):4d} recv->disp p50={q([r['dispatcherAtMs']-r['receivedAtMs'] for r in s],.5)/1000:5.2f} disp->run p50={q([r['runStartAtMs']-r['dispatcherAtMs'] for r in s],.5)/1000:5.2f} p90={q([r['runStartAtMs']-r['dispatcherAtMs'] for r in s],.9)/1000:5.2f} sent->firstAnswerPush p50={q([r['firstAnswerPushAtMs']-r['sentAtMs'] for r in s if r.get('firstAnswerPushAtMs')],.5)/1000:5.1f}")
L=[r for r in V if r['runStartAtMs']-r['sentAtMs']>15000]
print('long waits (>15s) by media:',collections.Counter(r['_media'] for r in L))
json.dump({r['runId']:r['_media'] for r in V if r.get('runId')},open('media_by_run.json','w'))
json.dump([r['runId'] for r in L if r['_media'] is None],open('long_nomedia.json','w'))
