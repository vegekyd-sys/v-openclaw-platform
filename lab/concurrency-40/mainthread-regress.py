#!/usr/bin/env python3
"""Regress Gateway main-thread CPU (15 s windows) on per-class Codex event counts + Feishu inbound count.
usage: mainthread_regress.py proc.jsonl codex-events.jsonl.gz join.json fe.txt"""
import gzip, json, sys, math

procf, evf, joinf, fef = sys.argv[1:5]
proc = [json.loads(l) for l in open(procf)]
join = json.load(open(joinf))
cls = join['threadClass']
ev = [json.loads(l) for l in gzip.open(evf, 'rt')]
fe = []
for l in open(fef):
    if '[firsttext-e2e.1] ' in l:
        try: fe.append(json.loads(l.split('[firsttext-e2e.1] ', 1)[1]))
        except Exception: pass

FEATS = ['wb_tool', 'wb_call', 'wb_item', 'chat_tool', 'chat_call', 'chat_item', 'turns', 'feishu_in']
MODEL = sys.argv[5].split(',') if len(sys.argv) > 5 else FEATS
AGG = int(sys.argv[6]) if len(sys.argv) > 6 else 1
def feats(t0, t1):
    x = dict.fromkeys(FEATS, 0)
    for e in ev:
        if not (t0 <= e['ms'] < t1) or not e.get('th'): continue
        c = cls.get(e['th'], 'unknown')
        g = 'wb' if c == 'wb' else 'chat'   # chat bucket = every non-nightshift Codex thread
        if e['k'] == 'sub' and e.get('op') == 'dynamic_tool_response': x[f'{g}_tool'] += 1
        elif e['k'] == 'http' and 'deepseek' in (e.get('host') or ''): x[f'{g}_call'] += 1
        elif e['k'] == 'item': x[f'{g}_item'] += 1
        elif e['k'] == 'sub' and e.get('op') == 'turn_input': x['turns'] += 1
    x['feishu_in'] = sum(1 for r in fe if t0 <= (r.get('receivedAtMs') or 0) < t1)
    return x

evmin = min(e['ms'] for e in ev); evmax = max(e['ms'] for e in ev)
rows = []
for p in proc:
    t1 = p['at']; t0 = t1 - p['dt'] * 1000
    if t0 < evmin or t1 > evmax: continue
    rows.append((feats(t0, t1), p['gwMainPct'] / 100 * p['dt']))   # main-thread CPU seconds in window
def combine(f):
    out = {}
    for name in MODEL:
        out[name] = sum(f[x] for x in name.split('+'))
    return out
rows = [(combine(f), y) for f, y in rows]
if AGG > 1:
    agg = []
    for i in range(0, len(rows) - AGG + 1, AGG):
        chunk = rows[i:i + AGG]
        agg.append(({k: sum(c[0][k] for c in chunk) for k in MODEL}, sum(c[1] for c in chunk)))
    rows = agg

def ols(X, y):
    n, k = len(X), len(X[0])
    A = [[sum(X[r][i] * X[r][j] for r in range(n)) for j in range(k)] for i in range(k)]
    b = [sum(X[r][i] * y[r] for r in range(n)) for i in range(k)]
    for i in range(k): A[i][i] += 1e-6
    M = [A[i] + [b[i]] for i in range(k)]
    for c in range(k):
        piv = max(range(c, k), key=lambda r: abs(M[r][c])); M[c], M[piv] = M[piv], M[c]
        for r in range(k):
            if r != c and M[c][c]:
                f = M[r][c] / M[c][c]
                M[r] = [a - f * bb for a, bb in zip(M[r], M[c])]
    return [M[i][k] / M[i][i] if M[i][i] else 0 for i in range(k)]

use = [f for f in MODEL if sum(r[0][f] for r in rows) > 0]
X = [[1.0] + [r[0][f] for f in use] for r in rows]
y = [r[1] for r in rows]
beta = ols(X, y)
pred = [sum(a * b for a, b in zip(x, beta)) for x in X]
ss_res = sum((a - b) ** 2 for a, b in zip(y, pred)); mean = sum(y) / len(y)
ss_tot = sum((a - mean) ** 2 for a in y)
W = 15 * AGG
print(f'windows={len(rows)}x{W}s meanMainCpuS={mean:.2f} ({mean/W*100:.0f}%)  R2={1-ss_res/ss_tot:.2f}')
print(f'  intercept      {beta[0]:7.3f} s per window ({beta[0]/W*100:.0f}% baseline)')
tot = {f: sum(r[0][f] for r in rows) for f in use}
allcpu = sum(y)
for f, b in zip(use, beta[1:]):
    print(f'  {f:12s} {b*1000:8.0f} ms/event   n={tot[f]:6d}  share={b*tot[f]/allcpu*100:5.1f}%')
wb_share = sum(b * tot[f] for f, b in zip(use, beta[1:]) if f.startswith('wb_')) / allcpu
print(f'nightshift share of main-thread CPU (model estimate): {wb_share*100:.0f}%')
