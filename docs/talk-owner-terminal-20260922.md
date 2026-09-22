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

## Deployment state

This candidate is not merged into `dev` and is not deployed to production V.
The temporary incorrect production file was restored to the original
`bc7f7e15e211fc7669446b221222de980a355a042c4f8a40e301357186e5aa42`
hash without another restart.
