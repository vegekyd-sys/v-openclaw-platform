# Harness comparison, 2026-10-31

Worker (`deepseek/deepseek-flash`) against Codex (`/vds`), measured with
`lab/candidate/runtime-concurrency.mjs` in VLab candidates. Plans sit in
`lab/candidate/harness-*-20261031.plan.json`.

- `run1-progress.jsonl`, `run2-progress.jsonl`: concurrency levels 1/5/15/30 and 1/5/15.
- `scenarios-progress.jsonl`: default model set to `/vds`; inheritance and upstream faults.
- `recovery-progress.jsonl`: next turn after a fallback, at 0, 30 and 120 s.
- `channel-gray-progress.jsonl`: `channels.modelByChannel` through the webchat wildcard.
- `v-serial-multi.jsonl`: sequential five-step turns on production V in a test group.

VLab has 4 cores and other jobs ran on it during the tests; V has 16. These results show mechanism,
not production gain. Session content was removed from `failed-turn` records.
- `v-staged-20261101/`: production V, split into stages, before and after the `hooks relay` fast path, 2026-11-01 12:21-12:38 and 13:15-13:32 CST, at Tianyi's request. `hc-v2.mjs` reuses the hc1031 sessions and deletes none. The "after" Codex c15 round 2 ran under the Gateway CPU profile summarized in `gateway-profile-summary.txt`; the raw profile was deleted from V.
