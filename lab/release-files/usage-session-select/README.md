# usage-session-select — sessions.usage reads only the rows it needs

Builds on usage-offload-v1 (PR #604, live on V since `startup-stall-usage-20261114`).
Investigation and evidence: `docs/sessions-usage-stall-20261120.md`.

## What happened (V, 2026-11-20 17:51 CST)

A /vcc (claude-cli) session in a Feishu DM, asked for its own token usage, ran
`openclaw gateway call sessions.usage --params '{"key":"agent:makaron:feishu:direct:ou_…"}'`
(17:51:13) and, after the CLI's 10 s timeout, the same call with a one-day range and
`--timeout 60000` (17:51:45). The Gateway answered after 29,826 ms and 65,909 ms. Its log
was silent 17:51:15–17:51:40 and 17:51:46–17:52:40, `liveness heartbeat delayed` reported
13.7 s and 41.1 s overdue, Feishu ingress catch-up timed out and DingTalk reconnected; heap
6.5 GiB, RSS 7.7 → 9.9 GiB (critical memory pressure).

## Why usage-offload-v1 did not cover it

1. `openclaw gateway call` connects with least-privilege scopes (`callGatewayCli` →
   `resolveLeastPrivilegeOperatorScopesForMethod`), i.e. `operator.read` for `sessions.usage`.
   usage-offload-v1 runs a whole usage RPC in the worker only for `operator.admin`
   (`canRunUsageRpcInWorker`), so the handler ran on the Gateway thread.
2. The handler's `selectUsageSessions` loads the agent's whole session store with the
   **full** projection, even for one session's usage. makaron on V: 25,866 `session_nodes`
   rows, 2.4 GB of `entry_json`. `skillsSnapshot` (avg 62 KB) and `systemPromptReport`
   (avg 34 KB) are 98% of it; the list projection without them is 37 MB. The only field the
   handler reads from those two is `systemPromptReport`, for `hasContextWeight` /
   `contextWeight` of the rows it returns.

The admin path (Control UI) has the same full-store read, inside the worker (4 GiB heap).

## Change (marker `usage-session-select-v1`)

Source: openclaw-versa `versa/port-usage-session-select-20261120` @ `13747d7e018`
(on `45b1333d152`, usage-offload-v1).

- One session's usage (`key`, instance grouping) reads only the rows its key or session id
  can match (`loadCombinedSessionStoreForGatewayCore` `match`, full projection).
- Lists read the list projection, then `loadUsageContextWeights` reads back exactly the
  `systemPromptReport` of the rows the reply includes (`limit`).
- Without a Gateway operator role (V has no `gateway.roles`) a read-scoped caller has no
  visibility filter and gets the admin reply, so it runs in the usage worker too. Callers
  under a role stay in-process (their readers still run in the worker).

| target | change |
|---|---|
| `openclaw/dist/usage-C3nh9kcO.js` | the three points above; `before` = V's current bytes (`44c5f048…`) |

Built by `node lab/build-usage-session-select.mjs --base <V bytes>`; plan
`lab/usage-session-select.plan.json`. Takes effect at the next Gateway start.

## Evidence (vlab91 candidates, 2026-11-20)

Data: shared VLab's makaron database grown to V's 25,866 rows / 2.33 GB of entry JSON with V's
size distribution and snapshot shapes (`lab/candidate/usage-session-select-setup.mjs`). A Gateway
stand-in loads the runtime's offload-wrapped `usage-C3nh9kcO.js` with V's node flags (12 GiB heap)
and replays V's calls (`usage-session-select-harness.mjs`).

| call | old (V's bytes, usage-offload-v1) | new (usage-session-select-v1) |
|---|---|---|
| C1 operator.read, key only (V 17:51:14) | 303.9 s, **Gateway loop stalled 300.4 s** | 151.5 s in the worker (cold first summary, also in old), **loop max 24 ms** |
| C2 operator.read, key + one day (V 17:51:46) | 22.7 s, **stall 22.6 s** | **119 ms**, loop max 8 ms |
| C3 admin, 30 days, limit 1000 (Control UI) | worker **OOM at 4 GiB (SIGABRT)**, report failed | 42.4 s in the worker, 78 rows, loop max 33 ms |
| stand-in heap peak | 3,334 MiB | 116 MiB |

Receipts: old `candidate-71589594…`, new `candidate-d5a87d00…`.

Reply equivalence (`usage-session-select-compare.mjs`, `candidate-8d938b1b…`, 8,000 rows): V's chunk
and the patched chunk in one process, same params, both caches fresh; the replies without
`updatedAt` are byte-identical for key only, key + day, 30-day list (limit 1000), key +
includeContextWeight, and 30-day family grouping.

## Rollback

Restore V's `usage-C3nh9kcO.js` (`44c5f048…`, the usage-offload-v1 release file).
`OPENCLAW_USAGE_OFFLOAD=0` still runs every usage handler in-process (then the narrow store
reads are what keeps the Gateway thread free).
