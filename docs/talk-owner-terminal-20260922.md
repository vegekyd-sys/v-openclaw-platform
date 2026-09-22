# Direct WebRTC consult terminal event

## Failure reproduced

The production V Speaker bridge remained active after its embedded Talk Agent
run completed. A headless WebRTC client reproduced the real path with a private
speaker bridge and a dedicated test session. The Agent runs completed, while the
bridge observed only `chat.delta` and no owner-scoped `tool.result`, so its
120-second compatibility guard remained active.

The first attempted patch targeted `createTalkClientGatewayControlOwner`.
Production evidence disproved that assumption: the OpenAI direct provider calls
`createTalkClientAgentConsultRunner` through `runAgentConsult`, bypassing that
Gateway-control queue. That patch was removed and was not retained as the
candidate.

## Candidate behavior

The consult runner now emits `talk.event` only to `ownerConnId`, scoped by the
current `voiceSessionId`:

- `tool.call` after the embedded run obtains its exact `runId`.
- `tool.result` with `final: true` after the consult resolves.
- `tool.error` with `final: true` if that same consult rejects.

Terminal delivery uses `dropIfSlow: false`. V Speaker already treats these
events as the authoritative busy boundary; provider audio/transcript events
continue to refresh activity, then the existing 15-second idle timer closes the
RTC after output becomes quiet.

## Verification

- Patch/build suite: 9/9 passing before and after release generation.
- Generated runtime parses with `node --check`.
- A clean VLab candidate passed against the overlaid runtime hash
  `f35707c5dfa628625251dc58e93eb04a13d26854985aa6910a724ea4a1aa05c2`.
- The VLab test executed the generated runner with a pending embedded consult,
  proved that only the owning connection received `tool.call`, resolved the
  consult, and then proved the same connection received the exact `runId` as a
  non-droppable final `tool.result`.
- The shared VLab PID remained unchanged; no integration lease or shared
  Gateway restart was used.

## Physical speaker acceptance

A private OpenClaw 2026.9.1 VLab candidate was connected to the physical
ReSpeaker through temporary SSH forwarding. The production OpenClaw Gateway was
left running; only `v-speaker.service` was paused while the device bridge used
the candidate, then restored.

- `talk.catalog` reported OpenAI realtime ready, and a preflight reservation
  returned `gpt-live-1-codex`, voice `sol`, and the native WebRTC offer path.
- A real acoustic `你好小V` wake reached media-ready in 5.909 seconds. The
  device completed ICE/DTLS/SCTP, replayed buffered early speech, and played
  provider audio.
- The final 123.919-second call observed two complete owner-scoped terminal
  sequences: `tool.call: 2`, `tool.result: 2`, plus 15 `chat.delta` progress
  events. The RTC did not close at the 15-second silence boundary while either
  consult was active. It closed with `reason=idle` after both final results and
  subsequent audio/activity became quiet.
- The device sent 354,035 encoded-media bytes and received 428,441 bytes
  directly from OpenAI. The V bridge handled 38,201 bytes of device signaling
  input and 1,676 bytes of signaling output; media did not transit V or VLab.
- The temporary V bridge used 59 MB at sampling time and peaked at 62 MB. The
  full private VLab candidate used 1.88 GB at sampling time and peaked at 2.48
  GB because it retained the normal 5-worker VLab pool; this is acceptance
  harness overhead, not added production V overhead. The candidate occupied
  1.4 GB on disk and was removed after the run.

An earlier physical attempt correctly surfaced `database or disk is full`
before WebRTC creation when the VLab volume had only a few megabytes free. The
private candidate copies were reduced and the final run had 13 GB free. This
was a VLab host-capacity issue, not a Talk terminal-event failure.

## Deployment state

This candidate is not merged into `dev` and is not deployed to production V.
The temporary incorrect production file was restored to the original
`bc7f7e15e211fc7669446b221222de980a355a042c4f8a40e301357186e5aa42`
hash without another restart. After physical acceptance, the temporary bridge,
tunnels, credentials, and candidate runtime were removed. Production
`v-speaker.service` was restored with `controlConnected=true` and
`voiceActive=false`.
