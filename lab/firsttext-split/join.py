import json,collections
from datetime import datetime
def ms(s): return datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000
ft={r['runId']:r for r in json.load(open('ft.json')) if r.get('runId')}
tr={}
for l in open('traj.jsonl'):
    x=json.loads(l)
    if x.get('turn'): tr[x['turn']]=x
J=[]
for l in open('roll.jsonl'):
    o=json.loads(l); x=tr[o['turn']]; r=ft[x['runId']]
    if r.get('model')!='vds-deepseek-flash': continue
    j=dict(sessionKey=r['sessionKey'],runId=r['runId'],sent=r['sentAtMs'],run=r['runStartAtMs'],tok=r.get('firstAnswerTokenAtMs'),push=r.get('firstAnswerPushAtMs'),firstPush=r.get('firstPushAtMs'))
    j['submit']=ms(x['tSubmit']); j['start']=ms(x['tStart']); j['task']=ms(o['tTask'])
    j['sys']=x.get('sysChars'); j['tools']=x.get('toolCount'); j['usage']=x.get('usage')
    j['prevEnd']=ms(o['prevTaskEnd']) if o.get('prevTaskEnd') else None
    ev=o['ev']; j['ev']=ev
    u=[e for e in ev if e[0]=='user']; j['user']=ms(u[0][1]) if u else None
    reqs=[e for e in ev if e[0]=='req']; j['reqs']=[(ms(e[1]),)+tuple(e[2:]) for e in reqs]
    j['dev']=sum(e[2] for e in ev if e[0]=='dev'); j['compact']=[e for e in ev if e[0]=='compact']
    j['devBeforeReq']=sum(e[2] for e in ev if e[0]=='dev' and (not reqs or e[1]<=reqs[0][1]))
    J.append(j)
json.dump(J,open('joined.json','w')); print(len(J))
