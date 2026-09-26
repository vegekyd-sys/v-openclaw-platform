import sys, json, collections
calls = collections.defaultdict(dict)
for l in sys.stdin:
    try: e = json.loads(l)
    except Exception: continue
    c = e.get("callId")
    if not c: continue
    d = calls[c]
    d[e["stage"]] = e["at"]
    for k in ("inputItems", "toolCount", "provider", "model", "effort"):
        if k in e: d[k] = e[k]

rows = []
for c, d in calls.items():
    if "model-call-enter" in d and "provider-accepted" in d and "inputItems" in d:
        rows.append((d["provider-accepted"] - d["model-call-enter"], d["inputItems"], d["toolCount"], d.get("model")))
if not rows:
    print("no paired samples"); sys.exit()
rows.sort()
n = len(rows)
print("n=%d  handshake ms vs payload size" % n)
print("%-14s %8s %10s %10s" % ("bucket", "n", "med_hs_s", "med_items"))
for name, lo, hi in (("fastest 25%", 0, n//4), ("mid 50%", n//4, 3*n//4), ("slowest 25%", 3*n//4, n)):
    b = rows[lo:hi]
    if not b: continue
    hs = sorted(x[0] for x in b); it = sorted(x[1] for x in b)
    print("%-14s %8d %10.1f %10d" % (name, len(b), hs[len(hs)//2]/1000, it[len(it)//2]))
print()
print("slowest 5 calls:")
for hs, items, tools, model in rows[-5:]:
    print("  %6.1fs  items=%-5d tools=%-4d %s" % (hs/1000, items, tools, model))
print("fastest 5 calls:")
for hs, items, tools, model in rows[:5]:
    print("  %6.1fs  items=%-5d tools=%-4d %s" % (hs/1000, items, tools, model))
