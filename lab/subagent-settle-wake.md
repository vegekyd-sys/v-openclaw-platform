# Subagent results that never reach their parent (settle wake)

Tianyi, 2026-11-08: in group `oc_a59571a219066065613b6cb340e01f1c` the /vcc parent sent out
subagents and never got their results back.

## What happened (V, 2026-11-07, read-only from state DB and Gateway file log)

The parent turn (claude-cli, started 23:03) yielded with four children, all of which finished `ok`:

| run | how it was created | ended | task row |
|---|---|---|---|
| `284f7211` vision_probe | `sessions_spawn`, model `deepseek/deepseek-flash` | 23:37:29 | `cli` (Gateway tracking row), owner = child |
| `2c17924c` login B | `sessions.create` over WS | 23:48:18 | `subagent` |
| `80102aa6` login C | `sessions.create` over WS | 23:51:27 | `subagent` |
| `35b17b8c` login A | `sessions.create` over WS | 23:55:17 | `subagent` |

1. The requester settle wake that hands the batch back to the parent failed three times:
   `requester settle wake attempt 1 failed; retrying in 30s: In-process gateway dispatch requires a
   gateway request scope or instance binding (method: agent)` (23:55:19, 23:55:50, then 23:57:50).
   `getSharedGatewayContextResolver` keeps a batch's resolver only when every child holds the same
   resolver *function*. Each registration fences the Gateway instance in a new closure
   (`fenceScheduledGatewayContextResolver`), and the spawned child carries the tool call's resolver,
   so this batch got the rejecting binding `() => undefined` although all four fence one live Gateway.
2. Giving up called `blockSubagentCompletionDelivery` for each child. For `284f7211` it returned
   false because its only task row is the Gateway's `cli` tracking row for the same run id, and
   `completeRequesterSettleWakeBatch` threw `subagent completion owner changed before settlement`.
   The batch stayed `dispatching` and re-armed every minute (still looping at 00:00): no reply, no
   blocked notice. The results are intact in `subagent_runs.payload_json` (`completion.resultText`).

In 14 days 3 of 4 spawns with an explicit model got a `cli` row (0 of 3,105 without one); why the
native-subagent tracking marker is missing on that path is not established here.

## Change (`subagent-settle-wake-shared-gateway-v1`, 2 V files)

- `gateway-request-scope-CmMd3nUp.js`: owners with different resolver functions share a resolver that
  resolves each and returns the context only when all resolve to the same live instance context
  (`context.resolveGatewayContext()`). Another instance, a retired one, or a mix of bound and unbound
  owners still rejects; identical or wholly unbound owners are unchanged.
- `subagent-completion-admission.store-JmpNDYTF.js`: when a completion's task row is the Gateway `cli`
  row for the same run id and child session, block the registry delivery alone (delivery `failed`,
  completion suppressed, row persisted) and leave the CLI row and its notices alone, instead of
  reporting an owner change. Everything else keeps the old checks.

Source: openclaw-versa `versa/fix-subagent-owner-changed-20261108` (`e02a568d77a`) on
`versa/port-cron-native-creator-20261107` (`595ee2bf4aa`, what V runs). Build:
`node lab/build-subagent-settle-wake.mjs --base <dir with V's bytes>`; plan
`lab/subagent-settle-wake.plan.json`. Needs a Gateway restart.

## Tests

- `lab/subagent-settle-wake.test.mjs` (8): plan vs V bytes, marker/parse/idempotence, the shared
  resolver against stubs (the 11/07 batch shape shares; a retired instance, another instance, mixed
  bound/unbound reject; identical owners unchanged; V's current function returns `undefined` for the
  same batch), and `blockSubagentCompletionDelivery` (CLI row of the same run: registry-only block;
  CLI row of another child, another run id, or an unsettled subagent task: refused; ordinary subagent
  row: task projection and blocked notice as before).
- versa: `gateway-request-scope.test.ts` +1 (fails without the change), 
  `subagent-completion-admission.store.test.ts` +2 (the CLI-row case fails without the change).

## VLab candidate (end to end)

`lab/candidate/subagent-settle-wake/` (`baseline.plan.json` V's bytes, `fixed.plan.json` the two release
files): a private candidate Gateway with mock Feishu and real DeepSeek. The parent (a /vds session, whose
tools run in the Gateway like V's /vcc parent) spawns two `visible=true` children with
`expectsCompletionMessage=true` and calls `sessions_yield`. Under a Worker parent visible children are
created with `expectsCompletionMessage: false`, so that harness cannot reproduce this.

| | baseline (V today) | fixed |
|---|---|---|
| children | 2 visible (`:dashboard:`), `ok`, `completion_handoff_pending`, yield batch | same |
| settle wake | `attempt 1 failed; retrying in 30s: In-process gateway dispatch requires a gateway request scope or instance binding`, then attempt 2 | dispatched, no binding failure |
| parent final card with both children's tokens | none | one |

Receipts: baseline `candidate-6aeb06bf-10ad-4cb9-a93f-d9a471bc32dc` (PASS), fixed
`candidate-12675a66-ff4b-46f5-a6f1-bcbf375a7245` (PASS), 2026-11-08 02:33–02:36 CST.

## Not covered yet

- The stuck batch on V: it is `dispatching` with attempt 3, so after the restart the wake replays its
  dispatch with the now-working binding (deferring first, up to 10 times, while other children of
  the parent are still running); if that is refused the batch now settles as failed instead of
  looping. Check the group afterwards.
- The /vcc (claude-cli) parent itself: VLab candidates have no Claude login; /vds exercises the same
  Gateway-side spawn and settle path.
- Why a spawn with an explicit model gets a Gateway `cli` row instead of a `subagent` row.
