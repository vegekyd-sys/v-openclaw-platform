# vLab acceptance checklist

Complete one copy of this checklist for each release candidate. Evidence may be
linked from a pull request, but secrets, raw memory, sessions, and backups stay
server-side.

## Identity and ownership

- [ ] Release ID is recorded.
- [ ] OpenClaw source/version and artifact checksum are recorded.
- [ ] Platform commit and Node version are recorded.
- [ ] Experiment owner and reviewer are named.
- [ ] vLab host, agent, service, state path, workspace, and port are confirmed.
- [ ] Base snapshot and `last-known-good` rollback target are confirmed.

## Isolation

- [ ] vLab uses its own user, state, workspace, browser state, and port.
- [ ] No production channel, binding, token, cron, or external-write MCP is
      enabled unintentionally.
- [ ] V from Versa and private V services, PIDs, ports, and release pointers are
      unchanged.
- [ ] Only the declared experiment owner can replace the running vLab release.

## Gateway and model/tool behavior

- [ ] Gateway service is active with zero unexpected restarts.
- [ ] Gateway RPC succeeds.
- [ ] A real model response succeeds using the intended provider/model.
- [ ] A real write/read/delete tool sequence succeeds with no residue.
- [ ] Tool availability and denial policy match the release manifest.

## Memory integrity

- [ ] Memory index is not unexpectedly dirty.
- [ ] Embedding probe and vector store are available.
- [ ] Index identity is valid.
- [ ] File/chunk counts are compared with the recorded baseline.
- [ ] A fixed, non-sensitive search-query set is run against baseline and
      candidate; top results and obvious regressions are recorded.
- [ ] Memory write/read behavior is sampled when the candidate changes memory.

Restore the vLab state snapshot if any integrity check fails materially, even
when the schema migration is nominally backward-compatible.

## Session and agent behavior

- [ ] Representative copied sessions can be opened or resumed.
- [ ] Multi-turn context remains coherent.
- [ ] Known regression cases do not reproduce.
- [ ] V reviews prompts, answers, tool choices, memory behavior, and identity.
- [ ] The reply is visible through the declared test surface or preserved as an
      unmodified Gateway transcript when using the Feishu review relay.

## Environment-parity review

- [ ] `tests/vlab-production-parity.sh` passes against the versioned parity
      profile.
- [ ] Node/OpenClaw versions, Gateway restart policy, concurrency, Session
      visibility, Makaron workspace layout, Workshop config, Worker config, and
      exact Worker release match the profile.
- [ ] Differences in environment variables, model endpoints, runtime versions,
      filesystem layout, plugins, and expected load are listed.
- [ ] Each material difference is either tested, mitigated, or explicitly
      accepted.
- [ ] The exact accepted artifact can be staged on private V without rebuilding.

The profile intentionally does not copy production credentials, sessions,
memory, browser state, cron state, or the full production workspace. Hardware
limits and provider availability are explicit scaled differences; they are not
silently treated as parity.

## Rollback drill

- [ ] Candidate Gateway can be stopped.
- [ ] Previous release and config can be restored atomically.
- [ ] State restore procedure is documented and tested on vLab when migration
      risk is material.
- [ ] Restored Gateway RPC, model/tool behavior, memory integrity, and reply are
      verified.

## Explicit acceptance

- [ ] Codex records `CODEX LAB ACCEPT: <release_id>`.
- [ ] V records `V LAB ACCEPT: <release_id>`.
- [ ] Remaining risks are listed.

These two acceptances authorize only `LAB_ACCEPTED`. They do not authorize a
private-V production cutover. That requires Tianyi's explicit approval tied to
the same release ID and artifact checksum.
