# Background work release, 2026-10-02

Two shared-VLab releases, then one promotion to V.

## 1. `vlab-codex-parity-20261002` (VLab only)

Shared VLab's Codex plugin (`npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2`)
lacked the `/vds` DeepSeek patches V carries in three files, which is why `/vds`
answered 401 on VLab. The VLab↔V parity check covers core, worker and Feishu,
not this npm project, so the drift went unnoticed.

`vlab-codex-parity/` holds V's live bytes of those three files (read from V on
2026-10-02 02:20 CST). V already has them: this release ends in accept + align,
not in a promotion. Plan: `vlab-codex-parity.plan.json`.

| File | VLab before | V (after) |
| --- | --- | --- |
| `harness-DXVZ5II5.js` | `9eff1736…` | `2903634b…` |
| `run-attempt-D1hJO4fX.js` | `1f6ab7d5…` | `694e3817…` |
| `thread-lifecycle-DAcEJ_Om.js` | `739b39f7…` | `0e575c99…` |

## 2. `background-work-20261002` (VLab, then V)

Every `before` is V's live bytes. Plan: `background-work.plan.json`.

- Background-work line on the Feishu card: `lab/release-files/feishu-task-status/`
  (core `task-registry-activity`, core `task-registry.store.sqlite`, Feishu
  `monitor.account`). See `docs/experiments/feishu-task-status.md`.
- Codex native subagents keep their tool relay and wake the parent:
  `codex-native-subagent/` = `lab/release-files/codex-native-subagent/patch-codex-native-subagent.mjs`
  applied to V's live bytes (codex `thread-lifecycle`, core `subagent-registry`,
  core `plugin-sdk/agent-harness-task-runtime`). See that directory's README.

`scripts/promote-to-v.mjs` maps the Codex plugin target to
`/home/openclaw/.openclaw/npm/projects/<same project>/…` on V. All files load at
Gateway start: V needs a restart. The npm-managed Codex project is not part of
the V recapture or the drift sentinel; reinstalling or upgrading that plugin
drops both the `/vds` patches and this fix.
