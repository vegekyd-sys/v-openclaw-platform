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
