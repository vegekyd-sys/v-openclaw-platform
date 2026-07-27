# V release protocol

This protocol defines how Codex and V experiment in vLab and how an accepted
result can later be promoted to private V without making production the first
execution environment.

## Non-negotiable boundaries

1. Git tracks code, release intent, migrations, and verification logic. It does
   not track V's live memory, sessions, credentials, browser profiles, or
   generated artifacts.
2. Private V is reached through its current Tailscale administration route.
   vLab and V from Versa remain separate deployment boundaries.
3. Only one Gateway may own private V's Feishu ingress at a time.
4. Neither V nor Codex can promote a release to private V alone. Production
   requires:
   - Codex engineering acceptance;
   - V agent/user-flow acceptance;
   - Tianyi's explicit production approval.
5. A release is not accepted because a process is green. It must pass Gateway
   RPC, real model and tool execution, memory checks, and visible reply
   verification appropriate to the environment.

## What is committed

Every release candidate identifies immutable inputs:

- OpenClaw source commit or upstream package version;
- build artifact checksum;
- Node runtime version;
- v-openclaw-platform commit;
- configuration transformation and schema version;
- forward migration and rollback procedure;
- automated tests and acceptance evidence.

The following remain server-side and are never committed:

- `MEMORY.md`, `memory/*`, memory SQLite files, and embedding caches;
- session transcripts and `sessions.json`;
- tokens, `.env`, credentials, and channel configuration;
- browser state and generated media;
- raw production or vLab backups.

Small synthetic, anonymized fixtures may be committed when a regression test
needs deterministic memory or session input.

## Release candidate identity

Use:

```text
vlab-YYYYMMDD-<openclaw-source-sha>
```

The release manifest records:

```text
release_id
openclaw_source
artifact_sha256
platform_commit
node_version
config_schema
migration_id
base_snapshot_id
experiment_owner
```

`base_snapshot_id` is a server-side reference, not a path or backup uploaded to
GitHub.

## Shared vLab operating model

Both V and Codex may propose and run experiments, but vLab has one experiment
owner at a time.

Before changing vLab, the owner records:

- goal and expected behavior;
- source branch and release candidate;
- base snapshot;
- files/state expected to change;
- validation commands;
- rollback target.

The other agent may inspect and review during the experiment, but must not
replace the running release or mutate the same state until ownership is
released. Parallel destructive experiments require separate vLab cells, not
shared mutable state.

## Phase A: deploy to vLab

1. Confirm the live host, agent, service, ports, and current release.
2. Create a server-side vLab backup reference for config and mutable state.
3. Install the candidate into a new immutable release directory. Never modify
   `/opt/vlab/current` in place.
4. Apply configuration changes to a staged config and validate it before
   switching.
5. Run state migrations against a copied or backed-up vLab state.
6. Atomically switch `/opt/vlab/current` to the candidate and restart only the
   vLab service.
7. Verify:
   - vLab Gateway RPC;
   - loopback-only port and no production channel ownership;
   - real model response;
   - at least one real tool call with no residue;
   - memory status, embedding probe, search, and index identity;
   - representative copied-session behavior;
   - resource use and restart count;
   - V from Versa and private V remain unchanged.
8. V reviews agent behavior and user-visible semantics. Codex reviews
   implementation, isolation, tests, and operational evidence.

The candidate becomes `LAB_ACCEPTED` only after both V and Codex explicitly
accept it.

## Phase B: production promotion

Production promotion is a separate operation and requires Tianyi to say that
the accepted release may be promoted.

1. Connect to private V through Tailscale and re-confirm host identity.
2. Capture the current release pointer, config checksum, service definition,
   and a consistent server-side state backup.
3. Stage the exact artifact and checksum already accepted in vLab.
4. Validate the staged config and migration without taking Feishu ownership.
5. Announce a short cutover window.
6. Stop the current private-V Gateway, take the final consistent mutable-state
   checkpoint, atomically switch release/config, and start the new Gateway.
7. Verify receive -> dispatch/session -> visible Feishu reply, plus Gateway,
   model/tool, memory, and resource checks.
8. Mark `PROD_VERIFIED` only after the visible reply is confirmed.

No source rebuild, dependency upgrade, or unreviewed config change is allowed
between vLab acceptance and production promotion.

## Rollback

Rollback targets are recorded before deployment:

- previous immutable release path;
- previous config checksum and server-side backup;
- pre-migration state snapshot;
- rollback command/procedure;
- state compatibility decision.

Rollback is triggered when any of these occur:

- Gateway RPC or startup fails;
- Feishu receive, dispatch, or visible reply fails;
- model/tool execution fails;
- memory index is invalid, unexpectedly dirty, or materially degraded;
- a migration is incomplete or cannot be proven compatible;
- restart loops, abnormal resource pressure, or high-severity errors appear;
- Tianyi, V, or Codex calls stop during the cutover.

Rollback order:

1. Stop the candidate Gateway.
2. Restore the previous release and config atomically.
3. Restore mutable state only when the migration changed it incompatibly.
4. Start the previous Gateway.
5. Verify Gateway RPC and a visible Feishu reply.
6. Preserve failed-release logs and evidence; do not overwrite the accepted
   backup.

## Approval state machine

```text
DRAFT
  -> V_REVIEWED
  -> LAB_DEPLOYED
  -> LAB_ACCEPTED (V + Codex)
  -> PROD_APPROVED (Tianyi)
  -> PROD_DEPLOYED
  -> PROD_VERIFIED | ROLLED_BACK
```

An approval must be explicit and tied to a release ID. Silence, a green service
card, or acceptance of a different commit is not approval.

## Tomorrow's first vLab update

Tomorrow is Phase A only. Before starting, V and Codex will restate:

- the release candidate ID and exact commits;
- experiment owner;
- expected changes and non-goals;
- base snapshot and rollback target;
- acceptance checklist.

No private-V production cutover is included in tomorrow's vLab work.
