# Feishu conversation phone production receipt — 2026-10-24

Runtime source: dev `888024d1103667bc7df1fecd4e7812b9c9b0f9cf` (PR #464). Voice: main `b0717249e8993e5685301e541b5b5263646a4725` (Voice PR #123), version `voice-feishu-conversations.20261024.1`.

## Verified delivery

- Shared VLab accepted artifact `725278623a1805d5a49ba4a8e8376b12a2984fad935d477bc11fcd45aa7d174f`: real group membership/route, 127 effective native tools, harmless exec, forged identity rejection, removed login RPCs.
- Exact bytes promoted; capture compares 12 changes against the previous release, drift 0 findings and parity ALIGNED. Integration lease released.
- Production web and device nodes run the same 222-file Voice artifact (`b290507b76de20057f9c1305eafd47d4304a24d0e5e6270882965dcac5b9e0aa`); both ready and idle, release gates open.
- A new private test group created by the user identity received V through a real add-bot event. API readback shows one composer menu named “📞 打给 V” and only the built-in message tab. Its generated URL opens the production phone page without a chat code; optional OAuth remains available.
- Production RPC at 03:10 CST: real membership and route, 105 effective tools, harmless native file read, forged identity rejection, removed login begin/status RPCs, no challenge implementation in the running Voice module.
- Production `exec` through both the actor wrapper and the baseline native Gateway returns the same rejection: Secret egress proxy requires an admitted agent run. This check proves parity of that restriction, not direct exec success or a new agent-turn/audio acceptance.
- The in-app browser displayed the production homepage changelog and the new phone page. No paid voice test or automated dial was performed.

## Activation incident and recovery

The Gateway activation began at 02:57:54 CST after both Voice nodes were idle. Eleven active background runs entered the native preserve/recovery restart path. Cleanup took until 03:01:41; the normal stop policy was restored after exit. The old process's memory-search child received SIGTERM during cleanup; no database or session state was removed.

The first replacement process failed at 03:02:47 because the accepted core module imports Feishu through the VLab-relative npm layout, while production stores the same reviewed plugin under a separate physical root. Core-byte parity alone did not detect that import-resolution mismatch. This was a release validation defect.

Production was repaired by mapping the exact expected package path to the existing verified production Feishu directory. No accepted runtime file was hot-edited. After a full native database integrity check (195.37 seconds), Gateway PID 3706262 became ready at 03:07:11; Voice recovered as well. The phone entry was unavailable during this roughly nine-minute interval.

`scripts/lib/feishu-voice-layout.mjs` now validates the two reviewed imports, rejects an existing conflicting package, and creates only the missing directory alias. `promote-to-v.mjs` validates before installing bytes and applies the mapping before capture/restart. Five regression tests exercise actual generated-runtime imports under both VLab and production layouts, idempotence, conflict refusal, and missing dependencies. The alias is deployment layout outside the captured component roots; future promotions revalidate it.

Native main-session recovery reported settled=1, failed=0. The native Night Shift health read at 03:13 shows Gateway restart state `up`, no remaining hold, automatic recovery of eight interrupted cards at 03:08:31, no scheduler error, and five running cards. No manual redispatch or production database edit was needed. This does not assert that all background jobs have finished successfully.

## Rollback evidence

Production runtime backup: `/opt/v-release-backups/feishu-conversations-20261024-20261023T185443`, including `undo.json`. Private phone configuration originals were retained in their private release directory. The fleet controller retained both prior Voice versions and service identity receipts. Configuration and credentials are not included here.

Existing calendar-account binding, external DM receipt delivery and interrupted spoken-result issues from the earlier real-call audit remain separate findings; this release does not claim to have fixed them.
