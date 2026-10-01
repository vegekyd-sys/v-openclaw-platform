# V Browser plugin 0.4.7 on V — 2026-10-01

Product code lives in `vegekyd-sys/v-browser` (local `~/v-browser`). This page records how V and shared VLab run it.

## Why

2026-10-01 10:32 CST, main DM, Codex harness: every `browser` call after `v_browser_acquire` failed with
`Tool call blocked by PreToolUse hook: OpenClaw tool policy rewrote Codex app-server approval params`.
Plugin 0.4.6 routed by rewriting `browser` params (`profile`, `target`) in `before_tool_call`; the Codex
harness relays that hook through PreToolUse and refuses any rewrite. Worker never goes through that relay.

0.4.7 never rewrites: `v_browser_acquire` returns `browserParams`, the hook passes calls that carry them and
blocks others with the exact parameters. Claude Code's loopback has no `requesterSenderId`, so the owner is
resolved from `commands.ownerAllowFrom` (same rule as v-desktop-handoff).

## What V runs

| | |
|---|---|
| Source | v-browser `main` @ `04f2848` (PR vegekyd-sys/v-browser#3), plugin tree `52fef349` |
| Package | `git archive 04f2848 openclaw-plugin`, gzip sha256 `d65adbcdaa261dc5…` |
| Path | `/opt/v-browser/releases/0.4.7/openclaw-plugin` (root:openclaw, typebox copied from 0.4.6) |
| Config | main `openclaw.json` and Worker `experiments/agent-worker-isolation-v1/worker-openclaw.json`: `plugins.load.paths` 0.4.6 → 0.4.7 via `scripts/replace-openclaw-plugin-release.mjs`. No other key changed. |
| Restart | stop → write both configs → start, 12:47:43 → ready 12:49:57, 31 plugins (same as before), worker pool up, Night Shift resumed |
| Backup | `/home/openclaw/.openclaw/config-backups/v-browser-0.4.7-20261001T124742/` |

Rollback: stop the Gateway, run `replace-openclaw-plugin-release.mjs --from …/0.4.7/openclaw-plugin --to …/0.4.6/openclaw-plugin`
on both configs (or restore the two backup files), start. 0.4.6 stays on disk.

`/opt/v-browser/releases/*` is outside the drift sentinel and `capture-production-runtime.mjs`
(core / worker / Feishu only).

## Shared VLab

Before this release shared VLab could not route V Browser at all (plugin prefix `vlab-`, no browser profiles,
no facade, Broker `server.js` older than V's). `scripts/vlab-v-browser-parity.sh apply` brought it to V's shape:
Broker `server.js` 2544ee7e, standalone nginx facade `100.75.190.64:24901-24916 → 127.0.0.1:23901-23916`
(`v-browser-cdp-facade.service`), relay token drop-in for the shared Gateway, `vbrowser-01..16` profiles and
plugin 0.4.7 in main and Worker config. Backup `shared-workflow/tmp/v-browser-parity-20261001T120601`.
VLab's own Browser Gateway (`openclaw-vlab-browser`, up 18 days) had stopped answering health and was restarted.
Parity is code-only, so VLab stayed ALIGNED; re-aligned 13:11 and the lease released.

## Evidence

**Candidate** (`lab/candidate/v-browser-cross-harness.mjs`, private Gateway + production Broker + real extension):
0.4.7 worker / vds / vcc 3/3, 0 rewrite refusals; baseline (0.4.6 routing) reproduces the production error on vds.

**Shared VLab, real Feishu** (device: `lab/v-browser-acceptance-device.mjs`, one tab per harness, secret only in
the rendered page):

| Harness | Reply | Footer |
|---|---|---|
| worker | `VB_OK VBX-C6BD01DE` = served secret | Runtime: vlab-worker |
| vcodex | `VB_OK VBX-FA41E807` = served secret | gpt-6.1-sol · Runtime: codex |
| vcc | `VB_OK VBX-6F1E52DC` = served secret | claude-opus-5 · Runtime: claude-cli |
| vds | `VB_OK VBX-64498416` = served secret | deepseek-flash · Runtime: codex |

**V, real Feishu, Tianyi's Mac Chrome** (`74bb27fc`, profile `vbrowser-03`): open https://example.com → snapshot → close → release.

| Harness | Chat | Result |
|---|---|---|
| vds | main DM | `VB_OK Example Domain`; Codex transcript: open/snapshot/close all with `profile: vbrowser-03, target: host`, no block |
| vcc | main DM | open, snapshot, close, release all succeeded (page has no h1, the model reported that literally) |
| worker | main DM | same as vcc |
| vcodex | 测试流程 group | `VB_OK Example Domain \| This domai` |

From the 12:49:57 restart: 0 rewrite refusals, 0 route-instruction blocks, 0 identity denials; Broker 6 acquired / 6 released,
activeRoutes 0; no example.com tab left in Chrome. Session models restored (main DM `/vds`).

## Not this release

- Right after the restart every Codex turn failed with `Cannot reap registered Codex process 1732505` until four stale
  `codex/app-server-processes` rows from the old Gateway pid were deleted (12:53). Recurring since 2026-09-25 on most
  restarts; follow-up task opened.
- Some browser actions time out over the extension relay to the Mac (`action=text` with a selector, aria snapshot),
  while default snapshot works. Pre-existing transport behaviour, not routing.
- First vcodex→vds attempt on VLab hit the known session-pinned OpenAI auth profile; used a clean group.
