#!/usr/bin/env python3
"""Point /vcodex and /luna at GPT-6 Sol and Luna over the codex runtime, now
that the 9.1 runtime carries the #155967 backport. The 5.6 models keep
/vcodex56 and /luna56 so a rollback is an alias swap.

Runs against both the gateway config and the worker config; their baselines
differ (the worker never exposed /vcodex, its gpt-5.6-sol alias is
openai-gpt5.6), so the demotion is applied only where the expected prior alias
is found. Aliases merge from agents.defaults, so invariants are checked on the
merged view. Idempotent and shape-gated.

Usage: point-at-gpt6.py <config.json> [--apply]
"""
import json, sys

CFG = sys.argv[1]; APPLY = "--apply" in sys.argv
cfg = json.load(open(CFG)); plan, errs = [], []

DEMOTE = [("openai/gpt-5.6-sol", "vcodex", "vcodex56"),
          ("openai/gpt-5.6-luna", "luna", "luna56")]
PROMOTE = {
    "openai/gpt-6-sol":  {"alias": "vcodex", "params": {"thinking": "medium"}, "agentRuntime": {"id": "codex"}},
    "openai/gpt-6-luna": {"alias": "luna", "params": {"thinking": "xhigh"}, "agentRuntime": {"id": "codex"}},
}

def models_of(agent):
    node = cfg["agents"]["defaults"] if agent == "defaults" else cfg["agents"].get("entries", {}).get(agent)
    return node.setdefault("models", {}) if isinstance(node, dict) else None

for agent in ("defaults", "makaron"):
    ms = models_of(agent)
    if ms is None: errs.append(f"agent {agent} missing"); continue
    for key, old, new in DEMOTE:
        e = ms.get(key)
        if e is None: continue
        cur = e.get("alias")
        if cur == new: plan.append(f"SKIP  {agent}.{key} alias already {new!r}")
        elif cur == old:
            e["alias"] = new; plan.append(f"ALIAS {agent}.{key}: {old!r} -> {new!r}")
        else: plan.append(f"KEEP  {agent}.{key} alias {cur!r} (not ours to move)")
    for key, entry in PROMOTE.items():
        if ms.get(key) == entry: plan.append(f"SKIP  {agent}.{key} already correct")
        else:
            ms[key] = json.loads(json.dumps(entry))
            plan.append(f"SET   {agent}.{key} = {json.dumps(entry, ensure_ascii=False)}")

allow = cfg["agents"]["defaults"].get("modelPolicy", {}).get("allow") or []
def allowed(m): return any(a == m or (a.endswith("/*") and m.startswith(a[:-1])) for a in allow)
for key in PROMOTE:
    if not allowed(key): errs.append(f"{key} not permitted by modelPolicy.allow")

for agent in ("defaults", "makaron"):
    merged = dict(models_of("defaults") or {})
    if agent != "defaults": merged.update(models_of(agent) or {})
    alias_of = {}
    for k, v in merged.items():
        a = v.get("alias") if isinstance(v, dict) else None
        if a: alias_of.setdefault(a.lower(), []).append(k)
    for a, ks in alias_of.items():
        if len(ks) > 1: errs.append(f"{agent}: alias {a!r} maps to {ks}")
    for want, expect in (("vcodex", "openai/gpt-6-sol"),
                         ("luna", "openai/gpt-6-luna"),
                         ("grok", "xai/grok-4.7")):
        got = alias_of.get(want)
        if not got: errs.append(f"{agent}: /{want} missing")
        elif got[0] != expect: errs.append(f"{agent}: /{want} -> {got[0]}, expected {expect}")

print("--- PLAN ---")
for p in plan: print(" ", p)
merged = dict(models_of("defaults") or {}); merged.update(models_of("makaron") or {})
print("--- merged aliases after ---")
for k, v in sorted(merged.items()):
    a = v.get("alias") if isinstance(v, dict) else None
    if a and a.lower() in ("grok", "vcodex", "luna", "vcodex56", "luna56", "grok46", "astra", "vds"):
        print(f"  /{a:<10} -> {k}")
if errs:
    print("--- BLOCKED ---")
    for e in errs: print("  !", e)
    sys.exit(2)
if not APPLY: print("--- dry run ---"); sys.exit(0)
json.dump(cfg, open(CFG, "w"), ensure_ascii=False, indent=2)
print("--- WRITTEN ---")
