# Configurable Feishu visible-progress runtimes

VLab experiment, 2026-09-17, follow-up to
[`feishu-claude-cli-streaming.md`](./feishu-claude-cli-streaming.md).

## Why not simply delete the allowlist

The hardcoded `['codex','vlab-worker']` list appears at three sites, doing two
different jobs. Deleting it is not "no maintenance for future harnesses", it is
"switch every runtime onto this presentation at once".

| Site | What it actually does | Effect of deleting it |
| --- | --- | --- |
| commentary `push` | Scope limiter. The real safety filter is `kind === 'preamble'` plus a string `progressText` — that is what keeps commands, args, stdout and paths out. | The built-in `openclaw` runtime also emits `kind:"preamble"` (`builtin-openclaw`, from `phase === "commentary"`), so every ordinary conversation would start streaming commentary. |
| `onToolStart` | Presentation switch, not a gate. Listed runtimes get a sanitised status line (`detailMode:"status"`, no args) and `startIfNeeded:true`. Unlisted runtimes take the upstream path: work-tool names only, `detailMode` may include args. | Every runtime moves onto the eager card-creation path. |
| `onCompactionStart` | Only controls `startIfNeeded`. | Same. |

So the list stays; it stops being hardcoded.

## Change

`scripts/apply-feishu-visible-progress-runtimes-patch.mjs`, marker
`feishu-visible-progress-runtimes-v3`. It patches two files that must stay in
lockstep:

- `openclaw.plugin.json` — declares `visibleProgressRuntimes` in
  `channelConfigs.feishu.schema.properties`. That schema is
  `additionalProperties: false`, so an undeclared key does not merely fail
  validation, it stops the Gateway from starting (`78/CONFIG`). The manifest is
  already exactly `JSON.stringify(manifest, null, 2)`, so reserialising it adds
  the key and changes nothing else.
- `dist/monitor.account-*.js` — resolves the list from `account.config`,
  falling back to `['codex','vlab-worker','claude-cli']` when the key is unset,
  not an array, or empty after trimming.

Both edits are planned before either is written, so a bundle that fails its
shape gate cannot leave behind a manifest declaring a key nothing reads.

The final-answer transition (commentary must be retired when the first
final-answer partial arrives, or the two texts concatenate) is scoped to
runtimes that are *not* `codex` or `vlab-worker`. Those two keep their deployed
behaviour byte-for-byte because a Codex run could not be re-validated — that
subscription's quota is exhausted until 2026-09-19.

## Result

Proven from dispatcher instrumentation on the shared VLab mirror, real Feishu
round trips from the owner's account into `VLab 发布验收 A`:

| Config | Probe | Card |
| --- | --- | --- |
| key unset | `runtimes=["codex","vlab-worker","claude-cli"]`, `commentary rt=claude-cli accepted=true` | commentary accumulates, `🛠️ Bash` status line, final answer replaces the body once |
| `["codex","vlab-worker"]` | `runtimes=["codex","vlab-worker"]`, `commentary rt=claude-cli accepted=false` | no commentary; the upstream work-tool status line still renders |

Gateway stayed `NRestarts=0` across every restart; cold start 75-165s.

## A config edit still needs a restart

`channels.feishu` config is captured when the channel starts. `openclaw config
set` says so directly — "Restart the gateway to apply" — and a run taken
immediately after the edit still reported the previous list. Adding a harness is
therefore a config edit plus a Gateway restart, not a bundle patch plus a
restart. The bundle patch is what this change removes; the restart remains.

## Rollback

```bash
cp -a <plugin>/dist/monitor.account-<hash>.js.bak-feishu-visible-progress-runtimes-v3 <plugin>/dist/monitor.account-<hash>.js
cp -a <plugin>/openclaw.plugin.json.bak-feishu-visible-progress-runtimes-v3 <plugin>/openclaw.plugin.json
systemctl restart <gateway service>
```

Roll back both files together. A rolled-back bundle with a patched manifest is
harmless; a rolled-back manifest with a patched bundle is too, since the
resolver falls back to its default — but a config file still naming
`visibleProgressRuntimes` would then stop the Gateway, so unset that key first
if it was ever set.

Known shas:

| File | Pristine | Patched |
| --- | --- | --- |
| manifest (vLab and production are the same file) | `64ae8713cbfe23ef0c2d700d669c450973d09d5764f3b3b287441b0bd885673c` | `483c07a0e1a3e077400d56360f57d40468a400fc0628696d4f536f2cd9b7ddf6` |
| vLab bundle | `b7d3bbb1f7bd29da191670987775daaa3be3728285591a86898400e8c4aa8e63` | `5e4d927cfdc2ae051ef6972b74f039490d988f0121285dd6337c14f4f1ebbe6f` |
| production bundle | `d1ae7eda181500d7cc8dee9009d5290d4c8ff5d598f869a2eaee565e085343ec` | `960696ddab71607f6cb6d9a9694da0177a88c1104e6e9378629db5659b7b950d` |

The production bundle is a different build from vLab's, but carries the same
five expressions, so the patcher applies to it without a rebuild. Verified by a
dry application against a copy of production's bytes.
