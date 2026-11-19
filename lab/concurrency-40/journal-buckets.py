#!/usr/bin/env python3
"""Bucket today's V Gateway journal: chat first-visible segments vs nightshift concurrency and main-thread signals."""
import gzip, json, re, sys, statistics as st
from datetime import datetime, timezone, timedelta

TZ = timezone(timedelta(hours=8))
path = sys.argv[1]
bucket_min = int(sys.argv[2]) if len(sys.argv) > 2 else 30
start_h = float(sys.argv[3]) if len(sys.argv) > 3 else 9

recs, wb_runs, tails, live, rpcs = [], [], [], [], []
ts_re = re.compile(r'^(\S+) \S+ \S+ (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+08:00)?')
def tms(s):
    return datetime.fromisoformat(s).timestamp() * 1000

with gzip.open(path, 'rt', errors='replace') as f:
    for line in f:
        m = ts_re.match(line)
        if not m: continue
        at = tms(m.group(2)) if m.group(2) else tms(m.group(1))
        if '[firsttext-e2e.1] ' in line:
            try: recs.append(json.loads(line.split('[firsttext-e2e.1] ', 1)[1]))
            except Exception: pass
        elif '[codex-turn-tail.1] ' in line:
            try:
                d = json.loads(line.split('[codex-turn-tail.1] ', 1)[1]); d['at'] = at; tails.append(d)
            except Exception: pass
        elif 'liveness heartbeat delayed' in line:
            o = re.search(r'overdue=(\d+)ms', line); live.append((at, int(o.group(1)) if o else 0))
        elif '⇄ res' in line:
            r = re.search(r'⇄ res \S+ (\S+) (\d+)ms', line)
            if r: rpcs.append((at, r.group(1), int(r.group(2))))
        if 'run workboard:' in line and 'ended with stopReason' in line:
            r = re.search(r'run workboard:([0-9a-f-]+):(\d+) ended', line)
            if r: wb_runs.append((int(r.group(2)), at, r.group(1)))

def is_inter(r):
    return r.get('origin') == 'inter_session' or any(str(r.get(k, '')).startswith(('v-a2a-', 'v-a2a:')) for k in ('runId', 'inboundMessageId'))
recs = [r for r in recs if not is_inter(r) and r.get('sentAtMs')]

def active_wb(t):
    return sum(1 for s, e, _ in wb_runs if s <= t <= e)
def active_cards(t):
    return len({c for s, e, c in wb_runs if s <= t <= e})

def q(xs, p):
    xs = sorted(x for x in xs if x is not None)
    if not xs: return None
    k = (len(xs) - 1) * p; i = int(k)
    return xs[i] if i + 1 >= len(xs) else xs[i] + (xs[i + 1] - xs[i]) * (k - i)
def fmt(v, d=1):
    return '-' if v is None else f'{v/1000:.{d}f}'

day0 = datetime(2026, 11, 18, tzinfo=TZ).timestamp() * 1000
B = bucket_min * 60_000
rows = {}
for r in recs:
    fv = min([x for x in (r.get('firstPushAtMs'), r.get('visibleAtMs')) if x], default=None)
    b = int((r['sentAtMs'] - day0) // B)
    rows.setdefault(b, []).append({
        'fv': fv - r['sentAtMs'] if fv else None,
        'inb': r.get('receivedAtMs', 0) - r['sentAtMs'] if r.get('receivedAtMs') else None,
        'pre': r['dispatcherAtMs'] - r['receivedAtMs'] if r.get('dispatcherAtMs') and r.get('receivedAtMs') else None,
        'd2r': r['runStartAtMs'] - r['dispatcherAtMs'] if r.get('runStartAtMs') and r.get('dispatcherAtMs') else None,
        'run2fv': fv - r['runStartAtMs'] if fv and r.get('runStartAtMs') else None,
        'rt': r.get('agentRuntime') or '?', 'wb': active_wb(r['sentAtMs']), 'cards': active_cards(r['sentAtMs']),
    })

print(f'records={len(recs)} wbRuns={len(wb_runs)} tails={len(tails)} live={len(live)} rpcs={len(rpcs)}')
hdr = 'bucket  n  codex wkr  wbTurns  fvP50 fvP90 | inb pre d2r run2fv (P50) | d2r run2fv (mean) | live>1s  liveSum  tailLagMax p90 | rpc>=50ms sum s (top)'
print(hdr)
for b in sorted(rows):
    t0 = day0 + b * B
    if (t0 - day0) / 3600_000 < start_h: continue
    xs = rows[b]
    n = len(xs)
    cx = sum(1 for x in xs if x['rt'] == 'codex'); wk = sum(1 for x in xs if x['rt'] in ('vlab-worker',))
    wbm = st.mean(x['wb'] for x in xs)
    lv = [o for a, o in live if t0 <= a < t0 + B]
    tl = [t.get('lagMaxMs', 0) for t in tails if t0 <= t['at'] < t0 + B]
    rp = [(m, ms) for a, m, ms in rpcs if t0 <= a < t0 + B]
    agg = {}
    for m, ms in rp: agg[m] = agg.get(m, 0) + ms
    top = sorted(agg.items(), key=lambda kv: -kv[1])[:3]
    lab = datetime.fromtimestamp(t0 / 1000, TZ).strftime('%H:%M')
    mean = lambda k: (st.mean([x[k] for x in xs if x[k] is not None]) if any(x[k] is not None for x in xs) else None)
    print(f"{lab} {n:3d} {cx:4d} {wk:3d} {wbm:7.1f}  {fmt(q([x['fv'] for x in xs],.5)):>5} {fmt(q([x['fv'] for x in xs],.9)):>5} | "
          f"{fmt(q([x['inb'] for x in xs],.5))} {fmt(q([x['pre'] for x in xs],.5))} {fmt(q([x['d2r'] for x in xs],.5))} {fmt(q([x['run2fv'] for x in xs],.5))} | "
          f"{fmt(mean('d2r'))} {fmt(mean('run2fv'))} | {len(lv):3d} {sum(lv)/1000:6.1f}  {fmt(q(tl,.9))} | {sum(agg.values())/1000:6.1f} "
          + ' '.join(f"{m.split('.')[-1]}={v/1000:.0f}" for m, v in top))

# Correlation: per chat record, nightshift concurrency vs segments
print('\nBy nightshift active turns at send time (codex chat only, 09:00+):')
allx = [x for b in rows for x in rows[b] if (b * B) / 3600_000 >= start_h]
for lo, hi in [(0, 3), (3, 6), (6, 10), (10, 15), (15, 20), (20, 99)]:
    g = [x for x in allx if lo <= x['wb'] < hi and x['rt'] == 'codex']
    if not g: continue
    print(f"wb {lo:2d}-{hi:2d}: n={len(g):3d} fvP50={fmt(q([x['fv'] for x in g],.5))} P90={fmt(q([x['fv'] for x in g],.9))} "
          f"d2rP50={fmt(q([x['d2r'] for x in g],.5))} d2rP90={fmt(q([x['d2r'] for x in g],.9))} run2fvP50={fmt(q([x['run2fv'] for x in g],.5))} run2fvP90={fmt(q([x['run2fv'] for x in g],.9))}")
print('runtimes:', {k: sum(1 for x in allx if x['rt'] == k) for k in {x['rt'] for x in allx}})
