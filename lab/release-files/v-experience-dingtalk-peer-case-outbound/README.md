# v-experience-dingtalk-peer-case-outbound — DingTalk: proactive group sends keep the group id's case

V 2026-10-15: proactive sends to a DingTalk group (the message tool's files,
`sendMedia`, actionCards) were refused with `400 invalid.openConversationId`.
The core folds the group's `openConversationId` to lower case in the session
key (`normalizeSessionPeerId`, see `patches/dingtalk-peer-case/README.md`),
and a target derived from the session carries the folded id; DingTalk's
robot message API is case-sensitive. Replies to an inbound message were fine
(they use the id from the message).

PR #382 kept the case in the session key instead; on shared VLab (2026-10-25)
that made Gateway `health` fail with `SessionCanonicalKeyMigrationRequiredError`
for the group rows already stored folded, so it was taken out of the release.
This change leaves the session keys and the session database alone and only
fixes what the connector sends:

- every inbound message records its conversation id's original spelling
  (`rememberDingtalkConversationId`) in
  `<state dir>/dingtalk-connector/v-conversation-ids.json`, shared by the
  Gateway and its Workers and kept across restarts;
- the channel outbound (`sendText`, `sendMedia`, V's link and 「电脑」 cards)
  sends an all-lower-case `cid…` target with its original spelling
  (`restoreDingtalkTarget`); a group not in the file is looked up once (per ten
  minutes) by key in its session entry, read-only through the plugin SDK's
  `getSessionEntry` (`agent:<agent>:dingtalk-connector:group:<folded id>` for
  the agents DingTalk is bound to), whose delivery fields keep the original;
- two groups folding to the same id are left as they are (logged once);
- a `channel:cid…` / `conversation:cid…` target (the shape the core derives
  from a group session) is sent as `group:cid…`: the connector read it as a
  user id and delivered the AI card to `IM_ROBOT.channel:cid…` (found by the
  candidate; independent of the case).

Built from the connector 0.8.26 originals (`apps/v-experience/dingtalk/baseline`)
by `apps/v-experience/dingtalk/patch.mjs`; rebuilding with the previous patch
list gives V's current bytes exactly (the `before` hashes). `manifest.json`
lists each file with V's current sha256 (`before`, checked on V 2026-10-25)
and the new one (`after`); `connection-DCvu-l09.mjs` is unchanged. The files
live in the connector's npm project on V, outside the core capture, and take
effect at the next Gateway start.

Do not ship `lab/release-files/dingtalk-peer-case/` (PR #382) with this.

Evidence: `lab/candidate/dingtalk-peer-case-{baseline,patched}.plan.json`
(fake DingTalk open platform that refuses a group id not spelled as users
wrote from it; real model turns on the VLab Worker; Gateway restarted inside
the run).

## Candidate results (2026-10-25, commit 5978d5d5, runtime fullread-dingtalk-r2-20261025)

`candidate-4fcd72b3` (baseline) and `candidate-73ba96f9` (patched), same
scenario, real DeepSeek turns, fake open platform refusing misspelled group ids:

| step | baseline | patched |
| --- | --- | --- |
| inbound group message → reply card | `IM_GROUP.cidPeerG1…AbCd==` | same |
| session key | `…:group:cidpeerg1…abcd==` (folded) | same (unchanged) |
| Gateway `send` text to `group:<folded>` | AI card to the folded id | card to the original id |
| `send` file to `group:<folded>` | robot API **400**, not delivered | `sampleFile` to the original id |
| `send` file to `channel:<folded>` | card to `IM_ROBOT.channel:…` (as a user), no file | file + card to the group, original id |
| message tool file in a Worker turn, target `group:<folded>` | **400** | `sampleFile` to the original id |
| two groups folding to the same id | 400 | left as is (400), logged once |
| after a Gateway restart: group in the file | 400 | original id (from the file, no lookup) |
| after a restart: group only in its session entry | 400 | original id `(from its session)`, then kept in the file |
| `health` / `SessionCanonicalKeyMigration` lines | ok / 0 | ok / 0 |

The connector reports a refused file as sent (its text part went out), so the
agent never saw these failures; only the robot API's refusal shows them.
