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
- `RTC_H5_SESSION_KEY` (default `agent:makaron:f0cf5055`)

The server must remain loopback-only. Reach it through an SSH local forward.

For a fast Mac-side page, forward the remote bridge to local port `26243` and
run `local-proxy.mjs` on port `26241`. Static H5 and the 1.45 MB SDK then stay
local; only small `/api/*` requests cross SSH.

## Public deployment boundary

The default `RTC_H5_SESSION_KEY` is suitable for a private acceptance link, not
for a public multi-user URL. Before exposing the H5 on `tianyi.live`, issue an
isolated OpenClaw session for each signed-in or anonymous visitor, add abuse
limits, terminate HTTPS at the public edge, and keep the Gateway token and RTC
credentials server-side. Deploy the H5 as a separate route or service so the
existing Control UI bundle and its voice path remain unchanged.
