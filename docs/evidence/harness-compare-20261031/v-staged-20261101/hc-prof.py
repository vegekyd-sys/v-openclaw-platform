import json,sys,collections,re
p=json.load(open(sys.argv[1])); nodes={n['id']:n for n in p['nodes']}
par={}
for n in p['nodes']:
    for c in n.get('children',[]): par[c]=n['id']
dt=p['timeDeltas']; self_=collections.Counter()
for i,s in zip(p['samples'],dt): self_[i]+=s/1000
tot=sum(self_.values()); idle=sum(v for k,v in self_.items() if nodes[k]['callFrame']['functionName'] in('(idle)',))
def fn(n):
    c=n['callFrame']; u=c.get('url','').split('/')[-1]; return f"{c['functionName'] or '(anon)'}@{u}:{c.get('lineNumber',0)}"
byf=collections.Counter(); inc=collections.Counter()
for k,v in self_.items():
    byf[fn(nodes[k])]+=v
    seen=set(); x=k
    while x is not None:
        f=fn(nodes[x])
        if f not in seen: inc[f]+=v; seen.add(f)
        x=par.get(x)
print('total ms',round(tot),'idle ms',round(idle))
print('--self');[print(round(v),k) for k,v in byf.most_common(int(sys.argv[2]))]
print('--inclusive');[print(round(v),k) for k,v in inc.most_common(int(sys.argv[3]))]
