# Three-fix integrated release — 2026-09-10

Status: pre-deployment regression passed; shared functional acceptance and production promotion pending.

Tianyi authorized these three changes to merge into dev and, after shared VLab verification, promote to V in this thread at 20:56 CST.

Scope:

- Existing concurrency changes through `efa1149c63a6e2c9c349fb34ce8c7e372785340c`, including the not-yet-deployed optional provider surface lookup. The currently running lifecycle version has 186/186 real DeepSeek v4 Pro high-thinking replies, including five waves with 15 overlapping requests. That earlier evidence is not a combined-release acceptance result. Median and send-to-Worker latency still miss two proposed engineering targets; this release makes no claim of eliminating every latency source.
- DeepSeek overflow classification through `a5de684a024df19da9960799ae6b4caceaf19a10`: recognized marker in both AI transport modules, without changing budget or model policy.
- Shared Cron management from exact commits `c5c0238`, `a61174f`, `5ea2e55`, `32ad0e3`, `0f793a6`. Only these commits were cherry-picked; unrelated Night Shift ancestry was excluded. Admitted employees can manage all shared Makaron Cron jobs across groups. Execution ownership and tool caps remain preserved. No person-level owner list.

`lab/three-fixes-release-plan.json` rebases 12 exact code files onto `concurrency-lifecycle-projection-v1`. All seven Cron target hashes match the prior isolated native fixture. Code-only fixtures contain no config, state, credentials or runtime instance.

Pre-merge verification: `CRON_PATCH_BASELINE=.../lab/fixtures/three-fixes-cron-native node --test tests/cron-shared-management/*.test.mjs lab/*.test.mjs lab/shared/files.test.mjs`: 160 tests, 159 passed, zero failed, one native VLab-only WAL test skipped. All 12 release modules passed Node syntax checks. Cron install/idempotence/guarded rollback/exact restoration passed.

Cron activation is a separate, explicit root-owned configuration change, not a runtime/config copy. `lab/configure-three-fixes-cron.mjs` creates an exact policy and service drop-in, no restart. The coordinated release cutover performs restart. Rollback checks exact contents before removing only these newly created files. Existing Gateway/Worker config, credentials and business state remain unchanged.

Required shared acceptance: native WAL test; actual tool and cross-turn continuity; combined 15-concurrent matrix; real overflow/compaction continuation; signed shared-Cron and native persistence. Real external channel evidence must be distinguished from synthetic sender fixtures. Production must use the same tested final code bytes with target-specific configuration and rollback, through Tailscale only.

## Shared integration evidence and discovered availability gap

Deployed commit `f0e084136c93f8343203531e308c69d9ad0b4d0e`, release `three-fixes-20260910-v1`, artifact SHA256 `9812c1f176aa516ec6df07daab5ad26abd8958aae8edf305e58ca1cd3643d6d9`, runtime fingerprint `a58faa76ade5e29eb8ab99b1ea3f29c534f29931813e6d15835fb88bf690a56f`, Gateway PID 1819143. Native startup preflight passed in 120237ms. Gateway config hash unchanged; root-owned shared-Cron policy active. Not yet accepted or promoted.

- Native WAL suite: 14/14 passed, no skips.
- Actual DeepSeek v4 Pro high: one real `session_status` tool/result pair, then exact cross-turn marker recall; both runs terminal/done, no active run or persistence errors. An initial probe was started before readiness and made no chat request; the ready rerun passed.
- New Cron code through actual native tool/identity/handlers/CronService: 12/12 passed in a fresh synthetic non-root, no-network fixture. No business state copy.
- User authorized creation of two private Feishu test groups. Both contain Tianyi and V - Lab. Actual @mention receive, Worker dispatch, and visible reply confirmed. Plain unmentioned messages did not reach the bot under its current event subscription.
- Actual employee-facing tool availability failed: native `agent-tools-djVuP1H1.js` still filters out Automations for `senderIsOwner=false`, unless a separate narrow Cron creator resolver exists. The initial Cron patch tests called the inner factory and therefore missed this outer gate. No test Cron was created during these failed availability checks.

Follow-up candidate `lab/cron-shared-tool-surface-plan.json` changes only the Automations entry in that native denylist when the existing trusted channel principal and operator-managed shared policy enable the same agent. All other owner-only tools and later native authorization checks remain unchanged. Local 11/11 tests pass, with byte-identical restoration outside this gate/import. Full actual native outer tool factory: baseline 28 tools, candidate 29, only addition Automations; disabled policy or missing sender still hides it. Non-root/no-network/no-Gateway/no-model probe passed. This newly discovered follow-up awaits user approval to merge; no production promotion yet.

Overflow harness development: an operator-synthetic injected message is intentionally excluded from model context, so that run did not reproduce overflow and is not acceptance evidence. The revised harness uses actual provider-accepted bulk history; the first bulk-history model turn passed, but the following overflow turn errored. Cause is under investigation; do not call compaction accepted.
