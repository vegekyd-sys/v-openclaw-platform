#!/usr/bin/env python3
"""Add grok-4.7 / gpt-6-sol / gpt-6-luna to V and move the /grok, /vcodex, /luna
aliases onto them. Shape-gated and idempotent: every edit is planned and
validated before anything is written, and legacy models keep a *56/*46 alias so
a rollback is an alias swap rather than a restore."""
import json, sys, copy

CFG = sys.argv[1]
APPLY = "--apply" in sys.argv

cfg = json.load(open(CFG))
plan, errs = [], []

def need(cond, msg):
    if not cond: errs.append(msg)
    return cond

# ---------- A. xai provider: add grok-4.7 cloned from grok-4.6 ----------
xai = cfg.get("models", {}).get("providers", {}).get("xai")
if need(isinstance(xai, dict) and isinstance(xai.get("models"), list),
        "models.providers.xai.models[] missing or wrong shape"):
    ids = [m.get("id") for m in xai["models"]]
    if "grok-4.7" in ids:
        plan.append("SKIP  provider xai: grok-4.7 already present")
    elif need("grok-4.6" in ids, "xai provider has no grok-4.6 to clone"):
        src = next(m for m in xai["models"] if m.get("id") == "grok-4.6")
        new = copy.deepcopy(src); new["id"] = "grok-4.7"; new["name"] = "Grok 4.7"
        xai["models"].insert(xai["models"].index(src) + 1, new)
        plan.append(f"ADD   provider xai: grok-4.7 (cloned from grok-4.6: {json.dumps(new, ensure_ascii=False)})")

# ---------- B/C. agent model entries ----------
# (agent, model key, expected-current-alias, new-alias, new-runtime or None)
ALIAS_MOVES = [
    ("defaults", "xai/grok-4.6",        "Grok",   "grok46",   None),
    ("defaults", "openai/gpt-5.6-luna", "luna",   "luna56",   None),
    ("defaults", "openai/gpt-5.6-sol",  "vcodex", "vcodex56", None),
    ("defaults", "openai/gpt-6-sol",    "sol6",   "vcodex",   "codex"),
    ("makaron",  "openai/gpt-5.6-sol",  "vcodex", "vcodex56", None),
    ("makaron",  "openai/gpt-6-sol",    "sol6",   "vcodex",   "codex"),
]
# (agent, model key, entry)
ADDITIONS = [
    ("defaults", "xai/grok-4.7",       {"agentRuntime": {"id": "vlab-worker"}, "alias": "Grok"}),
    ("defaults", "openai/gpt-6-luna",  {"alias": "luna", "params": {"thinking": "xhigh"}, "agentRuntime": {"id": "codex"}}),
    ("makaron",  "openai/gpt-6-luna",  {"alias": "luna", "params": {"thinking": "xhigh"}, "agentRuntime": {"id": "codex"}}),
]

def models_of(agent):
    node = cfg["agents"]["defaults"] if agent == "defaults" else cfg["agents"]["entries"].get(agent)
    if not isinstance(node, dict): return None
    return node.setdefault("models", {})

for agent, key, old, new, runtime in ALIAS_MOVES:
    ms = models_of(agent)
    if not need(ms is not None, f"agent {agent} not found"): continue
    e = ms.get(key)
    if e is None:
        errs.append(f"{agent}.{key} missing — refusing to guess"); continue
    cur = e.get("alias")
    if cur == new:
        plan.append(f"SKIP  {agent}.{key}: alias already {new!r}")
    elif cur == old:
        e["alias"] = new
        plan.append(f"ALIAS {agent}.{key}: {old!r} -> {new!r}")
    else:
        errs.append(f"{agent}.{key} alias is {cur!r}, expected {old!r} or {new!r}")
    if runtime:
        rt = e.get("agentRuntime", {}).get("id")
        if rt == runtime:
            plan.append(f"SKIP  {agent}.{key}: runtime already {runtime!r}")
        else:
            e["agentRuntime"] = {"id": runtime}
            plan.append(f"RUNTM {agent}.{key}: {rt!r} -> {runtime!r}")

for agent, key, entry in ADDITIONS:
    ms = models_of(agent)
    if not need(ms is not None, f"agent {agent} not found"): continue
    if key in ms:
        plan.append(f"SKIP  {agent}.{key}: already configured ({json.dumps(ms[key], ensure_ascii=False)})")
    else:
        ms[key] = entry
        plan.append(f"ADD   {agent}.{key} = {json.dumps(entry, ensure_ascii=False)}")

# ---------- invariants ----------
for agent in ("defaults", "makaron"):
    ms = models_of(agent) or {}
    seen = {}
    for k, v in ms.items():
        a = v.get("alias") if isinstance(v, dict) else None
        if a:
            seen.setdefault(a.lower(), []).append(k)
    for a, ks in seen.items():
        if len(ks) > 1: errs.append(f"{agent}: alias {a!r} now maps to {ks}")

# grok-4.6 must survive: it is the configured fallback for several agents
for n, node in [("defaults", cfg["agents"]["defaults"])] + list(cfg["agents"].get("entries", {}).items()):
    for fb in (node.get("model") or {}).get("fallbacks", []) or []:
        agent_ms = models_of(n) or {}
        merged = fb in agent_ms or fb in (models_of("defaults") or {})
        if not merged: errs.append(f"{n}: fallback {fb} no longer configured")

print("--- PLAN ---")
for p in plan: print(" ", p)
if errs:
    print("--- BLOCKED ---")
    for e in errs: print("  !", e)
    sys.exit(2)
if not APPLY:
    print("--- dry run, nothing written ---"); sys.exit(0)
json.dump(cfg, open(CFG, "w"), ensure_ascii=False, indent=2)
print("--- WRITTEN ---")
