import json,collections
exec(open('hourly.py').read().split("print('gateway ready")[0])
def q(xs,p):
    xs=sorted(xs); return xs[min(len(xs)-1,int(p*len(xs)))] if xs else float('nan')
for lab,sel in [('low(<30)',lambda w:w<30),('high(>=100)',lambda w:w>=100)]:
    S_=[r for r in V if sel(wb[H(r['sentAtMs']/1000)])]
    print('==',lab,len(S_))
    for name,f in [('sent->recv',lambda r:r['receivedAtMs']-r['sentAtMs']),('recv->disp',lambda r:r['dispatcherAtMs']-r['receivedAtMs']),
                   ('disp->typing',lambda r:r['typingShownAtMs']-r['dispatcherAtMs'] if r.get('typingShownAtMs') else None),
                   ('disp->run',lambda r:r['runStartAtMs']-r['dispatcherAtMs']),('typing<run share',lambda r:1000 if r.get('typingShownAtMs',1e18)<r['runStartAtMs'] else 0)]:
        xs=[f(r) for r in S_]; xs=[x for x in xs if x is not None]
        print(f"  {name:16s} p50={q(xs,.5)/1000:5.2f} p75={q(xs,.75)/1000:5.2f} p90={q(xs,.9)/1000:5.2f} mean={sum(xs)/len(xs)/1000:5.2f}")
    for kind in ('direct','group'):
        xs=[r['runStartAtMs']-r['dispatcherAtMs'] for r in S_ if ':'+kind+':' in r['sessionKey']]
        ys=[r['receivedAtMs']-r['sentAtMs'] for r in S_ if ':'+kind+':' in r['sessionKey']]
        print(f"  {kind}: n={len(xs)} disp->run p50={q(xs,.5)/1000:.2f} p90={q(xs,.9)/1000:.2f} sent->recv p50={q(ys,.5)/1000:.2f}")
# recv->disp bimodal: what decides?
r0=[r for r in V if r['dispatcherAtMs']-r['receivedAtMs']<50]; r1=[r for r in V if r['dispatcherAtMs']-r['receivedAtMs']>=50]
print('recv->disp <50ms:',len(r0),collections.Counter(':group:' in r['sessionKey'] for r in r0),' >=50ms:',len(r1),collections.Counter(':group:' in r['sessionKey'] for r in r1))
