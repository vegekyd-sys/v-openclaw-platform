# V code sandbox lab v0.1.0

This candidate moves user- and agent-generated programming work out of the V
Gateway host and into disposable Vercel Sandbox microVMs.

## Boundary

- One sandbox per job; no cross-user filesystem or process sharing.
- Non-persistent by default; every completed or failed job deletes its sandbox.
- One vCPU / 2 GB RAM by default, with a 30-minute hard harness limit.
- Offline network by default. Package installation uses a fixed registry
  allowlist. Unrestricted egress requires an operator-only environment gate.
- Commands use argv execution. Shell commands are rejected unless an operator
  explicitly enables them.
- The Vercel OIDC token remains in the VLab runner process and is never passed
  into the sandbox.
- Inputs are size- and path-bounded. Outputs and collected artifacts are capped.

## Request contract

Send one JSON object on stdin:

```json
{
  "jobId": "python-test",
  "command": ["python3", "-m", "pytest", "-q"],
  "files": [{ "path": "test_app.py", "content": "def test_ok(): assert 2 + 2 == 4" }],
  "collect": ["pytest-report.json"],
  "vcpus": 1,
  "timeoutMs": 300000,
  "networkProfile": "offline"
}
```

Run with:

```bash
node bin/run-job.mjs < request.json
```

The process writes a single JSON result containing the exit code, bounded
stdout/stderr, artifact hashes/content, resource settings, and timing. The
`sandbox.deleted` field proves cleanup completed.

## VLab authentication

Use a short-lived `VERCEL_OIDC_TOKEN` from a dedicated Vercel project. Never
commit the token or copy a long-lived personal access token into VLab. The
current VLab secret file lives outside the repository and is mode `0600`.

## Acceptance fixtures

- `offline-smoke.json`: upload, execute, collect an artifact, and prove that
  arbitrary internet access is blocked.
- `node-test-smoke.json`: simulate a partner uploading source and running its
  test suite.
- `package-network-smoke.json`: allow an approved package registry while an
  unrelated domain remains blocked.
- `timeout-smoke.json`: prove that a bounded job is terminated and its sandbox
  is deleted.
- `npm run smoke:concurrency`: run five independent sandboxes concurrently and
  confirm that every sandbox is deleted.
- `npm run smoke:preview`: start a real web service, reach its ephemeral public
  preview, validate the response, and delete the VM.

## Production status

VLab candidate only. It is not wired into production V or exposed as an
OpenClaw tool yet.
