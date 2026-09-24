# Grok 4.7, GPT-6 Sol and GPT-6 Luna on V (2026-09-25)

## Result

| Alias | Model | Status |
|---|---|---|
| `/grok` | `xai/grok-4.7` | **shipped**, verified with a real Feishu turn |
| `/vcodex` | `openai/gpt-5.6-sol` | unchanged — GPT-6 Sol reverted, see below |
| `/luna` | `openai/gpt-5.6-luna` | unchanged — GPT-6 Luna reverted, see below |

`/grok46` also exists, pointing at the previous `xai/grok-4.6`, which is still
the configured fallback for several agents.

## Grok 4.7

A pure config change. `models.providers.xai` is self-describing (baseUrl, api
and a hand-written `models[]`), so the hosted catalog is not consulted and
4.7 was missing only because nobody had added it to that list. It runs on the
xAI subscription auth profile, like 4.6.

Two gotchas, both of which cost a restart:

1. A new model must also be permitted by `agents.defaults.modelPolicy.allow`.
   The exact key `xai/grok-4.7` is *not* enough — only the `xai/*` wildcard
   admits it, because grok-4.7 exists solely in our authored provider and has
   no hosted-catalog entry to supply the other provider spelling. Scope is
   unchanged in practice: that provider declares a fixed list.
2. The allow list that actually decides lives in the *worker* config. See
   "Two config files" below.

## GPT-6 Sol and Luna: not possible on 2026.9.1

Both preconditions are satisfied — the hosted catalog regenerated on
2026-09-23 (upstream [#156122](https://github.com/openclaw/openclaw/issues/156122),
superseded by [PR #155989](https://github.com/openclaw/openclaw/pull/155989)),
and `codex debug models` on V lists `gpt-6-sol` and `gpt-6-luna` — and it still
cannot work. Three attempts, each ruled out by measurement:

- **Embedded path.** `Explicit auth order for openai has no usable profiles`.
  The models live on the ChatGPT subscription the codex app-server holds, not
  on the openai auth profile. This is
  [#155937](https://github.com/openclaw/openclaw/issues/155937), still open.
  Measured on V: over the same embedded path `gpt-6-astra` and `gpt-5.6-sol`
  answer, while Sol and Luna both fail. That also settles the "Luna needs
  verification" question in that issue's title — Luna fails exactly like Sol.
- **`agentRuntime: {id: "codex"}` on the real ref.** Same failure. Now that the
  catalog carries `openai/gpt-6-sol`, OpenClaw resolves it as a direct
  openai-provider model and fails auth *before* reaching the runtime binding.
  The catalog regeneration that unblocked discovery is what blocks execution.
- **A synthetic ref plus `codexAppServerRuntimeModel`**, the trick that makes
  `/vds` work. Refused: `Unknown model: openai/vcodex-gpt-6-sol`. It does not
  transfer, because `/vds` hangs its synthetic id off the authored
  `models.providers.deepseek`, and openai has no authored provider —
  [#156193](https://github.com/openclaw/openclaw/issues/156193) says authoring
  one would silently disable the Codex harness for every OpenAI model.

The fix is upstream: `4ae133a994f feat(openai): support GPT-6 Sol and Luna
(#155967)`, present in `v2026.9.6` and absent from `v2026.9.5`. It cherry-picks
onto `versa/port-9.5-wip` with no conflicts (20 files, +386/-85), so the work
is gated on the 9.1 → 9.x production upgrade, not on the OpenAI change itself.

Ignore the `available` column when judging any of this. `openai/gpt-5.6-sol` —
the model `/vcodex` serves today — has always reported `available=false`. The
flag describes direct-provider credentials, not the harness.

## Two config files, not one

`agentRuntime=vlab-worker` models are resolved inside the worker process, which
loads its own config. Patch only the gateway's copy and the worker keeps
rejecting the model while `openclaw models list` reports it available — and the
rejection names `agents.defaults.modelPolicy.allow`, a path that exists in both
files, so following the error message leads nowhere.

```
gateway  /home/openclaw/.openclaw/openclaw.json
worker   /home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json
```

They are not copies: the worker spells the embedded runtime `openclaw` where
the gateway spells it `vlab-worker`, and the alias sets differ (`/vcodex` does
not exist in the worker config at all). Mirror by meaning, never by diff.

To tell a stale-config rejection from a genuine policy problem, request a model
that only the *new* entry could admit — after adding `xai/*`, ask for
`xai/grok-4.3`. If that is refused too, the deciding process does not have your
config; go find the other file instead of adding more allow entries.

## Applying

Each script dry-runs by default, is shape-gated and is idempotent.

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

The main and worker scripts still carry the GPT-6 wiring; on 2026.9.1 follow
them with `revert-gpt6-aliases.py` against both files, which drops every GPT-6
Sol/Luna ref and returns `/vcodex` and `/luna` to the 5.6 models. After the
upgrade to a release containing #155967, skip the revert instead.

A restart is required, not optional: a config hot reload tears down the worker
pool without rebuilding it. Confirm `pgrep -cf worker/worker.mjs` afterwards.

## Verifying

`--model <ref>` is only representative for plain API providers such as xAI. It
forces the turn onto the embedded runner and ignores the entry's
`agentRuntime`, so it can neither confirm nor refute the `codex` and
`claude-cli` harnesses. The CLI does not parse inline model directives either —
`/astra hello` reaches the model as literal text, because `extractModelDirective`
only receives the alias list on the channel reply path. Alias-to-harness wiring
can only be verified by sending a real channel message; the reply card names the
model, provider and runtime that actually served the turn.
