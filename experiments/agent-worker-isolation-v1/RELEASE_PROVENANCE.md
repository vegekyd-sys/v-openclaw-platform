# Worker Isolation v0.1.4 release provenance

This source directory preserves the exact files deployed in production under release identity:

- Production release identity: `663c53681bee347501c89d5420112ea02aae9468`
- Package version: `0.1.4`
- Production artifact path at capture time: `/opt/openclaw-experiments/agent-worker-isolation-v1/releases/663c53681bee347501c89d5420112ea02aae9468`
- Captured: `2026-07-29` (Asia/Shanghai)

The production release identity predated its Git backfill and is not the Git commit created by this backfill. The annotated Git tag records the mapping instead of pretending both hashes are identical.

## Verify source files

From `experiments/agent-worker-isolation-v1`:

```bash
sha256sum -c release-manifest-v0.1.4-663c536.sha256
node --test ./*.test.mjs
```

## Reproduce the artifact directory

Copy only the paths listed in `release-manifest-v0.1.4-663c536.sha256` into an empty directory, preserving filenames. The resulting files must produce the same SHA-256 values. `RELEASE_PROVENANCE.md` and the manifest itself are repository metadata and were not part of the original production artifact.
