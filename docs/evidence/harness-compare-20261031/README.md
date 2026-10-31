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
- `v-load-progress.jsonl`, `hc-v.mjs`: stepped load on production V at Tianyi's request, 2026-10-31 23:02–23:26. Do not reuse as is: its gate misses Gateway heap, and its `sessions.delete` cleanup stalled the Gateway (22–30 s per call).
- `profile-progress.jsonl`, `profile-vds-c15.json`: Gateway thread CPU and main-thread profile for one /vds c15 five-step level on a busy VLab, 2026-11-01. The run stopped on host memory before the Worker arm.
