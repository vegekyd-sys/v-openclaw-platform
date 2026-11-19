import json,collections
from datetime import datetime
def ms(s): return datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000
J=[j for j in json.load(open('joined.json')) if j['tok'] and j['user'] and j['reqs']]
def q(xs,p):
    xs=sorted(xs); return xs[min(len(xs)-1,int(p*len(xs)))] if xs else float('nan')
for j in J:
    r=j['reqs'][0]; j['in']=r[1]; j['rt']=r[4] or 0; j['u2t']=(j['tok']-j['user'])/1000
A=[j for j in J if sum(1 for r in j['reqs'] if r[0]<=j['tok']+50)==0]
print('2D: user->tok p50 by rt x input (answer-first)')
for rlo,rhi in [(0,300),(300,700),(700,100000)]:
    row=[]
    for ilo,ihi in [(0,250e3),(250e3,450e3),(450e3,650e3),(650e3,1e7)]:
        s=[j['u2t'] for j in A if rlo<=j['rt']<rhi and ilo<=j['in']<ihi]
        row.append(f"{q(s,.5):5.2f}(n{len(s)})")
    print(f" rt[{rlo},{rhi})", ' '.join(row))
# tool-first decomposition
T=[j for j in J if j not in A]
print('tool-first n',len(T))
mt=[];tt=[];nreq=[];tools=collections.Counter();other=[]
for j in T:
    evs=sorted([(ms(e[1]),e) for e in j['ev']],key=lambda x:x[0])
    last=j['user']; m=0; t=0; n=0
    for tms,e in evs:
        if tms>j['tok']+50: break
        if e[0]=='req': m+=tms-last; last=tms; n+=1
        elif e[0]=='tool': t+=tms-last; last=tms; tools[e[3] if e[2]=='DynamicToolCall' else e[2]]+=1
    tail=j['tok']-last  # final request partial (TTFB+reasoning of the answering request)
    mt.append((m+tail)/1000); tt.append(t/1000); nreq.append(n)
    other.append((j['tok']-j['run'])/1000)
print(' run->tok p50 %.1f p90 %.1f'%(q(other,.5),q(other,.9)))
print(' model time before tok p50 %.1f p90 %.1f ; tool exec time p50 %.1f p90 %.1f ; reqs p50 %d p90 %d'%(q(mt,.5),q(mt,.9),q(tt,.5),q(tt,.9),q(nreq,.5),q(nreq,.9)))
print(' share model: %.0f%%'%(100*sum(mt)/(sum(mt)+sum(tt))))
print(' tools before first answer:',tools.most_common(15))
# per-request model time distribution across all requests (all turns)
per=[];per_rt=[]
for j in J:
    evs=sorted([(ms(e[1]),e) for e in j['ev']],key=lambda x:x[0]); last=j['user']
    for tms,e in evs:
        if e[0]=='req': per.append((tms-last)/1000); per_rt.append(e[5] or 0); last=tms
        elif e[0]=='tool': last=tms
print('per request (to completion) p50 %.1f p90 %.1f; reasoning tok p50 %d p90 %d'%(q(per,.5),q(per,.9),q(per_rt,.5),q(per_rt,.9)))
