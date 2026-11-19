import json,statistics as st
J=json.load(open('joined.json'))
def q(xs,p):
    xs=sorted(x for x in xs if x is not None)
    return xs[min(len(xs)-1,int(p*len(xs)))] if xs else float('nan')
def show(name,xs,scale=1000):
    xs=[x for x in xs if x is not None]
    print(f"{name:34s} n={len(xs):4d} p50={q(xs,.5)/scale:7.2f} p75={q(xs,.75)/scale:7.2f} p90={q(xs,.9)/scale:7.2f}")
J=[j for j in J if j['tok']]
show('run->start(sessionStarted)',[j['start']-j['run'] for j in J])
show('start->submit(Gateway prep)',[j['submit']-j['start'] for j in J])
show('submit->task_started',[j['task']-j['submit'] for j in J])
show('task->user item',[j['user']-j['task'] for j in J if j['user']])
show('user->first req done',[j['reqs'][0][0]-j['user'] for j in J if j['user'] and j['reqs']])
show('run->tok',[j['tok']-j['run'] for j in J])
# requests before tok
nb=[sum(1 for r in j['reqs'] if r[0]<=j['tok']+50) for j in J]
import collections
print('reqs completed before first answer token:',collections.Counter(min(n,6) for n in nb))
