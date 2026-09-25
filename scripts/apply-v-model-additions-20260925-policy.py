#!/usr/bin/env python3
"""Permit the newly wired xAI model in agents.defaults.modelPolicy.allow.

Both entries are needed. The exact key is the documented form; the xai/*
wildcard is what the gateway's own rejection message recommends and is what
actually admits grok-4.7, because that model exists only in our authored
models.providers.xai list and not in the hosted catalog. gpt-6-sol and
gpt-6-luna need no entry: the list already carries an openai/* wildcard.

Scope is unchanged in practice -- models.providers.xai declares a fixed list.

Usage: apply-v-model-additions-20260925-policy.py <config.json> [--apply]
"""
import json, sys

CFG = sys.argv[1]; APPLY = "--apply" in sys.argv
cfg = json.load(open(CFG))
allow = cfg["agents"]["defaults"].get("modelPolicy", {}).get("allow")
if not isinstance(allow, list):
    print("! agents.defaults.modelPolicy.allow missing or not a list"); sys.exit(2)

anchor = "xai/grok-4.6"
for want in ("xai/grok-4.7", "xai/*"):
    if want in allow:
        print(f"SKIP  {want} already allowed"); continue
    if anchor not in allow:
        print(f"! anchor {anchor} not in allow list -- refusing to guess"); sys.exit(2)
    allow.insert(allow.index(anchor) + 1, want)
    print(f"ADD   {want} (after {anchor})")
    anchor = want

def allowed(m):
    return any(a == m or (a.endswith("/*") and m.startswith(a[:-1])) for a in allow)

for m in ("xai/grok-4.7", "xai/grok-4.6", "openai/gpt-6-sol",
          "openai/gpt-6-luna", "openai/gpt-5.6-sol"):
    print(("OK    " if allowed(m) else "!     ") + m)
    if not allowed(m): sys.exit(2)

print("scope of xai/*:", [m["id"] for m in cfg["models"]["providers"]["xai"]["models"]])
if not APPLY:
    print("--- dry run, nothing written ---"); sys.exit(0)
json.dump(cfg, open(CFG, "w"), ensure_ascii=False, indent=2)
print("--- WRITTEN ---")
