#!/usr/bin/env python3
"""Window a .cpuprofile by wall-clock marks: busy/idle/GC and top inclusive/self frames.
usage: analyze-cpuprofile.py PROFILE STARTED_WALL_MS name:from_ms:to_ms ... [--top N]"""
import json, sys, re, collections
args = sys.argv[1:]
top = 25
if '--top' in args:
    i = args.index('--top'); top = int(args[i + 1]); del args[i:i + 2]
prof, started = json.load(open(args[0])), float(args[1])
wins = []
for w in args[2:]:
    n, a, b = w.split(':'); wins.append((n, float(a), float(b)))
nodes = {n['id']: n for n in prof['nodes']}
parent = {}
for n in prof['nodes']:
    for c in n.get('children', []): parent[c] = n['id']
def label(n):
    cf = n['callFrame']; url = re.sub(r'^.*/(dist|node_modules|production-worker|extensions)/', r'\1/', cf['url'] or '')
    url = re.sub(r'-[A-Za-z0-9_]{8}\.js$', '', url)
    return f"{cf['functionName'] or '(anon)'} {url}:{cf['lineNumber'] + 1}"
generic = re.compile(r'^(\(root\)|\(program\)|\(anon\)|runMicrotasks|processTicksAndRejections|run|bound|next|all|fn)$')
acc = {n: dict(busy=0.0, idle=0.0, gc=0.0, incl=collections.Counter(), self=collections.Counter(), ms=b - a) for n, a, b in wins}
t = prof['startTime']; deltas = prof['timeDeltas']
for i, sid in enumerate(prof['samples']):
    t += deltas[i]
    wall = started + (t - prof['startTime']) / 1000
    dt = (deltas[i + 1] if i + 1 < len(deltas) else 1000) / 1000
    w = next((x for x in wins if x[1] <= wall < x[2]), None)
    if not w: continue
    a = acc[w[0]]; n = nodes[sid]; fn = n['callFrame']['functionName']
    if fn == '(idle)': a['idle'] += dt; continue
    if fn == '(garbage collector)': a['gc'] += dt
    a['busy'] += dt; a['self'][label(n)] += dt
    seen = set(); c = sid
    while c is not None:
        nd = nodes[c]
        if not generic.match(nd['callFrame']['functionName'] or '(anon)'):
            k = label(nd)
            if k not in seen: seen.add(k); a['incl'][k] += dt
        c = parent.get(c)
for n, a, b in wins:
    x = acc[n]
    print(f"== {n}  wall {x['ms']/1000:.1f}s  busy {x['busy']/1000:.1f}s idle {x['idle']/1000:.1f}s gc {x['gc']/1000:.1f}s")
    for k, v in x['incl'].most_common(top): print(f"   {v/1000:6.2f}s  {k}")
