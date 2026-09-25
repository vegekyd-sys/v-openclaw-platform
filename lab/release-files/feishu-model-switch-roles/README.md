# Feishu session model switching (candidate)

Scope: users already allowed to message V through Feishu may use `/model` in their own session, including `/model vcodex` and `/model vcc`. No default model, model catalog, agent persona, or non-Feishu channel is changed.

Setting `commands.allowFrom.feishu=["*"]` alone would authorize other command surfaces. The one-file patch narrows non-owner Feishu command admission to a whole-message `/model` prefix. It does not restrict which configured model can be selected. Existing owner authorization and `/new`/`/reset` behavior are preserved. Agent/global model-default writes remain restricted by OpenClaw's existing owner check.

Preflight: resolve the active Gateway runtime and exact `command-auth-*.js` target; confirm the same anchor in VLab and V. Run `patch-runtime.mjs CORE --check` before applying. Apply only to a candidate runtime or under a VLab integration lease with a complete backup. `--apply` must be followed by `node --check` and a repeated `--check` showing `already`. The configuration change must retain the existing `commands.ownerAllowFrom` list and add only `commands.allowFrom.feishu=["*"]`.

Acceptance matrix: a non-owner Feishu sender can get `/model status`, switch to `vds`, `vcc`, and `vcodex` in their own session, and receive a visible response on each selected route; `/restart` and `/config` are not authorized; owner commands still work; ordinary chat and `/new` still work; direct or group conversations cannot modify agent/global defaults. Verify session metadata and runtime/harness, not only the acknowledgment text.

Rollback: restore the exact runtime file and config from pre-change backups. Runtime code and `commands.allowFrom.feishu` are restart-classified in the current runtime; shared VLab also has `reload=off`. Do not claim a hot reload. Production release is gated on actual shared VLab Feishu acceptance.
