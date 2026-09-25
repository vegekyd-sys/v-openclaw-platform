#!/usr/bin/env python3
"""Put /vcodex and /luna back on the 5.6 models and drop every GPT-6 Sol/Luna
entry. Neither can work on 2026.9.1: the embedded path rejects them
(upstream #155937) and a synthetic codex ref is refused as Unknown model
because openai has no authored provider to host it (#156193 says authoring one
would break the whole Codex harness). Grok 4.7 is untouched -- it works.

Aliases merge from agents.defaults into each agent, so invariants are checked
on the merged view. The two config files have different baselines: the worker
config never exposed /vcodex (its gpt-5.6-sol alias is openai-gpt5.6), so the
alias restore is applied only where the expected prior value is found.

Idempotent and shape-gated."""
import json, sys

CFG = sys.argv[1]; APPLY = "--apply" in sys.argv
cfg = json.load(open(CFG)); plan, errs = [], []

DROP = ("openai/vcodex-gpt-6-sol", "openai/vluna-gpt-6-luna",
        "openai/gpt-6-sol", "openai/gpt-6-luna")
RESTORE = [("openai/gpt-5.6-sol", "vcodex56", "vcodex"),
           ("openai/gpt-5.6-luna", "luna56", "luna")]

def models_of(agent):
    node = cfg["agents"]["defaults"] if agent == "defaults" else cfg["agents"].get("entries", {}).get(agent)
    return node.setdefault("models", {}) if isinstance(node, dict) else None

for agent in ("defaults", "makaron"):
    ms = models_of(agent)
    if ms is None: errs.append(f"agent {agent} missing"); continue
    for key in DROP:
        if key in ms:
            plan.append(f"DROP  {agent}.{key}"); del ms[key]
    for key, old, new in RESTORE:
        e = ms.get(key)
        if e is None: continue                      # not declared at this level
        cur = e.get("alias")
        if cur == new: plan.append(f"SKIP  {agent}.{key} alias already {new!r}")
        elif cur == old:
            e["alias"] = new; plan.append(f"ALIAS {agent}.{key}: {old!r} -> {new!r}")
        else: plan.append(f"KEEP  {agent}.{key} alias {cur!r} (not ours to move)")

# ---- invariants on the merged view ----
for agent in ("defaults", "makaron"):
    merged = dict(models_of("defaults") or {})
    if agent != "defaults":
        merged.update(models_of(agent) or {})
    alias_of = {}
    for k, v in merged.items():
        a = v.get("alias") if isinstance(v, dict) else None
        if a: alias_of.setdefault(a.lower(), []).append(k)
    for a, ks in alias_of.items():
        if len(ks) > 1: errs.append(f"{agent}: alias {a!r} maps to {ks}")
    if any("gpt-6-sol" in k or "gpt-6-luna" in k for k in merged):
        errs.append(f"{agent}: a GPT-6 Sol/Luna ref survived")
    # /grok must still reach 4.7; /vcodex and /luna must reach the 5.6 models
    # wherever the alias exists at all in this file
    for want, expect in (("grok", "xai/grok-4.7"),
                         ("vcodex", "openai/gpt-5.6-sol"),
                         ("luna", "openai/gpt-5.6-luna")):
        got = alias_of.get(want)
        if got and got[0] != expect:
            errs.append(f"{agent}: /{want} -> {got[0]}, expected {expect}")
        if want == "grok" and not got:
            errs.append(f"{agent}: /grok disappeared")

print("--- PLAN ---")
for p in plan: print(" ", p)
print("--- merged aliases after ---")
merged = dict(models_of("defaults") or {}); merged.update(models_of("makaron") or {})
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
