import json,re,collections
from datetime import datetime,timezone,timedelta
TZ=timezone(timedelta(hours=8))
def q(xs,p):
    xs=sorted(xs); return xs[min(len(xs)-1,int(p*len(xs)))] if xs else float('nan')
H=lambda t: int(t//3600)
rows=json.load(open('ft.json')); rows.sort(key=lambda r:r['sentAtMs'])
last={}
for r in rows:
    p=last.get(r['sessionKey']); r['_busy']=bool(p and p.get('endAtMs',0)>r['sentAtMs']); last[r['sessionKey']]=r
V=[r for r in rows if r.get('model')=='vds-deepseek-flash' and r.get('runStartAtMs') and not r['_busy']]
d2r=collections.defaultdict(list); s2r=collections.defaultdict(list)
for r in V: h=H(r['sentAtMs']/1000); d2r[h].append(r['runStartAtMs']-r['dispatcherAtMs']); s2r[h].append(r['runStartAtMs']-r['sentAtMs'])
wb=collections.Counter(); chat=collections.Counter(); live=collections.Counter(); liveMax=collections.defaultdict(int); rss={}; starts=[]
lagsum=collections.Counter()
for line in open('sig.log'):
    ts=float(line.split(' ',1)[0]); h=H(ts)
    if 'codex-turn-tail' in line:
        m=re.search(r'"runId":"([^"]+)"',line); 
        if m and m.group(1).startswith('workboard:'): wb[h]+=1
        else: chat[h]+=1
    elif 'liveness heartbeat delayed' in line:
        live[h]+=1; o=int(re.search(r'overdue=(\d+)',line).group(1)); liveMax[h]=max(liveMax[h],o); lagsum[h]+=o
    elif 'memory pressure' in line:
        m=re.search(r"rss=([\d.]+) GiB",line)
        if m: rss[h]=float(m.group(1))
    elif '[gateway] ready' in line: starts.append(ts)
print('gateway ready times:',[datetime.fromtimestamp(t,TZ).strftime('%m-%d %H:%M') for t in starts])
X=[]
for h in sorted(d2r):
    up=min([h*3600-s for s in starts if s<=h*3600] or [None]) if any(s<=h*3600 for s in starts) else None
    X.append((h,len(d2r[h]),q(d2r[h],.5)/1000,q(s2r[h],.5)/1000,wb[h],chat[h],live[h],lagsum[h]/1000,rss.get(h),up/3600 if up is not None else None))
for x in X:
    print(datetime.fromtimestamp(x[0]*3600,TZ).strftime('%m-%d %H'),'n=%3d disp->run p50=%5.2f sent->run=%5.2f  wbTurns=%4d chatTurns=%3d liveDelayed=%3d lagSum=%6.1fs rss=%s up=%s'%(x[1],x[2],x[3],x[4],x[5],x[6],x[7],x[8],('%.1fh'%x[9]) if x[9] is not None else '-'))
json.dump(X,open('hourly.json','w'))
