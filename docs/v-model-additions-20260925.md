# Adding Grok 4.7, GPT-6 Sol and GPT-6 Luna to V (2026-09-25)

## Result

| Alias | Model | Auth | Verified |
|---|---|---|---|
| `/grok` | `xai/grok-4.7` | xAI subscription (auth-profile) | yes — live turn through OpenClaw |
| `/vcodex` | `openai/gpt-6-sol` | ChatGPT subscription via `codex` runtime | config only, see below |
| `/luna` | `openai/gpt-6-luna` | ChatGPT subscription via `codex` runtime | config only, see below |

Legacy models stay reachable so a rollback is an alias swap, not a restore:
`/grok46`, `/vcodex56`, `/luna56`.

## What had been blocking Sol and Luna

Two independent gates, both cleared before this change:

1. The hosted model catalog was generated 2026-09-18 and the models shipped
   2026-09-22, so OpenClaw reported `Unknown model`. Upstream
   [#156122](https://github.com/openclaw/openclaw/issues/156122) closed
   2026-09-23, superseded by
   [PR #155989](https://github.com/openclaw/openclaw/pull/155989). The catalog
   now carries both with full metadata.
2. The account has to serve them. `codex debug models` on V lists
   `gpt-6-sol` and `gpt-6-luna`.

The embedded runtime still rejects both —
[#155937](https://github.com/openclaw/openclaw/issues/155937), open. Measured on
V: over the embedded path `gpt-6-astra` and `gpt-5.6-sol` answer while
`gpt-6-sol` and `gpt-6-luna` both fail with
`Explicit auth order for openai has no usable profiles`. That also verifies the
"Luna needs verification" line in that issue's title: Luna fails exactly like
Sol. So both must be bound to `agentRuntime: {id: "codex"}`, mirroring the
already-proven `/astra` wiring.

Watch [#156491](https://github.com/openclaw/openclaw/issues/156491) (open):
codex-native GPT-6 can fail on a *cold* first turn. One failure right after a
restart is not proof the wiring is wrong.

## Two config files, not one

`agentRuntime=vlab-worker` models are resolved inside the worker process, which
loads its own config. Patching only the gateway's config leaves the worker
rejecting the model while `openclaw models list` happily shows it as available.
See `scripts/apply-v-model-additions-20260925-worker.py` and the memory note
`v-worker-config-second-file`.

```
gateway  /home/openclaw/.openclaw/openclaw.json
worker   /home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json
```

The two files are not copies of each other: the worker spells the embedded
runtime `openclaw` where the gateway spells it `vlab-worker`, and the alias sets
differ. Mirror by meaning, never by diff.

## Applying

Each script dry-runs by default, is shape-gated (it refuses rather than guesses
when a value is not what it expects) and is idempotent.

```bash
M=/home/openclaw/.openclaw/openclaw.json
W=/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json
sudo -u openclaw cp -a "$M" "$M.bak-$(date +%Y%m%d-%H%M%S)"
sudo -u openclaw cp -a "$W" "$W.bak-$(date +%Y%m%d-%H%M%S)"
sudo -u openclaw python3 apply-v-model-additions-20260925-main.py   "$M" --apply
sudo -u openclaw python3 apply-v-model-additions-20260925-policy.py "$M" --apply
sudo -u openclaw python3 apply-v-model-additions-20260925-worker.py "$W" --apply
sudo -u openclaw openclaw config validate
sudo systemctl restart openclaw-gateway
```

A restart is required, not optional: a config hot reload tears down the worker
pool without rebuilding it. Confirm `pgrep -cf worker/worker.mjs` is non-zero
afterwards.

## Verifying

`--model <ref>` is only representative for plain API providers such as xAI. It
forces the turn onto the embedded runner and ignores the model entry's
`agentRuntime`, so it can neither confirm nor refute the `codex` and
`claude-cli` harnesses. The CLI does not parse inline model directives either —
`/astra hello` reaches the model as literal text. Alias-to-harness wiring can
only be verified by sending a real channel message.

```bash
# valid for xAI
sudo -u openclaw openclaw agent --agent makaron --model xai/grok-4.7 \
  --session-id probe -m "reply with: ok" --json
# valid for /vcodex and /luna: send them in Feishu
```

Ignore the `available` column for harness-backed models. `openai/gpt-5.6-sol`
— the model `/vcodex` served for months — has always reported
`available=false`; the flag describes direct-provider credentials, not the
harness.
