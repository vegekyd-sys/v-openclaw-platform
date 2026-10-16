# Bounded sharing reads candidate

Status: local implementation and contract checks only. Native same-snapshot
performance/permission A/B is required before proposing this patch for merge.
No Gateway restart, shared deployment or production change is part of this task.

## Problem and scope

The live sharing lookup performs one exact native read per selected session.
The existing bulk-cache alternative avoids those reads when the full metadata
cache is valid, but a cold cache or another SQLite connection's COMMIT rebuilds
all session metadata even for a small selected page. A prior native A/B found
clear small-page regressions; fewer SQL statements alone did not prove improvement.

This candidate changes only the synchronous `sessions.list` sharing phase:

- Use the existing canonical resolver to discover the requested lookup keys and
  all candidate stores. Resolve real matches and cross-store duplicates through
  that same resolver after loading; the planning pass does not authorize access.
- Prepare a request-local cache for both the live warm-exact and existing bulk
  cache modes. This does not require deploying the previous sharing policy chunk.
- Reuse a valid native metadata snapshot without filling a missing/stale cache.
- Otherwise read only requested nodes and their participants in chunks of 400,
  using the original JSON/owner/participant projection and canonical checks.
  Nodes and participants share a native deferred SQLite read transaction.
- Preserve missing, invalid-row and transcript-window tombstone handling, and
  the original caller's read-error degradation. A persisted row with no parsed
  cached entry must go through the original invalid/tombstone validation.

The cache is constructed and consumed in the same synchronous phase after the
async session-selection stage. Point mutation authorization, its revalidation
after awaits, member reads, aliases, role policy and event broadcast are unchanged.
There are no schema migrations, scheduler, concurrency, admission or FTS changes.

## Review and replay

`patch-session-sharing-bounded-reads.mjs` contains all transformations.
`session-sharing-bounded-reads-plan.json` binds the four release chunks to their
captured predecessor SHA256 values. Capture baseline code with official
`vlab.mjs read-code`, then run the build script against that captured directory;
never patch the shared runtime in place.

Local checks:

```sh
npx --yes --package=node@22.23.1 node --test \
  lab/session-sharing-bounded-reads.test.mjs \
  lab/exact-sharing-lookup.test.mjs \
  lab/canonical-scan-path-cache.test.mjs
```

Native replay uses `session-sharing-bounded-reads-candidate.json` through the
official candidate runner, only after the shared owner clears the disk budget.
It does not require a lease and does not start a Gateway or call a model. The
snapshot script copies selected metadata tables with full JSON and real native
schemas, not transcripts or credentials. Source/copy table hashes must agree.

The candidate compares live exact reads, the previous dev bulk-cache variant,
and bounded reads on the same private snapshot at 25/100/500/2000 selected rows,
with warm/cold metadata, the native list prelude, and a real external COMMIT
between prelude and sharing. It also compares native permission results and
member revocation after await, native alias ownership, rollover proof rejection,
and repeated page reads while an independent SQLite writer keeps committing.
Each comparison must resolve all requested real rows and match complete native
targets; zero/empty results are not a pass.

This is sharing-stage evidence. It cannot establish complete RPC latency,
Feishu delivery, model/tool time, or responsiveness with twelve business agents.
