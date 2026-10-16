# Bounded sharing reads candidate

Status: native same-snapshot three-arm comparison passed in the official private
candidate runner. Shared Gateway integration acceptance remains pending. No shared
deployment, Gateway restart or production change was made by this task.

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

## Native result (2026-10-17)

Candidate `candidate-c1c9cc2b-59aa-4269-a955-05a22569c57b` used runtime
`1496f7d693b00056d3777c777aa6fe23d13f2e6308885593f515bcdac9c93d7e` and
input `fba4cc17166cd1bf12ffb3bc394ae769256dd4c008afa027ca1f78c3e19a7c0f`.
The source metadata snapshot contained 4254 native sessions (173371392 bytes).
All 32 three-arm comparisons resolved every selected real row and agreed on full
targets and permission projections. 1522 permission projections, native alias
ownership, member revocation after await, rollover, missing rows and a corrupt-row
valid-sibling fallback passed. The shared Gateway PID/config/runtime stayed unchanged.

Sharing-stage measurements (milliseconds, two separate samples per static regime):

| Page / regime | Current live exact | Unpromoted dev bulk | Bounded |
| --- | ---: | ---: | ---: |
| 25, cold | 16–28 | 715–752 | 8.5–10.7 |
| 25, prelude + external COMMIT | 17.9–22.5 | 734–763 | 15.8–22.7 |
| 500, cold | 351–493 | 797–924 | 159–175 |
| 500, prelude + external COMMIT | 350–419 | 809–851 | 184–198 |
| 2000, warm | 1279–1285 | 58–70 | 152–195 |
| 2000, prelude + external COMMIT | 1319–1370 | 863–962 | 599–622 |

In the cold bounded arm, native node rows materialized exactly matched the selected
page size (25/100/500/2000); warm arms read zero node rows. No measured bounded page
fell back to per-row or whole-store reads. The native list prelude is additional
time and is reported separately in the data; this table is not full RPC latency.

A genuinely independent SQLite connection repeatedly updated a native-created
private session's normalized timestamp and JSON, outside the selected page, during
six reads per arm. All arms returned identical page contents and observed real
data_version changes. Median sharing time: live/bulk/bounded was 30/740/6ms at25,
410/833/172ms at500, and 1172/789/484ms at2000. Observed writer rates ranged about
108–117 commits/s; there is no business-throughput conclusion from this small test.

The bounded design retains a deliberate tradeoff: large purely warm pages are
slower than the unpromoted bulk-cache alternative (which has clear cold/churn
regressions), while remaining substantially faster than the current live exact
reader. One 25-row inter-stage-COMMIT sample was22.72ms versus22.49ms live; this
is not a claim that every individual sample improved. No twelve-business-agent
or user-visible delivery acceptance is implied.

Sanitized exact measurements and assertion results are checked in at
`lab/experiments/session-sharing-bounded-20261017.json`. Runtime chunks/test inputs
remain the same as the tested implementation commit; later evidence documentation
does not change candidate inputs.
