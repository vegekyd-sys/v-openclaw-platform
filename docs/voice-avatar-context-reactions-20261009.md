# Voice contextual avatar reactions — Candidate

The 36 approved performance images plus the idle portrait have reviewed actions, emotions, appropriate and inappropriate contexts. Performance images also carry dialogue relationship (listen, empathize, clarify, explain, encourage, apologize…), affect, energy, gaze, gesture and compatible-variation family labels. The old task scene is only a secondary cue. IDs and image paths are fixed; the display model cannot invoke tools.

All three voice providers share the same asynchronous display path. It sees at most six recent spoken user/V rows of 600 characters, actual task state, current speaker, current displayed image and semantic reaction anchor. Full backend documents and tool arguments/results are excluded. Context stays in memory and goes to the existing server-side avatar Decision provider, without transcript logging in the avatar audit.

## Conversation reaction and timing

A new user caption turn immediately shows attentive listening without guessing emotion. Streaming captions are coalesced until 400 ms of stability, with a 900 ms maximum debounce; requests no longer wait five seconds. Results for obsolete partial phrases, previous turns, closed owners or aborted requests cannot change the portrait. Selection never blocks the voice or Agent path. Hidden pages stop requests and variation; quiet waiting does not poll the provider.

Decision can choose a reviewed picture or HOLD: preserve the current reaction intent and emotion. HOLD and repeated choices do not reset the current image's deadline. A meaningful changed reaction displays as soon as its asset is decoded. Task transitions cannot erase an existing response to the person speaking.

While a call is visible, an unchanged reaction varies within a reviewed compatible family. Energy and phase determine a roughly 2.75–4.4 second dwell, with a five-second maximum target. A compatible neighbor and a tiny neutral safety pair are preloaded; a stalled neighbor falls back to a decoded attentive image at the deadline. Initial offline/failed asset loading and suspended browser timers cannot provide a hard physical wall-clock guarantee. Existing 256/512 WebP assets are reused; the gallery is not preloaded. Reduced motion skips crossfades. Semantic meaning stays stable while the pose changes.

## Confidence and validation

The exact-picture confidence gate remains 0.5. A distribution split between hand-reviewed equivalent reaction images may instead qualify at 0.75 family probability mass (with valid normalized probabilities and at least 0.15 selected-picture confidence). Unrelated emotions cannot be combined to pass this check. This is solely a display decision, with no change to task/action authorization thresholds. Otherwise the current attentive/task fallback remains.

274 targeted H5 and direct-provider regression tests passed with zero skips. They include current-owner and revision checks on all three reservation paths, independent heartbeat while display is pending, stale/partial phrase rejection, bounded context and document exclusion, immediate semantic replacement, HOLD not extending a frame, compatible variation, hidden-page handling, and existing audio/microphone/control behavior.

Nine actual OpenAI Decisions samples (eight contexts and HOLD) used the existing Candidate provider, without starting voice. Seven contexts produced reviewed matching pictures, HOLD preserved the reaction, and one mixed surprise/explanation context remained uncertain and was withheld. The actual Decision-only durations were 450–1309 ms; these are not end-to-end voice latency or general emotion-accuracy acceptance. The first probe's exact-picture ambiguity was retained, then inspected: sadness split mass between two equivalent listening pictures; planning split between two planning gestures. Both qualify through the reviewed family check. The ambiguous surprise sample still does not qualify.

Prior Candidate evidence remains separate: the first contextual implementation had 268 local tests and eight provider probes, and an obsolete adapter import caused one failed H5 load before recovery. Those receipts are not overwritten.

This follow-up is Candidate only and reuses the trial URLs. It does not change speech transport, providers, task routing, OpenClaw Agent, Gateway runtime/config or final-answer interruption policy. Native final interruption remains partially verified and physical iOS/Safari acceptance remains incomplete. No dev/shared VLab/V rollout is included.
