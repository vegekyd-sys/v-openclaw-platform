# System Agent DeepSeek Flash VLab candidate

## Scope

The V configuration assistant already resolves to the default agent's
`deepseek/deepseek-flash` model. Its verified, session-bound control-plane
inference currently inherits the default agent's explicit `vlab-worker`
runtime. That Worker does not report the exact runtime artifact required by the
System Agent binding, so verification falls through to unrelated fallback
models instead of adopting DeepSeek Flash.

This candidate changes only the System Agent inference-route projection. When
all of the following are true, the route selects the built-in OpenClaw harness:

- the model owner is the configured ambient/default agent;
- the selected model is exactly `deepseek/deepseek-flash`;
- the inherited explicit runtime is exactly `vlab-worker`.

Other owners, models, providers, explicit runtimes, normal chat routing,
credentials, tools, and approval policy are unchanged. This is not an error
fallback and does not retry a failed model call.

## Pre-merge evidence

- The shared VLab target SHA256 is
  `9d64dbf86259ecc8af74a7d55d34281b2c9253c7e91cd45fee9de1372f6b70f1`.
- The release artifact is generated from that exact file and changes one line.
- Focused tests cover the intended route, every preserved route class, guarded
  and idempotent patching, baseline drift refusal, and the exact output digest.
- No VLab or production configuration, runtime, process, or state is changed by
  the pre-merge build and tests.

## Post-merge VLab acceptance gate

After Tianyi explicitly approves merging this commit into `dev`, acquire the
shared integration lease and package the one-file code artifact. Deploy it only
to shared VLab, then require all of the following before acceptance:

1. `openclaw.setup.verify` returns `ok=true` and identifies
   `deepseek/deepseek-flash` without trying unrelated fallback owners.
2. A benign `openclaw.chat` request returns a real Chinese reply through the
   configuration assistant.
3. A restart request produces an operator-approval proposal and does not
   restart before approval; decline the proposal and verify the Gateway PID and
   restart count remain unchanged.
4. A normal Makaron chat still uses its configured Worker route and returns a
   persisted terminal reply.
5. Gateway RPC, Memory lookup, and one ordinary tool call remain functional;
   no new binding, approval, Worker, or SQLite errors appear in the test window.

Failure means rollback of this one code file and preservation of VLab
configuration and conversations. Production promotion is a separate decision
after VLab acceptance and must use the accepted exact artifact.
