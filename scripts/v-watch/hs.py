import sys, json, collections
calls = collections.defaultdict(dict); meta = {}
for l in sys.stdin:
    try: e = json.loads(l)
    except Exception: continue
    c = e.get("callId")
    if not c: continue
    calls[c][e["stage"]] = e["at"]
    meta[c] = e.get("provider")
hs = collections.defaultdict(list); ended = collections.Counter(); failed = collections.Counter()
for c, st in calls.items():
    p = meta[c]
    if "model-call-enter" in st and "provider-accepted" in st:
        hs[p].append(st["provider-accepted"] - st["model-call-enter"])
    if "model-call-ended" in st: ended[p] += 1
print("provider      n     p50     p90     max   ended")
for p, v in sorted(hs.items()):
    v.sort(); n = len(v)
    print("%-10s %4d %6.1fs %6.1fs %6.1fs %5d" % (p, n, v[n//2]/1000, v[min(int(n*0.9), n-1)]/1000, v[-1]/1000, ended[p]))
