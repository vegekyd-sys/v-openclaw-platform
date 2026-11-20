# Gemini account bridge

Serves the Gemini API `generateContent` surface (what OpenClaw's built-in
`google-generative-ai` transport calls) and forwards it to the Antigravity
account endpoint (`daily-cloudcode-pa.googleapis.com/v1internal`) using the
login the official `agy` CLI keeps for `scene-gemini-relay`. OpenClaw runs the
agent loop, tools, images and thinking itself (PI harness / vlab-worker); the
bridge only re-wraps requests and responses and adds the account bearer token.

```
OpenClaw worker ──x-goog-api-key──▶ 127.0.0.1:25990/v1beta/models/gemini-4-neon:streamGenerateContent
                                     │  model gemini-4-neon + thinkingLevel → account id gemini-4-neon-<effort>
                                     ▼
                     v1internal:streamGenerateContent  {project, model, request}  (Bearer from agy login)
```

- Login: read from `/srv/vlab/scene-gemini-relay/.gemini/antigravity-cli/antigravity-oauth-token`
  (0600, `scene-gemini`). When it is within 5 minutes of expiry the bridge runs
  the official CLI's `agy --print /usage` once, which refreshes the file — the
  same call the relay already makes. A 401/403 forces one refresh and one retry.
- Models: only `GEMINI_BRIDGE_MODELS` families (default `gemini-4-neon`). The
  effort tier comes from `thinkingConfig.thinkingLevel` (`minimal/off→low`,
  `max→xhigh`); `thinkingLevel`/`thinkingBudget` are then removed because the
  account encodes the tier in the model id.
- Errors: upstream 429 and 4xx keep their status, upstream 5xx becomes 503,
  bridge busy (`GEMINI_BRIDGE_CONCURRENCY`, default 4) is 429 with Retry-After.
- `GET /healthz` (no key): login time left, plan tier, counters, last error. No
  token, key or prompt is ever logged or returned.

Install on V (root, from a checkout): `bash apps/gemini-account-bridge/install.sh`
(`--dry-run`, `--uninstall`). The OpenClaw side is `scripts/gemini-neon-alias.mjs`.
See `docs/gemini-neon-account-bridge-20261119.md` for the decision record,
acceptance numbers, and the Antigravity terms risk Tianyi accepted.
