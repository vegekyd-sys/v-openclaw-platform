# Voice: restore accepted task behavior and add avatar performance

Scope: Candidate only. No merge, shared VLab write or production deployment in this change.

## Voice baseline

The accepted release is `v2026.9.1-db91.6-voice-reliability-20261008`, source `dd5e4cdb389148e39ca81c9130a61f77287fa557`. Task routing is restored to its original behavior: GPT Live delegates through its original OpenClaw Agent bridge; Xiaohe and Grok expose native direct tools and `delegate_to_v` for complex work. The experimental JEV/OpenAI Decisions task owner is disconnected from the builder, direct session and UI; its prior failed experiment evidence remains unchanged.

The three installed Gateway target files are restored byte for byte from the accepted source: `talk-DkFuKRod.js`, `realtime-quicksilver-delegation-controller-B0yPpiHp.js` and `gpt-live-call-lifecycle.mjs`. A builder regeneration was checked; it emits equivalent declarations with a different prefix order in Talk. The shipped rollback target retains the accepted file bytes. Candidate memory index/config alignment is retained rather than reset.

## Avatar performance

Six task scenes each contain six visibly distinct poses: listening, memory investigation, web investigation, calendar planning, background work and successful completion. Existing selected operator identity remains the idle portrait. Poses follow actual registered tool call/result/error events, never text guessed from conversation. A foreign or failed terminal event cannot trigger success celebration. Pending work takes priority over listening; completion then returns to listening. Desktop keeps the portrait on the left; H5 keeps the connected portrait centered at the top and slightly enlarges it.

Optional Decisions selects only one of four expression styles for already executing work. It receives only a coarse activity label, not user text, tool arguments, private results or task permissions. `VOICE_AVATAR_DECISION_PROVIDER` is separate from the removed `VOICE_DECISION_PROVIDER`. It runs asynchronously with a 1.5s cutoff, one request per owner per 15s, maximum 12 per owner. Unavailable or late answers leave deterministic task animation running and never block tools, speech or Agent work. This is not a new task decision architecture.

## Image generation and delivery

Generated with the built-in imagegen tool from the user's approved interstellar operator portrait. Common prompt constraints: same silver hair, teal/cream retro space uniform, lobster brooch, cyan communication earpiece and white hovering companion; solid lavender background; no text; six panels with significantly different posture, gaze and expression. Scene prompts requested listening gestures, reading memory holograms, actively searching web panels, planning calendar slots, coordinating background work and celebrating successful work. Tool output sheets and optimized image hashes are recorded in the private asset-budget receipt; source sheets are not served to browsers.

All 36 generated poses plus idle have 256px mobile and 512px desktop WebP variants: 74 files, total 823740 bytes; largest file 19586 bytes. Decode before swap; preload only the next frame, no eager gallery. Work frames change every 2.4s, listening every 4.6s. Hidden tabs stop animation scheduling; reduced-motion uses static poses. Images have stable names and one-day cache headers. Code/API keep no-store. Failed image downloads retain the last good portrait. Animation uses transform/opacity and does not touch PCM, microphone or playback scheduling.

## Validation and release boundary

Local H5, direct-tool, lifecycle and release tests; desktop/mobile UI-only browser checks with actual WebP downloads and no console warnings. UI fixture controls are presentation evidence only, not voice acceptance. Candidate install must verify a fresh idle browser and authenticated API state, exact owner unit/PID/start time, backup its three runtime targets and source, retain all other runtime/config hashes, restart only its own Candidate Gateway/H5 once, and verify the same reusable link and all three model choices. Shared VLab/V remain untouched.

Prior strict media, physical iOS Safari/AEC and final-answer fidelity failures remain separate; restoring accepted bytes and a healthy entry are not new physical listening acceptance.
