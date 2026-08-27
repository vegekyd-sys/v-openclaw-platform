import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipe, run } from "./process.mjs";

const SNAPSHOT_EXCLUDES = [
  ".git", ".env", ".env.*", ".openclaw", ".ssh", ".aws", ".config/gcloud",
  "node_modules", ".next", "dist", "build", "coverage", ".cache", "__pycache__",
  "*.pem", "*.key", "*.p12", "*.sqlite", "*.sqlite3", "sessions.json",
];

export class OpenShellProvider {
  constructor(env = process.env) {
    this.env = { ...env, OPENSHELL_GATEWAY: env.OPENSHELL_GATEWAY ?? "v-sandbox-1" };
    this.bin = env.OPENSHELL_BIN ?? "openshell";
    this.image = env.VLAB_SANDBOX_IMAGE ?? "base";
    this.policyDir = env.VLAB_SANDBOX_POLICY_DIR ?? "/srv/vlab/state/sandbox/policies";
    this.artifactsDir = env.VLAB_SANDBOX_ARTIFACTS_DIR ?? "/srv/vlab/state/sandbox-broker/artifacts";
  }

  async execute(job, hooks = {}) {
    const name = job.sandboxName ?? job.id;
    const policy = path.join(this.policyDir, job.input.networkProfile === "packages" ? "packages-dev-v1.yaml" : "offline-dev-v1.yaml");
    const startedAt = Date.now();
    await hooks.phase?.("create", { sandboxName: name });
    const created = await this.openshell([
      "sandbox", "create", "--name", name, "--from", this.image,
      "--cpu", job.input.cpu, "--memory", job.input.memory,
      "--policy", policy, "--label", "managed-by=vlab-sandbox-broker",
      "--label", `job-id=${job.id}`, "--detach", "--no-tty", "--no-auto-providers", "-o", "json",
    ], { maxBytes: 500_000 });
    requireSuccess(created, "sandbox create");

    await hooks.phase?.("upload");
    const tarArgs = ["tar", "-czf", "-"];
    for (const excluded of SNAPSHOT_EXCLUDES) tarArgs.push(`--exclude=${excluded}`);
    tarArgs.push("-C", job.input.projectPath, ".");
    const uploaded = await pipe(tarArgs, this.openshellArgs([
      "sandbox", "exec", "-n", name, "--no-tty", "--timeout", "300", "--",
      "sh", "-lc", "mkdir -p /sandbox/project && tar -xzf - -C /sandbox/project",
    ]), { env: this.env });
    if (uploaded.first?.code !== 0 || uploaded.second.code !== 0) {
      throw new Error(`project upload failed: ${uploaded.stderr.toString("utf8").slice(-2000)}`);
    }

    await hooks.phase?.("execute");
    const commandStartedAt = Date.now();
    const executed = await this.openshell([
      "sandbox", "exec", "-n", name, "--workdir", "/sandbox/project", "--no-tty",
      "--timeout", String(job.input.timeoutSeconds), "--", ...job.input.command,
    ], { maxBytes: 2_000_000 });
    const commandMs = Date.now() - commandStartedAt;

    await hooks.phase?.("collect");
    const artifacts = await this.collect(job, name);
    return {
      ok: executed.code === 0,
      exitCode: executed.code,
      stdout: executed.stdout.toString("utf8"),
      stderr: executed.stderr.toString("utf8"),
      stdoutTruncated: executed.stdoutTruncated,
      stderrTruncated: executed.stderrTruncated,
      artifacts,
      sandbox: { name, provider: "openshell", cpu: job.input.cpu, memory: job.input.memory, networkProfile: job.input.networkProfile },
      timing: { commandMs, totalMs: Date.now() - startedAt },
    };
  }

  async collect(job, name) {
    if (job.input.collect.length === 0) return [];
    await mkdir(this.artifactsDir, { recursive: true });
    const result = await this.openshell([
      "sandbox", "exec", "-n", name, "--workdir", "/sandbox/project", "--no-tty", "--timeout", "120", "--",
      "tar", "-czf", "-", "--", ...job.input.collect,
    ], { maxBytes: 50_000_000 });
    requireSuccess(result, "artifact collection");
    const target = path.join(this.artifactsDir, `${job.id}.tgz`);
    await writeFile(target, result.stdout, { mode: 0o600 });
    return [{
      handle: `artifact://${job.id}/bundle.tgz`,
      path: target,
      sizeBytes: result.stdout.length,
      sha256: createHash("sha256").update(result.stdout).digest("hex"),
      requestedPaths: job.input.collect,
    }];
  }

  async delete(name) {
    const result = await this.openshell(["sandbox", "delete", name], { maxBytes: 500_000 });
    if (result.code !== 0 && !/not found|does not exist/i.test(`${result.stdout}\n${result.stderr}`)) {
      throw new Error(`sandbox delete failed: ${result.stderr.toString("utf8").slice(-1000)}`);
    }
  }

  async listManaged() {
    const result = await this.openshell(["sandbox", "list", "--selector", "managed-by=vlab-sandbox-broker", "-o", "json"]);
    requireSuccess(result, "sandbox list");
    return JSON.parse(result.stdout.toString("utf8") || "[]");
  }

  openshellArgs(args) { return [this.bin, ...args]; }
  openshell(args, options = {}) { return run(this.openshellArgs(args), { ...options, env: this.env }); }
}

function requireSuccess(result, label) {
  if (result.code !== 0) throw new Error(`${label} failed: ${result.stderr.toString("utf8").slice(-2000)}`);
}
