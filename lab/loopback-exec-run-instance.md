# /vcc cron: OpenClaw exec fails with "Secret egress proxy requires an admitted agent run instance"

Tianyi, 2026-11-08: group `oc_fab91abe705f55cc63751731d9a258ab` (十二家) daily schedule card said the
calendar and the family mailbox were not scanned because the tool environment failed with this error.

## What happened (V, read-only)

- Cron `0a46c5c9`「十二家｜每日当天行程置顶」(created 11/02, account scheduled policy) has an explicit
  `toolsAllow: [message, memory_search, memory_get, exec]` and ran on claude-cli (claude-opus-5-5).
- An explicit list makes the claude-cli grant use OpenClaw's own coding tools over the MCP loopback
  ("mediated" tools) instead of Claude Code's native Bash. Every `mcp__openclaw__exec` call, even
  `echo ok` and `date`, returned the error (claude-cli transcripts, 11/06 08:00, 11/08 08:00 and
  09:09 CST). The first occurrence is 11/06 08:00, before cron-default-owner-tools-20261107 (#563).
- V runs with `secrets.egressProxy.enabled: true`. With the proxy on, Gateway-host exec registers the
  subprocess against the run's operational instance (`bash-tools.exec-run`); the loopback built the
  mediated exec without one, although each CLI grant is bound to exactly one admitted run.
- Ordinary /vcc chat turns (tool list `*`) use Claude Code's native Bash and are not affected.

## Change (`loopback-exec-run-instance-v1`, 2 V files, needs a Gateway restart)

- `mcp-http-BL3X6y4w.js`: pass the bound grant's `admittedRunContext.operationalRunInstance` into tool
  resolution and add it to the loopback tool cache key (a row must never carry one run's exec to
  another). Requests without a bound grant pass none and still fail closed.
- `tool-resolution-Con11qMn.js`: hand it to `createOpenClawCodingTools` for the mediated coding tools,
  which already forwards it to exec defaults (as the embedded runner does).

Source: openclaw-versa `versa/fix-loopback-exec-run-instance-20261108` (`647f1203f38`) on
`versa/port-cron-native-creator-20261107` (`595ee2bf4aa`). Build:
`node lab/build-loopback-exec-run-instance.mjs --base <dir with core/dist/<name> as V runs it>`;
plan `lab/loopback-exec-run-instance.plan.json`.

## Tests

- versa (Node 22.23.1, `test/vitest/vitest.gateway-core.config.ts`): three new assertions, each fails
  without the change: mediated exec with an active egress proxy registers the admitted run and runs
  (and still refuses without one); the CLI grant's admitted run reaches tool resolution; the tool
  cache does not share a row across run instances. `tool-resolution*`, `mcp-http*`, `tools-invoke*`:
  13 files, 274 tests pass. `tsgo core`: only the known baseline error.
- `lab/loopback-exec-run-instance.test.mjs` (6): plan vs V bytes, marker/parse/idempotence, the exact
  inserted lines, and that the loopback forwards the rest of its scope params to tool resolution.

## VLab candidate (end to end)

`lab/candidate/loopback-exec-run-instance/`: a private candidate Gateway with the secret egress proxy
turned on (the shared VLab config has no `secrets.egressProxy`, V does), makaron on claude-cli, and a
cron job shaped like 0a46c5c9 (explicit tool list with `exec`, account policy). Claude Code is replaced
by `fake-claude.mjs` (installed with `install-fake.sh`, removed after the runs), which reads the
`--mcp-config` OpenClaw passes and calls `tools/call exec` over the real loopback.

| | baseline (V bytes) | fixed |
|---|---|---|
| loopback `exec` | `Secret egress proxy requires an admitted agent run instance` | ok |
| proof file | none | written |

Receipts: baseline `candidate-214db0f2-3352-4ca5-b5a2-e5cde19dff2b`, fixed
`candidate-e3c7095b-9b4b-41df-a65b-07e2c94d60e6`, 2026-11-08 CST.

## Not covered

- Real Claude Code (the fake makes the MCP call directly; Claude Code's own MCP client and permission
  handling are not exercised). The CLI argv shows OpenClaw allows `mcp__openclaw__exec`.
- lark-cli itself in that cron (it needs the egress proxy's credential bindings, which the candidate
  has none of); only that exec now runs.
- Other mediated paths: `tools-invoke-shared` (HTTP direct coding tool) and the Feishu voice tools also
  build mediated coding tools; they were not changed here.
