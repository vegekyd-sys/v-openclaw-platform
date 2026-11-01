# Codex thread after a failed turn, 2026-10-31

Candidates on VLab against V's Codex dist (whole-dist sha256 `4660540e`). Reply text was removed.

**Cause.** Codex ends the failed turn (`turn/completed`, `failed`) and leaves the thread loaded in
status `systemError`. OpenClaw unsubscribed, then `observeCodexThreadConfiguration` reported every
status except `idle` and `notLoaded` as "active in another runner". `claimed` was false: nothing ran.
Codex unloaded the thread 60.0 s after the unsubscribe, which is when the error stopped.
`before-fix-status-timeline.jsonl` shows this, one 503 with probes at 0, 15, 30 and 60 s.

**Fix.** `lab/release-files/codex-failed-thread-resume/`. `after-fix-regression.jsonl`, from
`lab/candidate/codex-failed-thread-resume.plan.json` at commit 74ec1369:

| Next message after | Before | After |
|---|---|---|
| 503, 429, 402, cut stream, bound session | error until about 60 s | Codex reply in 5.1–6.2 s |
| 503 on a session's first turn | not measured | Codex reply in 5.1 s |
| two 429 in a row | not measured | Codex reply in 5.0 s |
| 429, then config changed (forced) | error until about 60 s | Codex reply in 66–70 s, next 6.5 s |

The config case forces the warm path's mismatch with `codex-force-thread-resume.mjs`; the one
`observe` line in the diag proves it reached the `systemError` handling. No other case reaches it:
they reuse the live thread.

Not covered: abort during the 60 s wait, a real config change, other sessions on the same app-server
while it runs, production V.

**Upstream hangs** (`lab/candidate/harness-hang-*-20261031.plan.json`). `hang` never answers;
`stall` sends headers and one event, then nothing. Time until the user gets anything:

| Runtime and setting | hang | stall |
|---|---|---|
| Worker, provider timeout 90 s (V's value) | error at 185 s, no fallback | fallback, reply at 195 s |
| Worker, provider timeout 300 s (shared VLab's value) | error at 604 s, no fallback | fallback, reply at 624 s |
| Codex defaults | nothing by 930 s | nothing by 930 s |
| Codex `stream_idle_timeout_ms=60000`, both retries 1 | nothing by 930 s | fallback, reply at 143 s |
| The same, provider timeout 90 s | nothing by 450 s | not run |

After a Codex hang run gave up, the next message's reply about 73 s later answered the hung message,
so the turn was still alive (`after-vds-hang`: `correct` false). The Codex settings cover only `stall`,
and `models.providers.*.timeoutSeconds` does not reach Codex. A no-answer hang needs a watchdog in
OpenClaw. The candidates shared a busy 4-core host; timers set these durations, not load.

## Shared VLab and production (2026-11-01 CST)

Release `codex-failed-thread-resume-20261101-v1`, real Feishu group, `/vds`, runtime codex.

- Fault on shared VLab: a loop cut every HTTPS connection of the Codex processes 120 times during one
  turn. Four attempts ended in `stream disconnected before completion`, and the error card came at 134 s
  (fallbacks are off after a manual `/model`).
- Next message: 12.5 s in the group, about 6 s in the run, runtime codex. The one after: 8.2 s.
  `another runner` appeared 0 times since the deploy.
- Production V after the restart at 10:20: Worker 3, `/vds` 2, `/vcodex` 1, all replied. No fault was
  injected on V, so production has not exercised the fixed path yet.
- Not exercised on the shared Gateway: 503, 429, 402, and the unload wait after a config change. Those
  have candidate evidence with the same patch.
