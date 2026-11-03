# `hooks relay` and launcher commands without the general CLI's startup cost

Status: on V since 2026-11-01 13:12 CST (`v2026.9.1-db91.6-cli-startup-fast-20261101`, PR #530), without a Gateway restart. Evidence for the cause: `docs/evidence/openclaw-cli-startup-20261101/README.md`.

## Production result (V, 2026-11-01 13:13 CST)

- Gateway PID unchanged (604187); parity ALIGNED.
- Real `/vds` turn (`agent:makaron:explicit:cli-startup-fast-accept-20261101`): three shell tools ran, the reply held the right hash.
- Real relay processes: **0.08-0.10 s** (exitsnoop, 18 processes, all `pre_tool_use`, including other Codex traffic in the window). Before: 0.38 s by the mock-bridge measure (n=7), not the same instrument. Each tool call ran one relay, not the 1-1.4 estimated earlier.
- `cron status` 0.71 s and `gateway call health` 1.13 s through this launcher, JSON normal (n=1 each).
- Blocking: a stale relay id through V's state database and Gateway denies `pre_tool_use` and returns nothing for `post_tool_use`. **No tool call was actually blocked on V**, which has no probe plugin; that ran on VLab on the same bytes.
- `--apply` installed `warning-filter.js` owned by 501:staff. It was changed to root:root by hand; the bytes did not change. `promote-to-v.mjs` should not keep the local owner on new files.

**The respawn saving does not reach agent `exec` or `health --json`:** they run `/usr/local/bin/openclaw`, the other install, which this release does not change.

## What changes

| File (core `dist/`) | Change |
|---|---|
| `warning-filter.js` (new) | `openclaw.mjs` already tries to import this name before `dist/entry.js`; it did not exist in this build. It runs `hooks relay` and exits, or sets `OPENCLAW_NODE_OPTIONS_READY=1` and drops `ExperimentalWarning`s. |
| `native-hook-relay-cli-DTqrikhm.js` | Drops the side-effect import of gateway method scopes (713 files, mostly typebox). Upstream made the same change. |
| `native-hook-relay-client-GFGIwlRq.js` | The locator read uses `node:sqlite` directly instead of Kysely and the sqlite helpers (about 290 files). |

`OPENCLAW_V_CLI_FAST_PATH=0` restores the old path. No Gateway restart: relays are new processes, and the Gateway keeps the client chunk it already loaded (same behaviour on its next start).

**Why a new dist file and not `openclaw.mjs`:** capture, sync and parity cover `dist/` only, so an edited launcher would be invisible to the drift sentinel and `vlab-v-parity`. The fork has the same logic as `src/cli/launcher-preflight.ts`, built to this file name.

## Results

| | relay wall | relay CPU | modules |
|---|---:|---:|---:|
| V, before (n=7) | 0.38 s | 0.53 s | 1191 |
| V, `/tmp` copy of this code (n=14) | 0.07 s | 0.08 s | 31 |
| VLab candidate, before (n=12) | 1.20 s | 1.21 s | 1191 |
| VLab candidate, these bytes (n=10) | 0.15 s | 0.15 s | 34 |

VLab, 15 concurrent five-step `/vds` turns on one Gateway, alternating, 45 turns each: 70.3 s before, 39.0 s with the relay fast path, 22.8 s with hooks off (`docs/evidence/openclaw-cli-startup-20261101/relay-ab-progress.jsonl`). `before_tool_call` still blocks: the marked command did not run and the reply named the PreToolUse hook. V has not run this comparison.

Non-relay commands on V save 0.30 s and 0.35 CPU seconds, **only through this install's launcher**.

## What the launcher path skips, checked against `dist/entry.js`

| Skipped for `hooks relay` | Effect |
|---|---|
| `normalizeEnv` | Only copies `Z_AI_API_KEY` to `ZAI_API_KEY`. The relay and its Gateway fallback call no provider. |
| `--profile` / `--dev` | The branch needs `argv[2..3]` to be exactly `hooks relay`; any root option goes to `entry.js`. |
| `--container`, `OPENCLAW_CONTAINER` | The env var goes to `entry.js`; the flag fails the exact match above. |
| Runtime guard | `openclaw.mjs` checks the same Node range first. The sqlite check in the guard only applies to Bun. |
| `OPENCLAW_CLI=1` marker | Set here as well. |
| `OPENCLAW_AUTH_STORE_READONLY`, `--no-color` | Only for `secrets ...` and that flag; neither is a relay. |
| ESM resolve hook, startup trace, `withCliProcessScope` | Performance and CLI registry cleanup. No registry is loaded, and the Gateway fallback was tested (below). |
| Dotenv | `entry.js` did not load it on this path either. |

## What the respawn default touches

- The Gateway (`dist/index.js`), the Worker (`worker.mjs`) and the sentinel's `dist/index.js config validate` do not load this file: strace shows 0 opens from `dist/index.js`, 1 from the launcher. No systemd unit on V starts through `openclaw.mjs` (2026-11-01).
- `OPENCLAW_NODE_OPTIONS_READY` has one reader, `buildCliRespawnPlan`. `OPENCLAW_NO_RESPAWN`, which changes how the Gateway restarts, is not involved.
- An explicit value is respected. The CA-certificate respawn is untouched.
- `config validate` and `cron status`: output and stderr match the old path. strace counts one node process instead of two.

## Scope on V

`/usr/local/bin/openclaw` is a different install (`/opt/openclaw-2026.9.1-v`) and **this release does not change it**. Agent `exec`, `health --json` and scripts that call `openclaw` run that install, so **the respawn saving does not reach them yet**. What calls `core/openclaw.mjs` on V today: the Codex relay, and scripts that name that path.

## Failure modes

- Bridge not found: 100 ms retry, then the Gateway fallback, as before. Tested against a real Gateway: `pre_tool_use` returned deny, `post_tool_use` returned nothing.
- Newer state schema: the locator is not read, and `pre_tool_use` denies.
- A bad relay option: exit 1 as before; the text changes from `Could not start the CLI` to `native hook relay failed`.
- Chunk names are pinned to these hashes. `lab/patch-cli-startup-fast.mjs` refuses other bytes. On the fork the imports are ordinary source.

## Reproduce

`node --test lab/cli-startup-fast.test.mjs`; `lab/candidate/cli-startup-fast.plan.json` for the real bytes.

Source: `versa/port-relay-fast-20261101` (15c5a88b59d). `launcher-preflight`, the import boundary and `native-hook-relay-cli` pass 29/29, and `src/agents/harness/native-hook-relay*` 159/159, on Node 22.23.1.
