#!/usr/bin/env python3
"""Compare Gateway main-thread CPU profiles from the mix harness, per background event.

usage: profile-compare.py <mix-runs.json> <profiles dir> [--top N] [--focus regex] [--windows a,b]

For every profiled window: total sampled ms, then self and inclusive time per function, divided by the
background tool calls started inside the profile span. Windows are grouped by side (e.g. flash / vds) so
the per-tool difference between runtimes, and between an early and a late window of the same side,
can be read directly.
"""
import gzip, json, os, re, sys
from collections import defaultdict

runs_file, prof_dir = sys.argv[1], sys.argv[2]
TOP = int(sys.argv[sys.argv.index('--top') + 1]) if '--top' in sys.argv else 40
FOCUS = re.compile(sys.argv[sys.argv.index('--focus') + 1]) if '--focus' in sys.argv else None
mix = json.load(open(runs_file))
wins = [w for w in mix['windows'] if w.get('profile')]


def label(cf):
    url = os.path.basename(cf.get('url') or '') or '(native)'
    return f"{cf.get('functionName') or '(anonymous)'} {url}:{cf.get('lineNumber', -1) + 1}"


def load(name):
    p = os.path.join(prof_dir, f'{name}.cpuprofile.gz')
    prof = json.load(gzip.open(p))
    nodes = {n['id']: n for n in prof['nodes']}
    parent = {}
    for n in prof['nodes']:
        for c in n.get('children', []):
            parent[c] = n['id']
    self_us = defaultdict(float)
    incl_us = defaultdict(float)
    file_us = defaultdict(float)
    total = 0.0
    dts = prof.get('timeDeltas', [])
    for i, sid in enumerate(prof['samples']):
        dt = dts[i] if i < len(dts) else 0
        if dt <= 0:
            continue
        node = nodes[sid]
        fn = node['callFrame'].get('functionName')
        if fn in ('(idle)', '(program)'):
            continue
        total += dt
        self_us[label(node['callFrame'])] += dt
        file_us[os.path.basename(node['callFrame'].get('url') or '') or f'({fn})'] += dt
        seen = set()
        cur = sid
        while cur is not None:
            k = label(nodes[cur]['callFrame'])
            if k not in seen:
                incl_us[k] += dt
                seen.add(k)
            cur = parent.get(cur)
    return total, self_us, incl_us, file_us


data = {}
for w in wins:
    try:
        data[w['name']] = (w, *load(w['profile']['name']))
    except FileNotFoundError:
        print('missing profile', w['name'])

print('window      side   busyMs  bgTools turns probes  ms/bgTool  mainCpuS')
for name, (w, total, *_ ) in data.items():
    p = w['profile']
    per = total / 1000 / max(1, p['bgToolStarts'])
    print(f"{name:10s} {w['side']:6s} {total/1000:7.0f} {p['bgToolStarts']:7d} {p['bgTurnStarts']:5d} {p['probeStarts']:6d}  {per:8.1f}  {p.get('mainCpuS')}")

# --windows a,b: compare two windows (e.g. an early and a late one of the same runtime) instead of sides
if '--windows' in sys.argv:
    pick = sys.argv[sys.argv.index('--windows') + 1].split(',')
    data = {k: v for k, v in data.items() if k in pick}
    for k, (w, *_rest) in data.items():
        w['side'] = k
sides = sorted({w['side'] for w, *_ in data.values()})


def per_tool(kind):
    out = {}
    for side in sides:
        acc = defaultdict(float)
        tools = 0
        for w, total, s, i, f in data.values():
            if w['side'] != side:
                continue
            tools += w['profile']['bgToolStarts']
            src = {'self': s, 'incl': i, 'file': f}[kind]
            for k, v in src.items():
                acc[k] += v
        out[side] = {k: v / 1000 / max(1, tools) for k, v in acc.items()}
    return out


for kind in ('file', 'self', 'incl'):
    pt = per_tool(kind)
    keys = set().union(*[set(v) for v in pt.values()])
    if FOCUS:
        keys = {k for k in keys if FOCUS.search(k)}
    if len(sides) == 2:
        a, b = sides
        rows = sorted(keys, key=lambda k: -(pt[b].get(k, 0) - pt[a].get(k, 0)))
        print(f'\n== {kind}: ms per background tool call, {b} minus {a} (largest first)')
        for k in rows[:TOP]:
            print(f"{pt[b].get(k,0) - pt[a].get(k,0):8.1f}  {a}={pt[a].get(k,0):7.1f} {b}={pt[b].get(k,0):7.1f}  {k}")
    else:
        side = sides[0]
        print(f'\n== {kind}: ms per background tool call ({side})')
        for k in sorted(keys, key=lambda k: -pt[side].get(k, 0))[:TOP]:
            print(f"{pt[side][k]:8.1f}  {k}")
