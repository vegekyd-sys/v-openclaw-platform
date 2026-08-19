# VLab acceptance report

Date: 2026-08-20 (Asia/Shanghai)

Host boundary: the isolated VLab machine. Production V was not changed or
restarted.

## Results

| Case | Result | Evidence |
| --- | --- | --- |
| Static policy | PASS | 6/6 tests passed |
| Offline execution | PASS | source upload, Python execution, artifact readback, unrelated network blocked |
| Source test suite | PASS | uploaded Node project, 1/1 test passed |
| Dependency network | PASS | npm registry returned 200; unlisted domain was blocked |
| Timeout cleanup | PASS | 30-second task ended at about 3.8 seconds; sandbox deletion confirmed |
| Five-way concurrency | PASS | 5/5 independent VMs completed in 7.9 seconds; all deleted |
| Web simulation | PASS | real HTTP service reached through ephemeral preview; marker verified; VM deleted |
| Residual resources | PASS | no runner process remained; provider list returned zero active/listed sandboxes |
| VLab OpenClaw health | PASS | Gateway and Worker remained active, `NRestarts=0` |

Observed VM creation was usually 0.6–1.8 seconds; the preview case created in
2.9 seconds. These are lab observations, not an SLA.

## Controls proven by the candidate

- one VM per job;
- non-persistent execution;
- offline-by-default firewall;
- bounded package-only egress;
- argv execution with shell disabled by default;
- bounded inputs, outputs, and artifacts;
- cleanup on success and error/timeout;
- provider credential kept in the runner, never injected into partner code.

## Not yet production-approved

- The current VLab OIDC credential is short lived; production needs automatic
  credential rotation or a dedicated access-token/identity broker.
- The OpenClaw tool/RPC, queue, rate limit, ownership check, cancellation relay,
  audit, and artifact storage are not wired yet.
- Long-running jobs, malicious workload tests, and 20+ concurrency soak remain
  production gates.
- Cloudflare has been evaluated from official architecture/pricing material but
  not live-deployed because its local CLI authentication is expired.
