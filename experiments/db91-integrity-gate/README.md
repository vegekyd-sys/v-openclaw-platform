# DB91 integrity gate

Scoped repair of OpenClaw 2026.9.1 synchronous whole-agent-database checks during
ordinary cold opens. Default is OFF. This does not change the Worker pool,
models, providers, channel bindings, ownership, foreign keys, or migration rules.

## Mechanism and limits

- Before Gateway admission, an isolated child checks existing agent DBs serially
  using the native integrity and FK verifier, in a source read transaction.
  The original verifier normally inspects a temporary snapshot; that snapshot
  must not be used as proof that a different source inode passed inspection.
- A private, owned, lifecycle-specific receipt permits other processes in that
  Gateway lifecycle to reuse the completed check. Native schema, ownership,
  permission and canonical index contracts still run on open. Repair and
  migration retain full verification. A miss uses native strict verification.
- Receipts bind epoch, canonical path, owner, schema/cookie/hash, device/inode,
  creation identity, minimum file length, timestamp and revocation nonce.
  Native checker identity is captured before opening the file. Successful
  receipts cannot overwrite a newer revocation. Cached handles are guarded
  against path replacement and confirmed terminal failures.
- Existing periodic verification remains active and can refresh successful
  receipts. Receipts expire after 26 hours; a new Gateway boot has a new epoch.
- This is a shared lifecycle cache, not an immutable-file certificate. Normal
  SQLite transactions can change data after verification, just as with an open
  native connection. Arbitrary same-inode/same-size external corruption is not
  instantaneously detected by the receipt; native access errors, quarantine and
  scheduled full verification remain the detection mechanisms.
- Restart includes full preflight time. Missing/incompatible proofs fall back
  to strict native opening; check failure prevents Gateway admission. The gate
  does not promise that every source of end-to-end chat latency is fixed.

## Verification to date

41 local tests pass, including real 9.1 bundle anchors, full-check protocol,
foreign-key failure, process failure/timeout, expiration, schema/owner/file
replacement, truncation, revocation races, native migration anchors and safe
rollback of partially applied files without overwriting concurrent changes.

Private VLab `db91-fix`, owner `codex-db91-contention-20260907`, port 26300,
CPU quota 1 core, main/Worker execution capacity 2. No production DB copied.

The user explicitly requested the existing complete VLab DB. A closed
2,523,619,328-byte Makaron snapshot was copied into the owned instance and
verified byte-for-byte against its untouched source before testing. SHA-256:
`cadca5d374c353ea48e6f97a32f2672dc6207641ded33161e2783d8040fa3f8f`.
No private rows or transcripts were exported. Schema 19, owner `makaron`,
67 tables, 459 session nodes/windows and 19,205 transcript events.

| Complete DB case | Measured result |
|---|---|
| Initial native cold open | 61.32 s |
| Two native cold opens | 53.99 / 54.07 s |
| One serial native full preflight | 50.33 s |
| Six fresh process opens after preflight, waves of two | 0.374–0.595 s; all reuse=1, full=0 |
| Explicit revocation, subsequent full revalidation | 14.86 s; full=1 |

OS page cache was not cleared; these are measured conditions, not a capacity
claim or a forecast of production latency. The remaining full-check cost is
not hidden: it moves before admission and is amortized across cold processes.
Counts and owner remained unchanged across these opens. Earlier 269 MB and
1.076 GB synthetic native cases also retained FK failure/recovery behavior,
but do not substitute for this complete DB test.

The accepted private copy was moved into the owned Gateway's Makaron agent
state. Full preflight at startup completed in 49.107 s. The real DeepSeek
two-Worker test then produced actual exec calls/results and final replies in
22.04 / 24.09 s. Each exact Worker PID reported epoch present, reuse=1, full=0.
45 health requests had zero failures, p95=69 ms, maximum=872 ms. Two explicit
new test sessions were used; no external channel messages were sent. This is
not high-concurrency, shared integration, production or whole-chat-regression
acceptance. The first status-tool attempt failed because the Lab-only tool
manifest omitted its new contract; the manifest was fixed before this pass.

## Install and rollback

`scripts/patch-db91-integrity-gate.mjs check CORE` requires exact native anchors.
`apply CORE NEW_BACKUP_DIR` records complete before/after bytes, then installs
five native file edits and two helpers. Run only on a stopped owned runtime or
an exclusive restart-time pre-step. `ensure` is idempotent only when every
previously installed byte still matches; it refuses partial/concurrent drift.

Enable with `OPENCLAW_DB91_INTEGRITY_ENABLE=1`, an explicit canonical
`OPENCLAW_DB91_INTEGRITY_STATE_ROOT`, and `OPENCLAW_CONFIG_PATH`. Child processes
must inherit the generated epoch/directory; a client CLI does not start a new
Gateway epoch. Do not transplant another Gateway's receipts.

`rollback CORE BACKUP_DIR` accepts only exact before/after file contents and
refuses any unrelated edit before changing files. It also supports an
interrupted installation. Restore/remove the opt-in service environment and
restart under the applicable ownership/lease rules. Do not change or restore
user DB contents, model settings or unrelated patches as part of code rollback.
