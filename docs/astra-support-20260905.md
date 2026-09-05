# Historical Astra setup notes — superseded

**2026-09-05 14:28 update: both runtime paths now passed real model/tool execution.**
Use [astra-accepted-20260905.md](astra-accepted-20260905.md) for current status,
candidate versions, evidence and production rollback. The sections below preserve
the earlier failed/held state and are not the current deployment instructions.

## Current outcome

- Production V: no configuration, runtime, credential, or service writes.
- VLab: additive Astra policy, dual-route recognition, subscription model
  materialization, and Worker harness manifest ownership installed with backups.
- Both intended runtime selections can now be admitted in isolated test sessions.
- This is **not model execution acceptance**. No Astra tool/streaming success yet.
- Latest Codex probe reached the provider and returned HTTP 400:
  `The 'gpt-6-astra' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.`
- Running bundled CLI is 0.152.1. Codex 0.153.4 is now installed side by side at
  `/opt/vlab/codex-0.153.4`; its native binary reports `codex-cli 0.153.4`.
  OpenClaw's command override has **not** been switched, and model execution
  with the new binary is **not yet tested**, pending the Worker acceptance window.
  Installation used the exact official npm package with a dedicated npm cache,
  `--ignore-scripts --no-audit --no-fund`; no shared npm ownership was changed.
- VLab makaron's auth fixture is stale (legacy openai-codex identity, no current
  openai OAuth profile). VLab v-codex has a current openai OAuth profile.
  Production makaron and v-codex have current openai OAuth profiles. No credentials
  were copied, printed, or changed by this work.

## Coordination hold

The thread `修复 Worker 参数透传与语音发送`
(`01a06fbe-7654-7331-8d6e-73a8cd2dcd7e`) requested the exclusive VLab restart window
for user-approved Worker acceptance. Astra probes, config writes, and restarts
are paused; there are no unfinished Astra model runs. Do not touch its candidate
`/opt/vlab/experiments/worker-native-parity-v1`.

Read-only inspection also found VLab v-codex's primary became Astra during concurrent
work. This patch does not change primary/default models. Preserve intervening
changes; do not restore whole config snapshots.

## Patches and rollback

Worktree: `v-openclaw-platform-astra`, branch `codex/gpt6-astra-support`.

- `scripts/astra-model-policy.mjs`: add exact Astra policy to defaults
  (outer Worker, inner openclaw) and v-codex (codex). No primary model changes.
- `scripts/patch-openclaw91-astra.mjs`: fail-closed, idempotent native bundle patch.
  Adds exact Astra dual-route identity, supported reasoning efforts, subscription
  Responses model materialization, and Worker `activation.onAgentHarnesses`.
  It does not force account availability or bypass provider model access controls.
- `scripts/vlab91-astra-probe.mjs`: unique isolated session, native sessions.patch
  then chat.send; checks actual runtime/model and final tool-result markers.
  Provider/model overrides through generic agent RPC are intentionally not used:
  that caller is not authorized for direct overrides.
- Five local unit tests passed. Integration probes remain failed/not accepted.

Candidate root:
`/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902`.

Backups beneath its `backups/`:

- `astra-model-policy-20260905` — config policies; rollback is scoped and refuses
  concurrent Astra edits, retaining unrelated config changes.
- `astra-native-contract-20260905` — dual-route module and old Worker manifest.
- `astra-subscription-provider-20260905` — subscription provider model resolver.

Use the corresponding patch script's `rollback` action, then restart only within
the allocated Lab window. Native rollback checks current content before restoring.

## Next bounded step after the window is returned

1. Codex 0.153.4 installation is complete; retain bundled 0.152.1 for rollback.
   Native binary: `/opt/vlab/codex-0.153.4/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex`.
2. Use supported `plugins.entries.codex.config.appServer.command` override;
   no global PATH replacement or OpenClaw upgrade.
3. Run one Codex Astra tool probe. If backend denies account access, stop and
   report the actual error; do not pretend catalog availability is acceptance.
4. Repair only the Lab test auth fixture via native auth/profile mechanisms, or
   use a separately scoped native Worker test profile. Do not rotate production
   credentials or globally change auth order.
5. Validate native Worker Astra tool execution, then real Feishu streaming,
   completion, and existing-model nonregression. Confirm exact model, not fallback.
6. Only promote the proven minimal candidate to V, leaving current defaults intact
   and preserving existing display/Worker patches. Do not promote this intermediate
   state merely because the model picker lists Astra.

Official guidance: https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra
and https://learn.chatgpt.com/docs/models . Tool calling uses Responses;
temperature/top_p/logprobs are not supported. Current candidate constrains test
reasoning to low and preserves a conservative 272k operational context budget.
