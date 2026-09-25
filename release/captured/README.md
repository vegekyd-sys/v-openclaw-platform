# Captured production runtime

Each `<release>/` here holds the exact bytes by which a live host's OpenClaw
runtime differs from its upstream base install, plus a `manifest.json` that
records where they came from and when.

**These are not a source build.** They are the existing production state, lifted
off the server so that it can be rebuilt from git at all. Until every entry is
either produced by a source build or deliberately retired, this directory is the
only thing standing between us and "the only copy was on that machine".

## Why it exists

Before this capture, 32 of the 75 files that make production V different from
stock OpenClaw 2026.9.1 existed nowhere but the server. There was no build that
could reproduce the running release, which is why every deployment had to be a
hand-carried patch applied against whatever the live bytes happened to be.

See [`docs/release-workflow-v2.md`](../../docs/release-workflow-v2.md).

## Refresh the capture

```bash
node scripts/capture-production-runtime.mjs \
  --host v \
  --release v2026.9.1-db91.6 \
  --runtime /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist \
  --base    npm:openclaw@2026.9.1 \
  --upstream 2026.9.1 \
  --sourceCheckout /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/source \
  --out release/captured/v2026.9.1-db91.6
```

Read-only on the host, and safe to run while another line is deploying.

Diff against the **published package** (`npm:openclaw@<version>`), not against
an install directory on the host. V's `/opt/openclaw-2026.9.1-v` had been
patched in place too, so the first captures against it missed 18 production
patches (db91 gate/throttle/provenance, bash-tools, selection, reply-prefix,
worker placement, ...). Against the pristine package the core diff is 96 files.

## Check it

```bash
# repo side, no network: git holds bytes for everything the manifest declares
node scripts/verify-release-reproducible.mjs \
  --manifest release/captured/v2026.9.1-db91.6/manifest.json

# live side: has anything been patched in place since the capture?
node scripts/verify-release-reproducible.mjs \
  --manifest release/captured/v2026.9.1-db91.6/manifest.json \
  --host v --unit openclaw-gateway.service
```

Non-zero exit means drift. A capture goes stale the moment somebody patches the
running release, which is the point: the manifest records `capturedAt`, so the
drift shows up as a diff instead of quietly becoming the new normal.

## Reading `manifest.json`

| field | meaning |
| --- | --- |
| `files[].kind` | `modified` — the base has this path with different bytes; `added` — the base does not have it at all |
| `files[].alsoInRepo` | where identical bytes already existed in the repo, or `null` if the server held the only copy |
| `files[].hostMtime` | when the file was last written on the host. Timestamps later than the release directory's own creation are in-place edits to a supposedly immutable release |
| `residue[]` | leftover `.bak` / `.predeploy-*` files from earlier in-place patching. Bytes are deliberately **not** captured; they are recorded because they enter the deploy channel's directory fingerprint and have blocked releases before |
| `counts.capturedOnly` | files whose only copy was the server. **This number should go to zero.** |

`residue[].alsoInBase` marks residue the base install already carried, so the
base directory is not pristine upstream either.
