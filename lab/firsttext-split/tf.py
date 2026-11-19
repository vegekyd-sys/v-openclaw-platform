import json,collections
from datetime import datetime
def ms(s): return datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000
def q(xs,p):
    xs=sorted(xs); return xs[min(len(xs)-1,int(p*len(xs)))] if xs else float('nan')
J=[j for j in json.load(open('joined.json')) if j['tok'] and j['user'] and j['reqs']]
A=[j for j in J if sum(1 for r in j['reqs'] if r[0]<=j['tok']+50)==0]; T=[j for j in J if j not in A]
for lab,S_ in (('answer-first',A),('tool-first',T),('all',J)):
    fp=[(j['firstPush']-j['sent'])/1000 for j in S_ if j['firstPush']]; ap=[(j['push']-j['sent'])/1000 for j in S_ if j['push']]
    print(f"{lab:13s} n={len(S_)} sent->firstPush(any) p50={q(fp,.5):.1f} p90={q(fp,.9):.1f} | sent->firstAnswerPush p50={q(ap,.5):.1f} p90={q(ap,.9):.1f}")
ph=collections.Counter()
for j in T:
    m=[e for e in j['ev'] if e[0]=='msg']
    ph[(m[0][2] if m else None)]+=1
    j['firstMsgBeforeTok']=any(ms(e[1])<j['tok'] for e in m)
print('tool-first first msg phase',ph, 'msg completed before tok',sum(j['firstMsgBeforeTok'] for j in T))
# share of overall >30s
L=[j for j in J if j['push'] and j['push']-j['sent']>30000]
print('>30s n',len(L),'of',len(J),' tool-first among them',sum(1 for j in L if j in T))
