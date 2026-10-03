# Worker config derived from the Gateway config (2026.9.1, Worker plugin 0.2.11)

## Symptom

Worker processes read their own config
(`experiments/agent-worker-isolation-v1/worker-openclaw.json` on V). It was a
hand-copied file and kept drifting from the Gateway's `openclaw.json`:
a model added to `agents.defaults.modelPolicy.allow` on the Gateway is still
rejected inside a Worker with `Model override "<key>" is not allowed`, session
maintenance thresholds differed (the 2026-09-29 write-lock incident), removed
providers and credentials lingered. Every config change had to be applied twice
by hand, with shape-gated scripts, and still needed a restart.

## Structural diff on 2026-10-03 (paths only, no values)

V: 93 differing paths at depth ≤ 3–5, of which 68 remain after the derivation
rules below are applied (all of them drift). Shared VLab: 33 remain.

| Class | Paths (V) | Rule |
|---|---|---|
| (b) intentional overlay | every `agentRuntime.id` under `agents` and `models.providers`: `vlab-worker` on the Gateway, `openclaw` in the Worker (codex / claude-cli unchanged); `session.maintenance.mode = warn` | in code (`WORKER_CONFIG_OVERLAY`, v1) |
| (a) must mirror, missing in Worker | allow `anthropic/claude-opus-5`, `anthropic/claude-opus-5-5`, `deepseek/vds-deepseek-flash`; 7 `agents.defaults.models` entries, 4 makaron, agent `hy-codex`; `modelSelectionScope`; `nightshift-feishu`, `respeaker-agent-bridge`, `xai` plugin entries and the respeaker load path; `secrets.egressProxy`; 4 skills; `gateway.http/nodes/trustedProxies`; `commands.allowFrom`; `ui` | mirror |
| (c) drift in Worker | `azure-openai` provider still on the old endpoint/key with `gpt-5.5`; `imageModel.fallbacks`, Worker fast-compaction model and `llm.allowedModels` still `azure-openai/gpt-5.5`; alias `openai/gpt-5.6-sol` = `openai-gpt5.6` (Gateway `vcodex56`); `auth.profiles["anthropic:claude-cli"]` (not needed, claude-cli synthesizes auth); `session.maintenance.maxEntries` 2000 / no `maxDiskBytes`; `memory-core` dreaming config; msteams credentials; dealclaw name/skills/tools; `bindings` 15 vs 27; `talk.*`; `tools.alsoAllow` order; `browser.extraArgs`; xai `contextWindow` | mirror (drift disappears) |

Shared VLab has two more drift forms that V does not: the Worker copy still
contains Gateway-only `vlab-worker` runtime ids (`deepseek` provider,
`deepseek/deepseek-flash`), and it omits the `vlab-agent-worker-isolation`
plugin entry (V's Worker loads it for the compaction provider and the
`resolve_exec_env` hook). Its maintenance mode is still `enforce`.

Origin: the copy was created by `scripts/activate-agent-worker-production.sh`
(jq: same file, every default model and provider forced to runtime `openclaw`)
and later edited by hand and by per-change scripts
(`apply-v-model-additions-*-worker.py`, `codex-plugins-off`, the 09-29
maintenance hotfix). VLab's copy came from `scripts/stage-production-parity.py`
(clone, map `vlab-worker`→`openclaw`, drop the isolation plugin).
`worker-config-sync.mjs` only ever synced `agents.defaults.compaction`.

## Change

| Target | Before (V = VLab) | After |
|---|---|---|
| `production-worker/index.mjs` | `c047f3df…` | `6624b7ea…` |
| `production-worker/worker-config-derive.mjs` | absent | `b202a9a8…` |

`worker-config-derive.mjs` (pure, tested in
`experiments/agent-worker-isolation-v1/worker-config-derive.test.mjs`):

- Worker config = Gateway config with the overlay applied; everything else is
  mirrored. Secret refs (`${ENV}`, `{source, provider, id}`) are copied as they
  are and never resolved.
- Validated before writing: no `vlab-worker` id left, every Gateway allow entry
  and per-agent model present, isolation plugin still enabled.
- Written only when the parsed content differs; temp file + fsync + rename,
  mode and (as root) owner preserved.
- One log line: overlay version and the changed paths (no values), capped at 25.
- Any failure keeps the existing file, logs `FAILED, kept the existing Worker
  config: …` and returns `{ok:false}`; it never throws. JSON parse errors are
  reduced to a position so a broken file cannot leak a secret into the log.

`index.mjs`: the compaction-only sync call is replaced by the derivation; it
runs only in the Gateway (skipped when `VLAB_WORKER_CHILD=1`). The status RPC
field `configDomainIsolation.runtimePolicySync` now carries the derivation
result. Every Worker spawned after `register()` reads the derived file;
`deriveWorkerConfigFile({gatewayConfigPath, workerConfigPath, logger})` can be
called again at any time (e.g. before a rolling Worker generation spawns).

Rebuild: `node lab/build-worker-config-derive.mjs [--verify-vlab]`.

## Acceptance

Candidate: `lab/candidate/worker-config-derive.plan.json` and the unpatched
`…-baseline.plan.json` (must reproduce the rejection). The probe derives the
real shared-VLab config in memory (validation, allow coverage), then boots a
private Gateway whose Worker config lacks one Gateway-allowed model and runs a
real DeepSeek turn overriding to that model.

Result 2026-10-03 (VLab host, base `feishu-ask-chat-answer-v1`, shared Gateway
untouched):

| Run | Receipt | Outcome |
|---|---|---|
| patched | `candidate-b96953a6…` | static: 0 problems, all 20 Gateway allow entries kept, 0 `vlab-worker` ids left; Gateway log `rewrote Worker config, 2 changed path(s): agents.defaults.modelPolicy.allow, agents.defaults.models["deepseek/deepseek-v4-pro"]`, file equals the derivation, mode 0640 kept, no temp file; Worker `[vlab-worker:0]` ran `deepseek-v4-pro`, reply `收到`, exit 0; Worker child did not rewrite the file |
| unpatched | `candidate-416bef73…` | stale file kept; turn rejected with `is not allowed for agent`, exit 1, no Worker log |

Not covered: V's full plugin set in the private Gateway (the probe keeps only
the Worker plugin and DeepSeek, and drops codex / claude-cli models so the
Gateway does not try to install their plugins), channels, and V's Worker
count.

## Deployment notes

The first Gateway start with this release rewrites V's Worker config (68 paths
above). Before promotion, review that list; to roll back restore the
`index.mjs` hash above, remove `worker-config-derive.mjs`, and restore the
Worker config from the backup the promotion takes. Hand edits to the Worker
config are overwritten from now on: change the Gateway config, or the overlay.
