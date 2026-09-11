# Main-DM delivery-notice race VLab acceptance

Date: 2026-09-11

## Candidate

- Task branch: `codex/dm-delivery-notice-race-20260911`
- Runtime source commit: `177de6ab8078a1f41105bd20e688cf977202f003`
- VLab release: `dm-delivery-notice-race-20260911-v1`
- Artifact SHA-256: `3080193b3a708571ecdeb27a0be0e4ab2b820d8b7826a8e57fbd19b7eaef2b41`
- Parent release: `system-agent-flash-20260911-v2`
- Configuration SHA-256 remained `15c33fa9285735c591db7bfeaae2a9c89c685c30824fd0b16c1a4356d4747f3d`
- State was preserved by the deployment workflow.

## Exact runtime files

- `openclaw/dist/delivery-completion-Do3nBV6b.js`: `d223a342ad217203dacac3fb6fc87b28e853b6f6f1afa0673e177cca1f1322d1`
- `openclaw/dist/lifecycle-YRwzpo9_.js`: `0f7c0f780f73992a2e1bd521833e23738a497f768dd1efdd3358b84bebe291a0`

Both post-deploy hashes matched the staged artifact.

## Regression and functional evidence

- Merged `dev` tests: 18/18 passed. This includes seven exact-bundle regression tests and eleven VLab workflow/configuration tests.
- Exact generated state-machine test proved that `queued -> unknown` creates no notice debt, then successful settlement reaches `delivered` with no notice. An affirmed `unknown -> unknown` still creates internal ambiguity debt.
- Exact generated Feishu-DM handler test proved that real ambiguity becomes `unresolved` without calling the external notice sender or appending the English text to the transcript.
- Actual post-deploy Gateway session: `agent:makaron:explicit:vlab-dev-dm-delivery-notice-race-20260911-1789105055272`.
- Run `dm-notice-postdeploy-1` called `session_status` exactly once and returned `VLAB_DM_NOTICE_OK_1`.
- Run `dm-notice-postdeploy-2` reused the same session and returned `VLAB_DM_NOTICE_OK_2`.
- Projected history contained six messages, one tool call, one successful tool result, both expected markers, zero copies of the unwanted English notice, zero pending inputs, and terminal session status `done`.
- Read-only SQLite verification showed `status=done`, `pendingDeliveryNotice=NULL`, and `pendingFinalDelivery=NULL` for the acceptance session.
- Worker status after the runs: pending 0; native harness admitted/completed 2/2, failed 0, cancelled 0.
- Service was active and the warning-or-higher journal slice since deployment was empty.

## Boundary

The shared VLab intentionally does not connect the production Feishu bot in parallel. The Feishu-specific overlap was therefore validated through deterministic execution of the exact deployed bundle plus the real shared Gateway/model/tool/session path. Production was not changed.
