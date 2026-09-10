# DeepSeek budget exhaustion and native compaction

Status: local regression passed; shared Gateway acceptance and production promotion pending.

The imported DeepSeek output-budget guard emits a localized error with code
`V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED`. Native overflow recovery classifies
`errorMessage`, including across the Worker/Gateway boundary. The localized
message was not recognized and fell through into silent-error retries. Multiple
outer and inner retries could produce sixteen failed attempts without compaction.

The patch adds the established `Context overflow:` marker and the existing
structured code to the message in both AI transport entry points. Budget
estimation, output caps, model selection, history, and tool replay policies are
unchanged. This is a shared runtime fix, not a per-session repair.

Validation:

- Imported the current shared VLab `classify-Dm9sTbZz.js` in a standalone Node
  process: `isLikelyContextOverflowError(oldMessage) === false`, patched === true.
- `node --test lab/deepseek-compaction-contract.test.mjs`: five tests pass.
- Both generated transport modules pass `node --check`.
- Native recovery fixture follows compact -> owned transcript retry -> compacted
  transcript continuation, with settled tool metadata present; cancellation does
  not start recovery. The compactor is mocked in this regression, so this does
  not establish real summary quality or Gateway end-to-end acceptance.

Files: `lab/deepseek-compaction-plan.json` records exact target hashes and base
release. `lab/build-deepseek-compaction-contract.mjs` regenerates code-only
artifacts from read-code and refuses changed patch anchors. Never run it to
modify live runtime. Before deployment recheck release and target hashes, then
package the tested canonical dev commit through vlab.mjs.

Shared acceptance must reproduce budget rejection in a dedicated no-delivery
session, observe actual auto-compaction and a final answer, and check that a
settled tool action is not repeated. Also test a normal short conversation.
The current integration lease belongs to the separate database contention task;
do not stage, deploy, or run shared tests until that owner explicitly hands off.

Rollback uses the vlab release receipt to restore both target files. No database
migration, configuration change, or history deletion is part of this patch.
This patch does not fix database locking or change the conservative budget
estimator. A real compaction failure still needs its own cause-specific handling.
