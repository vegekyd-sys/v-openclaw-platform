# V programming sandbox decision

## Recommendation

Use **Vercel Sandbox first** behind a small V-owned runner. Keep Cloudflare
Sandbox as the second provider adapter, not the first production path.

The important boundary is provider-independent:

1. OpenClaw submits a bounded job manifest to the Gateway-owned runner.
2. The runner creates one disposable VM per job. It never executes partner code
   on the Gateway or Worker host.
3. Source files enter the VM; only bounded stdout, stderr, and declared
   artifacts leave it.
4. The VM has no V credentials. Network is offline by default; dependency jobs
   receive only the fixed package-registry allowlist.
5. Completion, failure, cancellation, and timeout all converge on VM deletion.

## Why Vercel is first

- It is a Firecracker microVM boundary with a direct Node SDK, per-sandbox
  filesystem/process/network isolation, firewall policy, ephemeral preview
  ports, and non-persistent deletion.
- The VLab runner has completed real upload, test, artifact, firewall, preview,
  timeout, and five-way concurrency acceptance.
- It needs only a runner process and does not require moving V's Gateway onto
  another platform.

Production must not use Vercel defaults blindly: persistence and unrestricted
egress are explicitly disabled by this wrapper.

Official references: [overview](https://vercel.com/docs/sandbox),
[authentication](https://vercel.com/docs/sandbox/concepts/authentication),
[firewall](https://vercel.com/docs/sandbox/concepts/firewall),
[pricing](https://vercel.com/docs/sandbox/pricing).

## Why Cloudflare is second

Cloudflare's design is attractive for the longer term: each sandbox is a VM,
global placement is better for Asian users, account-level concurrency is much
larger, and the outbound handler can broker credentials without exposing them
inside the sandbox. Its list price is also generally lower for sustained jobs.

It is not the first deployable path today because the Sandbox 1.0 SDK is still
a preview, durable job recovery needs external state because an idle/replaced
container loses local processes and files, and the integration requires a
Worker, Durable Object, and Container deployment. The current Cloudflare CLI
credential is expired, so no claim of live VLab acceptance is made.

Official references: [overview](https://developers.cloudflare.com/sandbox/),
[security](https://developers.cloudflare.com/sandbox/concepts/security/),
[lifecycle](https://developers.cloudflare.com/sandbox/1-0-preview/lifecycle/),
[pricing](https://developers.cloudflare.com/sandbox/platform/pricing/),
[limits](https://developers.cloudflare.com/sandbox/platform/limits/).

## Cost shape

Using current list prices and excluding egress:

- Vercel 1 vCPU / 2 GB: about **$0.1704 per running hour**; a 10-minute job is
  about **$0.028**.
- Vercel 2 vCPU / 4 GB: about **$0.3408 per running hour**; a 10-minute job is
  about **$0.057**.
- Cloudflare standard-2 (1 vCPU / 6 GiB), if CPU were busy for the whole hour,
  is roughly **$0.126/hour plus disk** before included usage. Actual CPU billing
  follows consumed CPU time, while memory/disk follow allocated duration.

Costs must be enforced with per-user concurrency, daily minute budgets, timeout,
and deletion; switching providers is not a substitute for those controls.

## Production rollout shape

The VLab runner is deployable now, but production V is intentionally untouched.
The next release should add only:

- a Gateway-owned `code_sandbox` RPC/tool adapter;
- a small queue with per-user and global concurrency limits;
- signed job ownership and artifact handles;
- audit metadata without source code or secrets;
- cancellation and idempotent completion delivery;
- a provider adapter boundary so Cloudflare can be added later.

This should be a sidecar integration, not a patch to OpenClaw core, so OpenClaw
upgrades remain independent.
