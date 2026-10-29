# Restore protected exec on the current composed Worker

The current composed Worker (upstream-5xx-fallback and later captured releases) lost the already-versioned worker-secret-egress initialization/revocation hooks. A real private Worker Agent had no opaque secret sentinel or proxy; the identical native-runtime route worked. This restores the existing module, not a plaintext transport or a new authorization API.

## Build and release scope

Run `node lab/build-worker-secret-egress-restore.mjs`. The baseline is the checked-in `lab/release-files/upstream-5xx-fallback/worker.mjs`, SHA256 `198bd1f5c254802f8112df4203a61c18ca98a6a9f23b03cb1c8493d10ec82fde`. The builder applies the existing patch and refuses any other baseline. Output SHA256 is `b4778b2ff804b9e6e39650c7778aadaa608b0de7c3a0c3c117a46a75b0d95353`. Later Worker features are byte-preserved. The companion file comes from the existing `worker-secret-egress/secret-egress-worker.mjs`. No core chunk, state migration, global config, business workflow or secret-store data changes.

Use `lab/worker-secret-egress-restore.plan.json` only after pinning the authorized base release. The null companion baseline is verified for this target; a target already containing a different companion needs explicit rebase. Do not blindly overwrite a newer Worker. This is an independent platform change, not part of NightShift PR30.

## Behavior and private acceptance

The proxy initializes before Worker prewarm; native exact-run authority and entry allowed-host substitution remain unchanged. It uses a per-Worker CA namespace, never Gateway's live CA directory. On Agent request completion its run authorization is revoked; last-request cleanup revokes remaining registrations. Disabled configuration/kill switch and startup failures stay fail-closed.

- Module and composition regression: 10/10.
- Actual DeepSeek/vlab-worker Agent before restoration: no opaque injection/proxy, zero HTTP.
- Same reviewed read-only probe after restoration: opaque sentinel and proxy present, official provider response code0, no supplier mutation. Run `9d0e5294-5ea4-4e18-b14e-db28a02d5d84`.
- Actual Worker boundary run `90f8486f-a30e-404b-a00d-fcd3f96bafbc`: unapproved host CONNECT403; after the run, old proxy authorization CONNECT407. No credential file/argv/transcript: run-local opaque proxy auth traveled only over a private local socket to an in-memory observer.
- Real Worker local-file workflow `NS-GENERIC-WORKER-1029-V3`: five native Agent cards, first-round negative verification, second-round success, downstream created once, final bytes/hash/source verified; zero external operations. Parent/compiler/schema paths and native session linkage verified. The independent verifier was corrected for handoff-directory-relative artifacts; existing cards/artifacts were not rerun or rewritten.

No production/shared Gateway restart or deployment. Private model-route proof is not successful TikTok login, decoration or business delivery. The real supplier trial failed with truthful negative verification and remains paused. Shared integration and production promotion require the user's approval.
