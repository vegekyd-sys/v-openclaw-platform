#!/usr/bin/env python3
"""Mirror the grok-4.7 / gpt-6-sol / gpt-6-luna wiring into the worker config
(/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json).

Agent-runtime models are resolved inside the worker process, which loads THIS
file, so the main config alone is not enough. Inside the worker the embedded
runtime id is "openclaw" (not "vlab-worker"); codex-runtime models keep "codex".
Shape-gated and idempotent."""
import json, sys, copy

CFG = sys.argv[1]; APPLY = "--apply" in sys.argv
cfg = json.load(open(CFG)); plan, errs = [], []

# A. xai provider: clone grok-4.6 -> grok-4.7
xai = cfg["models"]["providers"].get("xai")
if not (isinstance(xai, dict) and isinstance(xai.get("models"), list)):
    errs.append("models.providers.xai.models[] missing")
else:
    ids = [m.get("id") for m in xai["models"]]
    if "grok-4.7" in ids:
        plan.append("SKIP  provider xai: grok-4.7 present")
    elif "grok-4.6" not in ids:
        errs.append("no grok-4.6 to clone")
    else:
        src = next(m for m in xai["models"] if m["id"] == "grok-4.6")
        new = copy.deepcopy(src); new["id"] = "grok-4.7"; new["name"] = "Grok 4.7"
        xai["models"].insert(xai["models"].index(src) + 1, new)
        plan.append("ADD   provider xai: grok-4.7")

# B. modelPolicy.allow
allow = cfg["agents"]["defaults"].get("modelPolicy", {}).get("allow")
if not isinstance(allow, list):
    errs.append("agents.defaults.modelPolicy.allow missing")
else:
    for want in ("xai/grok-4.7", "xai/*"):
        if want in allow: plan.append(f"SKIP  allow: {want} present")
        elif "xai/grok-4.6" not in allow: errs.append("anchor xai/grok-4.6 not in allow")
        else:
            allow.insert(allow.index("xai/grok-4.6") + 1, want)
            plan.append(f"ADD   allow: {want}")

def models_of(agent):
    node = cfg["agents"]["defaults"] if agent == "defaults" else cfg["agents"]["entries"].get(agent)
    return node.setdefault("models", {}) if isinstance(node, dict) else None

# C. alias moves — expected-current values come from this file, not the main one
for agent, key, old, new in [
    ("defaults", "xai/grok-4.6",        "Grok", "grok46"),
    ("defaults", "openai/gpt-5.6-luna", "luna", "luna56"),
]:
    ms = models_of(agent)
    if ms is None: errs.append(f"agent {agent} missing"); continue
    e = ms.get(key)
    if e is None: errs.append(f"{agent}.{key} missing"); continue
    cur = e.get("alias")
    if cur == new: plan.append(f"SKIP  {agent}.{key} alias already {new!r}")
    elif cur == old:
        e["alias"] = new; plan.append(f"ALIAS {agent}.{key}: {old!r} -> {new!r}")
    else: errs.append(f"{agent}.{key} alias is {cur!r}, expected {old!r}")

# D. additions. "astra" is the proven in-worker precedent for a codex-runtime
#    GPT-6 model, so sol/luna are wired exactly like it.
for agent, key, entry in [
    ("defaults", "xai/grok-4.7",      {"agentRuntime": {"id": "openclaw"}, "alias": "Grok"}),
    ("defaults", "openai/gpt-6-luna", {"alias": "luna", "params": {"thinking": "xhigh"}, "agentRuntime": {"id": "codex"}}),
    ("defaults", "openai/gpt-6-sol",  {"alias": "vcodex", "params": {"thinking": "medium"}, "agentRuntime": {"id": "codex"}}),
    ("makaron",  "openai/gpt-6-luna", {"alias": "luna", "params": {"thinking": "xhigh"}, "agentRuntime": {"id": "codex"}}),
    ("makaron",  "openai/gpt-6-sol",  {"alias": "vcodex", "params": {"thinking": "medium"}, "agentRuntime": {"id": "codex"}}),
]:
    ms = models_of(agent)
    if ms is None: errs.append(f"agent {agent} missing"); continue
    if key in ms: plan.append(f"SKIP  {agent}.{key} present ({json.dumps(ms[key],ensure_ascii=False)})")
    else:
        ms[key] = entry; plan.append(f"ADD   {agent}.{key} = {json.dumps(entry,ensure_ascii=False)}")

# invariants
def allowed(m): return any(a == m or (a.endswith("/*") and m.startswith(a[:-1])) for a in (allow or []))
for m in ("xai/grok-4.7", "openai/gpt-6-sol", "openai/gpt-6-luna"):
    if not allowed(m): errs.append(f"{m} not permitted by modelPolicy.allow")
for agent in ("defaults", "makaron"):
    seen = {}
    for k, v in (models_of(agent) or {}).items():
        a = v.get("alias") if isinstance(v, dict) else None
        if a: seen.setdefault(a.lower(), []).append(k)
    for a, ks in seen.items():
        if len(ks) > 1: errs.append(f"{agent}: alias {a!r} maps to {ks}")

print("--- PLAN ---")
for p in plan: print(" ", p)
if errs:
    print("--- BLOCKED ---")
    for e in errs: print("  !", e)
    sys.exit(2)
if not APPLY: print("--- dry run ---"); sys.exit(0)
json.dump(cfg, open(CFG, "w"), ensure_ascii=False, indent=2)
print("--- WRITTEN ---")
