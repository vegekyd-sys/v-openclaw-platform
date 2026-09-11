# Final VLab Native candidate

This candidate consolidates the last VLab-only validation before a separate production decision.

## Included

- existing deployed Native session-scan and System Agent Flash routing fixes;
- Feishu pending-delivery presentation suppression for both direct messages and groups;
- bounded Memory vector chunks and a 25-second total `memory_search` deadline;
- an all-Native VLab configuration with the Worker configuration retained byte-for-byte for rollback.

The code overlay contains only the three files listed in
`lab/native-final-vlab-candidate-plan.json`. The Native configuration switch is
separate from the code release and uses a fresh private evidence directory via
`VLAB_NATIVE_ROLLOUT_ID`.

## Excluded

- Workboard governance;
- cold-start pipeline experiments;
- GPT Live backend delegation;
- production-only rollout helpers and all unrelated historical branches.

## Gates

- merged local unit and artifact tests, plus the runtime-pinned Native session scan test;
- release/config fingerprint verification and a usable Worker rollback backup;
- Memory search/get, System Agent routing, Feishu delivery lifecycle, session continuity and tool inventory regressions;
- final Native C15 short and long real-tool workloads with persistence, process independence, HTTP/RPC health and resource checks;
- real Feishu and web process-streaming evidence where the configured integration surfaces permit it.

Passing VLab is evidence for a later production decision. It does not deploy to production.
