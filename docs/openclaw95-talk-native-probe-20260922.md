# OpenClaw 2026.9.5 native Talk delegation probe — 2026-09-22

## Goal

Verify the native post-9.1 path for a voice frontend that acknowledges delegated work immediately, stays available while the backend works, and returns the delayed result to the same voice delegation exactly once.

## Scope

- Official npm release: `openclaw@2026.9.5`.
- The probe ran through the VLab candidate runner without an integration lease.
- It used a simulated provider socket and did not use the physical speaker.
- It did not start or upgrade a Gateway, migrate databases, or modify shared VLab state.
- Shared VLab remained on PID `786865`, release `xiaohe-v-prompt-v1`, before and after the probe.

## Evidence

- Candidate receipt: `candidate-7e1437f2-73a7-4017-9ded-242592e6ec47`.
- Candidate result: passed.
- Official Talk dependency closure SHA-256: `5603ebc7aa955b3452bec0de21210260152db49658b5021330945f93cf9b9027`.
- Immediate acknowledgement was appended after 1 ms in the deterministic provider simulation.
- Simulated agent result was appended after 42 ms, after the acknowledgement.
- The delayed final append was accepted once; a duplicate was rejected without a second provider frame.
- The provider session remained active after the delayed final.
- The shipped instruction says to delegate each request once, wait for its result, and keep the conversation natural while work runs.
- For `gpt-live-1`, native `session.commentary.append` is speakable progress while `session.thinking.append` remains silent context.

## Interpretation

OpenClaw 2026.9.5 has the native primitives needed for the desired experience: immediate spoken acknowledgement, continued live conversation during backend work, and delayed final delivery to the same voice delegation. This probe establishes the release code path, not full V compatibility. A production upgrade still requires a separate isolated VLab Gateway migration and real-provider acceptance because V's current 2026.9.1 runtime includes custom patches and older database schemas.

The current 2026.9.1 speaker adapter fix is deliberately smaller: it keeps the existing Live session open while the exact speaker session has a backend `chat` run in progress, then restores the 15-second silence timeout. It does not backport 9.5's spoken progress protocol.
