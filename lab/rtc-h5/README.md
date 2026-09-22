# V voice standalone H5

This is the user-facing standalone voice surface for V's managed-room Xiaohe
RTC path. It intentionally stays separate from the OpenClaw Control UI. A
loopback-only Node bridge holds the authenticated Gateway connection while
browser audio stays on the direct VolcEngine RTC path. Engineering stages and
logs remain available behind the collapsed `连接详情` disclosure.

Required environment:

- `OPENCLAW_STATE_DIR`
- `OPENCLAW_CONFIG_PATH`
- `RTC_H5_RUNTIME_ROOT`

Optional environment:

- `RTC_H5_HOST` (default `127.0.0.1`)
- `RTC_H5_PORT` (default `26242`)
- `RTC_H5_SESSION_KEY` (private acceptance only; fixes every visitor to one session)
- `RTC_H5_BASE_PATH` (for example `/voice`)
- `RTC_H5_ACCESS_TOKEN` (at least 32 characters; enables public-link access control)
- `RTC_H5_MAX_ACTIVE_SESSIONS` (default `8`)
- `RTC_H5_MAX_ACTIVE_SESSIONS_PER_IP` (default `2`)

The server must remain loopback-only. Reach it through an SSH local forward.

For a fast Mac-side page, forward the remote bridge to local port `26243` and
run `local-proxy.mjs` on port `26241`. Static H5 and the 1.45 MB SDK then stay
local; only small `/api/*` requests cross SSH.

The portrait is also a lightweight activity signal: the relaxed no-hat V is
shown normally, the tablet portrait appears as soon as a tool call begins, and
the multi-task portrait replaces it if the same busy period lasts longer than
five seconds. The portrait returns to idle when all concurrent tool calls have
completed or failed. `?avatar=idle|busy|very-busy` is available for visual QA.

## Public deployment

For a public URL, do not set `RTC_H5_SESSION_KEY`. Set a random
`RTC_H5_ACCESS_TOKEN` and publish the first-use URL as
`https://host.example/voice/#access=TOKEN`. The browser exchanges the fragment
for a signed, `HttpOnly`, `SameSite=Strict` cookie and immediately removes the
token from its address bar. Each browser receives a separate
`agent:makaron:voice-h5-*` OpenClaw session. Concurrent-session, per-IP, and
start-rate limits are enforced by the loopback bridge.

Terminate HTTPS at the public edge and route only `/voice` and `/voice/*` to
the bridge. Keep the bridge on `127.0.0.1`, and put the path-specific edge rule
before the existing Control UI catch-all so the current Control UI and its
voice path remain unchanged. `/voice` redirects to `/voice/` so relative static
assets and API requests remain under the isolated route.
