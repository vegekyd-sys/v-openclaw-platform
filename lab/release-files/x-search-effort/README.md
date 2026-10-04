# x-search-effort

`x-search-shared-CJa_QAnc.js` for OpenClaw 9.1 (db91.6): x_search on grok-4.6
asks xAI for reasoning effort `low`.

## Why

9.1 sends `reasoning.effort` only when the x_search model is the default
grok-4.3 (`"none"`). grok-4.6 rejects `"none"`, so for it no effort is sent and
xAI runs at its default (high) effort. There is no config key for this: the
`xSearch` schema is closed (`enabled`, `model`, `baseUrl`, `inlineCitations`,
`maxTurns`, `timeoutSeconds`, `cacheTtlMinutes`), and upstream main still has no
key. Upstream 9.5 maps each model to its lowest supported effort in code
(`resolveXaiToolDefaultReasoningEffort` + `thinkingLevelMap`): grok-4.3 →
`none`, grok-4.6 → `low`, others → unset. This file ports exactly that table.

On V (2026-10-04) high effort made each x_search take 28–51 s against the 30 s
client timeout; 8 of 12 agent calls across worker, Codex and claude-cli runtimes
failed with `request timed out`. The config side (`timeoutSeconds: 90`,
`maxTurns: 2`) is already live on V; `maxTurns` alone barely helps (median 36 s).

## Change

One table, `XAI_X_SEARCH_LOWEST_REASONING_EFFORT`, and `requestXaiXSearch` reads
it instead of the inline `=== XAI_DEFAULT_X_SEARCH_MODEL ? "none"` check.
`web_search` (provider `grok`) is unchanged; V uses the gemini provider.

## Tests

`lab/candidate/x-search-effort.test.mjs` drives the real 9.1 x_search tool
through a local proxy (trusted web-tool endpoints honour `HTTP_PROXY`) and checks
the request body. No credential is involved.

```sh
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner TASK \
  --plan "$PWD/lab/candidate/x-search-effort-baseline.plan.json"   # unpatched: no effort for 4.6
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner TASK \
  --plan "$PWD/lab/candidate/x-search-effort.plan.json"            # patched: effort low for 4.6
```

`lab/x-search-effort-eval.mjs` compares request variants against the real xAI
API (latency, tokens, citations, answer text); it needs a bearer token in
`XAI_BEARER` and is run on the host that holds the credential.
