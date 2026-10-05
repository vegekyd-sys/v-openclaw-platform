# v-experience-channels — release bytes for the multi-channel experience

Built 2026-10-05 from shared VLab's runtime while it was ALIGNED with V
(`placement-evidence-20261005-b`), i.e. from V's own bytes, by applying the
patches from dev 6ad1c51a (#190):

- `apps/v-experience/telegram/patch.mjs` on `openclaw/dist`
- `lab/release-files/feishu-model-switch-roles/patch-runtime.mjs --apply` (command-auth V3)
- `patchSecretEntryChannelsSource` from `lab/release-files/feishu-secret-entry/` (channels-v1) on the builtin chunk
- `apps/v-experience/dingtalk/patch.mjs` on the DingTalk connector 0.8.26 `dist`
- `apps/v-experience/wecom/patch.mjs` on the WeCom plugin 2026.8.17-vlab.2 `dist/src`

`manifest.json` lists every changed or new file with its component, path, and
the sha256 before (V's bytes; null for new files) and after. Rebuild from V's
live bytes if any `before` no longer matches.
