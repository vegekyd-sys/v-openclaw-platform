# Voice avatar display recovery

This patch adds a private timeline for GPT Live, Xiaohe and Grok. It records Decision application separately from the browser reporting a decoded image in the visible viewport. Each display includes the latest public user and assistant speech, with turn keys, completion state and explicit truncation after 600 characters. Backend document cards, internal reasoning and audio are excluded.

## Evidence and clocks

The existing renderer reports after two animation frames, only while the page is visible, the call is connected/ending, the expected image is decoded and intersects the viewport, and the exact call owner is still current. Failed downloads, stale callbacks, mismatched assets and off-screen images do not count. Returning to a visible page is labeled `visibility`.

This is authenticated browser telemetry, not a screenshot/video recording or proof that a human looked at the image. `clientAt` is the browser wall clock; `elapsedMs` is monotonic time since capture creation. Server `at` records receipt, not display. Server and client clocks must not be assumed synchronized.

## Storage and identity

The H5 server derives `voiceSessionId`, personal session binding, provider and reservation model from its owned call; the browser cannot override them. The model is explicitly tagged `modelSource=voice_reservation`, not inferred as final response metadata. Only an authenticated same-context request may POST `/api/avatar-events`. Recently closed owners accept logging alone for five minutes; this does not restore control rights or extend a call.

Private daily files use schema `voice-avatar-audit-v1`, directory mode 0700 and file mode 0600, with O_NOFOLLOW on files. Default directory is `OPENCLAW_STATE_DIR/state/voice-avatar-events`, or the config directory equivalent. `RTC_H5_AVATAR_LOG_DIR` can explicitly override it. Logs and the writer module are not public HTTP routes.

Each capture has client UUID and sequence; the writer serializes append operations and acknowledges only after a completed append. Retried batches are deduplicated per call/capture. The daily reader also deduplicates `(voiceSessionId, clientCaptureId, sequence)` to tolerate uncertain writes.

## Voice remains independent

Uploads are asynchronous, batches contain at most 20 events, and the client queue is bounded at 160. Dropped records produce `avatar.gap`; start/close markers expose incomplete or open captures. Hangup never waits for telemetry. Page-hide requests use keepalive, with five-second request timeouts; closed captures retry for up to five minutes. Page destruction, prolonged offline operation or service replacement can still lose pending events. Missing or partial coverage must be reported as such.

The local daily pull reader is prepared to read this schema alongside the existing three-model text sources. It preserves client and server time, actual-display vs Decision events, exact identity and missing coverage. Historic calls without this capture cannot be reconstructed as actual-avatar evidence.

## Verification

- 134 relevant local tests passed, no skips: renderer ownership/visibility/assets, wire validation, all three providers, private disk persistence, retry/gaps, closed-call grace, app integration and release packaging.
- Catalog audit passed; existing platform artifact-lock warnings and `releaseReady=false` remain.
- Regular Playwright CLI used because the Browser plugin/skill is unavailable. A local fixture served the real renderer, telemetry client, server endpoint and writer without microphone or provider connections. Desktop 1440×1000 and mobile 390×844 rendered correctly; all three provider ownership paths persisted matching public dialogue and decoded-image IDs, with zero console/page errors. Fixture dialogue is test evidence only and is never inserted into production.
- The private daily reader successfully consumed these local JSONL captures, with closed capture markers and no declared gaps.

This patch is prepared in a task worktree. Merge, shared validation and production deployment require the user's decision; local checks do not establish production collection. Deployment requires only an idle switch of the independent H5 service, not a Gateway restart.
