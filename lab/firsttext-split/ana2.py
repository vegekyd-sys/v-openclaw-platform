import json,collections
J=[j for j in json.load(open('joined.json')) if j['tok'] and j['user'] and j['reqs']]
def q(xs,p):
    xs=sorted(xs); return xs[min(len(xs)-1,int(p*len(xs)))] if xs else float('nan')
A=[j for j in J if sum(1 for r in j['reqs'] if r[0]<=j['tok']+50)==0]
print('answer-first',len(A),'of',len(J))
# first request: reqs[0] = (ts,input,cached,output,reasoning)
for j in A:
    r=j['reqs'][0]; j['in']=r[1]; j['hit']=(r[2] or 0)/max(1,r[1]); j['rt']=r[4] or 0; j['miss']=r[1]-(r[2] or 0)
    j['u2t']=(j['tok']-j['user'])/1000; j['r2t']=(j['tok']-j['run'])/1000
print('run->tok p50 %.2f p90 %.2f ; user->tok p50 %.2f'%(q([j['r2t'] for j in A],.5),q([j['r2t'] for j in A],.9),q([j['u2t'] for j in A],.5)))
def bucket(name,key,edges):
    print('--',name)
    for lo,hi in zip(edges,edges[1:]):
        s=[j for j in A if lo<=key(j)<hi]
        if s: print(f"  [{lo},{hi}) n={len(s):4d} user->tok p50={q([j['u2t'] for j in s],.5):6.2f} p90={q([j['u2t'] for j in s],.9):6.2f}  rt p50={q([j['rt'] for j in s],.5)}  in p50={q([j['in'] for j in s],.5)} hit p50={q([j['hit'] for j in s],.5):.3f}")
bucket('reasoning tokens',lambda j:j['rt'],[0,50,100,200,400,800,1600,100000])
bucket('input tokens',lambda j:j['in'],[0,100e3,150e3,200e3,300e3,500e3,1e7])
bucket('uncached tokens',lambda j:j['miss'],[0,2e3,5e3,20e3,50e3,100e3,1e7])
bucket('cache hit',lambda j:j['hit'],[0,0.5,0.9,0.97,0.99,1.01])
