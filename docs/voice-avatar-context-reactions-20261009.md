# Voice contextual avatar reactions — Candidate

The 36 approved performance images plus the idle portrait each have a reviewed action, emotion, appropriate context and avoid context. Eight reaction categories cross the old task scenes: welcome, empathy, curiosity, focus, explanation, planning, surprise and joy. Image identifiers are fixed; the Decision model cannot generate URLs or invoke a tool.

All three voice providers use the same transcript → asynchronous display request → Decision picture ID → decoded portrait path. Input is at most six recent spoken user/V rows, each capped at 600 characters, together with the actual task state. Full backend documents, tool arguments/results, secrets and execution capabilities are excluded. Inputs stay in page/server memory and are sent to the already configured server-side avatar Decision provider; they are not recorded in avatar logs.

The server checks the existing access cookie/origin and current voice owner before selection. Increasing revisions, client turn/task boundaries, disposal, abort deadlines and image decode versions reject late responses. Voice/tool/Agent paths never await this classifier. There is at most one client request in flight, requests are coalesced to five-second cadence, and the server caps calls per owner. On provider failure the existing actual-task visualization remains available.

A selected exact picture holds until a new semantic choice or actual task transition; it does not cycle through six unrelated poses. Cosmetic changes wait at least five seconds after the previous rendered picture. Real task transitions and ending the call can reset the fallback immediately. Hidden pages pause requests; reduced motion still shows the selected exact picture without fading. Existing 256/512 WebP assets are reused, without preloading the gallery.

## Validation

198 H5 tests passed (0 skipped), including audio/playback, microphone lifetime, task/result presentation, call controls and new contextual selection tests. The latter cover all three server reservation paths, current-owner validation, no Agent/tool dispatch, an independent heartbeat during a delayed display request, stale completion, bounded context, document exclusion, exact picture loading and five-second dwell.

Eight actual OpenAI Decisions samples were run through the existing Candidate credential/provider, without starting paid voice. A memory task plus disappointment selected `listen-3`; the same task plus celebration selected a joyful completion pose. Curiosity, surprise, reading, scheduling, explanation and frustration selected reviewed, context-appropriate frames. This is a small sample review, not proof of general emotion accuracy. Provider receipts and browser-only fixture evidence are private under `tmp/voice-performance/context-reactions-20261009/`.

This patch is Candidate only. It changes the display decision and H5 server; it does not change the three voice providers, voice routing, OpenClaw Agent, runtime/config or final-answer interruption policy. Native final interruption remains partially verified and physical iOS/Safari acceptance remains incomplete. Shared VLab/dev/V acceptance and rollout are not included.
