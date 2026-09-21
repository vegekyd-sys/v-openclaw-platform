# Xiaohe RTC standalone H5

This is a VLab-only diagnostic surface for the managed-room Xiaohe RTC path.
It intentionally avoids the OpenClaw Control UI. A loopback-only Node bridge
holds the authenticated Gateway connection while browser audio stays on the
direct VolcEngine RTC path.

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
