# Worker config roll: a hot config change always reaches running Workers (2026.9.1)

## Problem

The Worker plugin derives `worker-openclaw.json` from the Gateway config in two
places:

- at plugin registration (`workerRuntimeConfigSync`), which never rolls;
- in the config watch (`createWorkerConfigWatch`), which rolls only when its own
  derivation rewrote the file.

On a `models.*` hot reload 9.1 registers the plugin again. When that
registration writes the file first, the watch's derivation finds it "already
current" and the live generation keeps the old config. Candidate `b11377d3`
(PR #434, 2026-10-19): after the DeepSeek budget change, running Workers kept
`max_tokens` 384000 until `scripts/v-workers-roll.mjs` rolled them by hand. On
V the same change at 17:44 CST happened to go the other way and rolled.

## Change

| Target | Before (V) | After |
|---|---|---|
| `production-worker/index.mjs` | `cfa0e687…` | `e657c62b…` |
| `production-worker/worker-config-watch.mjs` | `88354155…` | see plan |

1. Each Worker generation records the Worker config it was created with
   (`runtime.workerConfigSnapshot`: sha256 + parsed config), taken when
   `acquireSharedPool` creates the generation.
2. The watch follows the Worker file as well as the Gateway file. After one
   quiet interval it derives as before, then compares the file on disk with the
   live generation's snapshot and rolls when they differ, whichever code path
   wrote the file. Its own rewrite does not count as a new change.
3. The meta exemption stays: if everything that differs is under `meta`, it
   does not roll. A later real change rolls and reports the meta difference too.
4. A failed roll leaves the snapshot old, so the next change retries it with all
   accumulated differences.
5. `vlab.workers.status` reports `workerConfigSha256` of the live generation.

The registration-time derivation is unchanged. A registration that rewrites the
file now moves the Worker file's fingerprint, and the watch of the registration
that owns the service rolls within two intervals (about 10 s).

## Build

```
node lab/build-worker-config-roll.mjs --base <dir with worker/index.mjs from V>
```

It refuses to build unless the input is V's `cfa0e687…` and writes
`lab/worker-config-roll.plan.json`. Shipping replaces `index.mjs`, which needs a
Gateway restart.

## Tests

- `node --test tests/worker-config-roll.test.mjs`: V's captured plugin bytes
  (`release/captured/v2026.9.1-db91.6-codex-ds-window-20261019.worker`) with
  these files over them, real derivation on real files. Covers both orders,
  the control (V's current watch never rolls in the registration-first order),
  meta-only changes, no live generation, a failed roll, and that the release
  index is V's bytes plus only this change.
- Candidates: `lab/candidate/worker-config-roll.plan.json` (OLD → NEW budget)
  and `lab/candidate/worker-config-roll-reverse.plan.json` (NEW → OLD, V's state
  since 2026-10-19), both with `HOT_OPERATOR_ROLL=0`.

## Candidate evidence (2026-10-19, VLab, real DeepSeek, `HOT_OPERATOR_ROLL=0`)

Both runs hit the losing order from PR #434: the re-registration rewrote the
Worker file about 2 s after the write, and the watch's own derivation at about
9 s found it "already current". The watch still rolled, because the file
differed from what generation 1 was spawned with.

| Run | Direction | Roll | pre | in-flight 45 s turn | post ×3 |
|---|---|---|---|---|---|
| `candidate-62c017e9` @ `a151b11c` | 384000 → 64000 | gen 1 → 2, 16.2 s after the write | 384000 | ok, finished in gen 1 | 64000 |
| `candidate-bca53d70` @ `e90a7827` | 64000 → 384000 | gen 1 → 2, 18.2 s after the write | 64000 | ok, finished in gen 1 | 384000 |

No Gateway restart, no `pool is closing`, no failed turns. `workerConfigSha256`
changed with the generation in both runs. Control: `b11377d3` (PR #434, V's
current watch, same script without the operator roll) kept 384000.
