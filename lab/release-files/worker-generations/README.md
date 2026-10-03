# Worker generations: reload and roll without a Gateway restart (2026.9.1)

## Problem

V runs Worker plugin 0.2.11. Every config hot reload that takes 9.1's plugin
reload path (`plugins.*`, `talk.realtime.provider`, …) stops all plugin
services and registers them again. In 0.2.11 the service `stop()` closes the
pool for good, and the re-registration picks the same closed pool back up from
`globalThis`. From then on every turn fails with `worker pool is closing` until
the Gateway restarts: 161 minutes on 2026-09-20, and twice on 2026-09-23.

The fix for that, the 0.2.12 generation lifecycle (dev `4fbbfd9a`, 2026-09-06),
was accepted in VLab but never shipped. Even 0.2.12 would still kill every
Worker on reload, active runs included: SIGTERM, then SIGKILL after 2 s.

## Change

| Target | Before (V = VLab) | After |
|---|---|---|
| `production-worker/index.mjs` | `c047f3df…` | `2e7ccdb0…` |
| `production-worker/worker-pool.mjs` | `a9f718d0…` | `58558773…` |
| `production-worker/worker-runtime-lifecycle.mjs` | — (new) | `5e29a54b…` |

1. **0.2.12 lifecycle.** `index.mjs` starts as `lab/worker-lifecycle-promotion.mjs`
   applied to V's exact bytes: a closing pool is never reused, and each request
   keeps the generation it was admitted to. The `worker-pool.mjs` start/close
   hardening from 0.2.12 is ported as well; the original projection never
   carried it:
   - concurrent starts share one startup;
   - a closed pool cannot fork Workers again;
   - a failed startup closes the pool.
2. **Drain, not kill.** A replaced generation (`beginDrain`) admits nothing new.
   - Turns that have not reached a Worker yet move to the next generation. 9.1
     stops the old service before it registers the new one, so they are held
     for up to 30 s for the next generation to appear.
   - Runs already in a Worker, turns queued behind them, and detached media
     tasks finish in the process that owns them. Each Worker retires as soon as
     it has nothing left.
   - A Session that is still running or queued in the old generation waits
     there before it starts in the new one, so a transcript only ever has one
     writer.
   - Cancel, steer and permission changes made through a handle held from
     before the reload still reach the request. Request ids are unique across
     generations.
   - `close()` stays the hard stop. It also ends any drain still running after
     `VLAB_WORKER_GENERATION_DRAIN_MS` (default 30 min).
3. **`vlab.workers.roll`** (`operator.write`) replaces the generation on demand,
   with no Gateway restart. New Workers re-read `worker.mjs`,
   `worker-openclaw.json` and the plugins it lists. Use it after changing any of
   them:

   ```
   openclaw gateway call vlab.workers.roll --params '{"reason":"worker config"}'
   ```

4. Turns admitted during the reload gap wait for the next generation
   (`awaitWorkerRuntime`, up to 60 s) instead of failing.

`vlab.workers.status` now reports:
- `generation`;
- `draining`;
- `predecessor`, the old generation's remaining workers, active runs, queued
  turns and detached tasks while it drains.

## What still needs a Gateway restart

Workers inherit the following from the Gateway process, and none of it changes
until the Gateway restarts:
- core dist;
- env, including `VLAB_OPENCLAW_AGENT_RUNTIME`;
- node and execArgv;
- `plugins.load.*`.

This release only makes the Worker layer replaceable.

During a drain, old and new Workers coexist. Memory peaks at the busy old
Workers plus the new generation's `minWorkers`. Idle old Workers exit at once.

## Tests

- `node --test tests/worker-generations.test.mjs`: 13 tests, real child
  processes, V's 0.2.11 bytes plus these files.
- The plugin's own 147 production tests and the 0.2.12 pool-lifecycle tests
  pass on the overlaid tree.
- The 0.2.12 service-lifecycle tests that assert a stop kills at once were
  restated for drain semantics in the file above.
- Real runtime: `lab/worker-generations-candidate.mjs`. It boots a private 9.1
  Gateway from the candidate runtime, with channels and outbound plugins off.
  While a real model turn streams through a Worker, it rewrites a `plugins.*`
  key and later calls `vlab.workers.roll`.
  - Plans: `lab/worker-generations-candidate.plan.json`, and
    `lab/worker-generations-control.plan.json`, which runs V's 0.2.11 and must
    fail.

Rebuild the release plan with `node lab/build-worker-generations.mjs`. It
refuses to build unless VLab still serves V's bytes.
