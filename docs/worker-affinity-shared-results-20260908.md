# Shared VLab Worker affinity: acceptance stopped

## Status

2026-09-08 17:09 CST: **not accepted, not released to production**. Candidate runtime source `e69dd8ee3ea7c6cd644a4e0ceec924ee0733e194`; affinity patch integration commit `924a36d49697a07e1f7beb40f50e858a6a75035d`.

Exclusive shared integration lease and explicit handoff were obtained. Existing full shared Makaron Agent database was used (A 2,569,568,256 bytes; B 2,574,585,856 bytes). This was not a new copy of the larger production database. Identical temporary profile: two Workers, three slots each, main concurrency five; CPU/memory cgroup limits unchanged. Real DeepSeek v4 Pro, native Worker chat, actual Hosted Universal Memory health tool.

## Results and failure

- A: 95/95 verified native replies, including 41 real health tool calls and ten C5 rounds (five greeting, five tool rounds).
- A first-text median/p95/max ms: cold 18117/18510/18510 (n=5); revisit 12967/14977/14977 (n=5); serial warm 2296/5445/5484 (n=30); C5 6763/12133/14862 (n=50).
- B: 11 verified requests, then stopped on request 12 `AFF_1788858161158_11`. Its previous turn actually called the health tool successfully; this turn produced a visible “检查完成” with **no tool call**. It was not counted as a successful tool request or latency win. No conclusion that affinity caused this model behavior.
- B first three valid revisit first-text samples: 6167, 6107, 6818 ms. Incomplete sample; do not present as full acceptance or matched p95 improvement.
- B serial/C5 and A2 were not run after failure. The full A/B/A gate remains unmet.
- Shared runtime had an unused observer helper but not active bundle/prompt instrumentation. Stage fields in the evidence are absent, not zero; no model-before latency claim can be made from this matrix. Future rerun must verify active stage output before starting.
- Dynamic memory, policy/tool invalidation and channel receive-to-visible-reply gates remain unaccepted here.

## Restoration and handoff

After verifying zero active/pending requests, stopped only shared unit, restored exact original pool SHA `edd2f3fcfc344f80b2f905763e0c2e2ba31d167f5d8d512746693277853e8ea8` and config SHA `8779cc8eb5728272876ecfbbd0336b40c64d5da989ab326bf655cbaa7e4282de`. Removed only this task's affinity opt-in drop-in. Shared Gateway restarted PID 1700297, HTTP health passed, original-profile Worker ready and idle. Integration lease released, coordinator notified. Test transcripts and evidence retained. No other instance or production runtime changed.

## Next valid test

Use a uniquely identified explicit fresh-call request (do not relax real tool-result verification); establish baseline behavior on repeated calls before attributing skipped calls to scheduling. Re-enable and verify pure stage instrumentation symmetrically for A/B/A, then complete the matrix and original safety/channel gates before release.
