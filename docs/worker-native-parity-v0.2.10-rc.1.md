# Worker native parity v0.2.10-rc.1 — VLab only

Date: 2026-09-05, Asia/Shanghai. Base: bb69480, OpenClaw 2026.9.1.
Status: candidate deployed to VLab; **not production accepted, not deployed to V**.
The user granted this experiment the VLab restart window. Astra experiments were
paused by coordination; their existing activation/provider patches were retained.

## Verified root cause

The prepared native plugin generation in the Worker already contains Feishu's
`tts.voice = { synthesisTarget: "voice-note", transcodesAudio: true }`.
However, native channel ID normalization reads the process-root plugin registry,
which is empty in this Worker. Thus `normalizeAnyChannelId("feishu")` and the TTS
voice-delivery resolver return null/undefined while direct generation-scoped
plugin lookup succeeds. The tool computes no voice intent before media delivery.
This is not evidence that IPC alone dropped an existing `audioAsVoice` flag.

## Changes

1. Scope the existing native plugin generation with AsyncLocalStorage for each
   Worker attempt. A narrow, version-gated core registry lookup patch consults
   that scope; outside it the original Gateway registry is unchanged. No copied
   Feishu capability list, hardcoded audio intent, or extra channel connection.
2. Carry ordinary JSON-shaped native Harness data under its native field names
   and reapply it at the existing native-attempt boundary. New ordinary fields
   no longer require another ingress-CLI mapping. Existing local identities,
   owners, stores, timeout/cancellation handles and authority bridges stay explicit.
3. Reject unknown callbacks, opaque objects, functions, symbols, accessors,
   cycles and prototype-pollution fields before admission; do not silently drop
   them. New core versions / changed registry anchors require review.
4. Do not inherit old hardcoded acceptance booleans. This RC explicitly blocks
   production promotion while lifecycle acceptance is incomplete.

This is not a claim of arbitrary JavaScript-object transport or zero-work future
upgrades. Nested `agentCommandFromGatewayIngress`, native result reconstruction,
process-local dependencies and lifecycle bridges still exist. Config parity is
not replaced by unrestricted copying of production credentials/configuration.

## Evidence

| Test | Result |
| --- | --- |
| Native capability probe, baseline | Feishu declaration exists; normalized ID and resolved voice capability absent |
| Same probe, candidate | normalized ID `feishu`; native voice capability resolved; outside Worker scope remains unchanged |
| Real Feishu TTS baseline, 13:22–13:23 | user request -> Worker -> MP3 `file` (bug reproduced) |
| Same real Feishu TTS after patch, 13:29–13:30 | actual returned message type `audio`, duration 3 s |
| Mixed ordinary MP3 + native TTS, 13:31–13:33 | ordinary MP3 remains `file`; TTS becomes separate `audio`, duration 3 s |
| Gateway native `tts` control | native media has `audioAsVoice: true`, OGG output |
| Three concurrent Worker sessions, 13:33–13:34 | all three simultaneously active; each completed real 35 s foreground Python/tool and final result; pending 0 at sampled peak |
| Local tests | 135 passed: unit/contract plus real fork/IPC future-data and metadata tests, no claims of 135 live scenarios |
| Feishu after `/stop`, 13:49 | subsequent real message returned `VLAB_PARITY_CANCEL_RECOVERED_OK`; conversation usable |

No generated media, credentials or transcripts are checked into this repository.
The synthetic future-metadata test establishes IPC preservation, not every native
tool/result semantic. No new >10 minute subagent test was run in this round.

## Unpassed / unresolved observations

- Real Feishu cancellation: request received 13:38:12; foreground `sleep 90`
  confirmed active; `/stop` received 13:39:37. Original task still returned
  `PARITY_CANCEL_DONE` at 13:39:59, followed by an empty-reply warning at 13:40:01.
  Therefore active cancellation is **not passed**. This does not by itself locate
  the fault in the new patch versus native channel admission / existing adapter.
- Separate operator RPC `chat.abort` fixture returned `unauthorized`; do not
  count it as a cancellation success or bypass native caller authorization.
- On restarts at 13:29 and 13:36, native main-session recovery picked up the test
  DM. One 13:29 recovery overlapped real input and reported
  `SQLite session state changed while preparing session-entry.patch`. The actual
  TTS subsequently delivered successfully. Need establish correct settled-turn
  ownership/recovery semantics before claiming full parity.
- Runtime zero relay failures / Gateway active is not sufficient acceptance.
  RC status keeps `productionPromotionBlocked=true` until these gates are reviewed.

## VLab installation and rollback

Service: `openclaw-vlab-production-mirror-v8.service` (historical name; actual core 9.1).
Generation: `/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902`.
Candidate: `/opt/vlab/experiments/worker-native-parity-v1`.
Previous Worker: `/opt/vlab/experiments/worker-openclaw91-transcript-v1`.
Both main and Worker configs select the candidate. Lab Makaron's model was
returned to DeepSeek Pro for controlled tests; no production model was changed.

Before activation, main and overlay configs were backed up as
`.pre-native-parity-v1`. The single core registry file has a
`.vlab-native-channel-registry-v1.bak` backup. Do not blindly restore whole old
configs: unrelated experiments may have subsequently changed them.

Rollback script (VLab host guard, refuses drift, preserves unrelated config/model):

```sh
/opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab/staging/rollback-vlab-native-parity.mjs --check
# Only in an agreed inactive restart window:
/opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab/staging/rollback-vlab-native-parity.mjs --apply
systemctl restart openclaw-vlab-production-mirror-v8.service
```

Only `--check` was executed during this round; rollback/redeploy has **not** been
claimed as live acceptance. Script restores the previous Worker paths plus the
exact core delta, retaining before-rollback backups and all session/media data.
After any rollback verify native Gateway/Worker status and a real channel reply.

## Next gate

Keep this candidate on VLab. Compare native and Worker `/stop` admission, owner
settlement and restart recovery using identical caller/session conditions. Do not
add isolated per-tool flags to paper over these lifecycle issues. Promote only
after actual cancellation/recovery gates pass and the user authorizes production.
