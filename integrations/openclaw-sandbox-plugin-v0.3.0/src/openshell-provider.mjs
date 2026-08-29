import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipe, run } from "./process.mjs";

const SNAPSHOT_EXCLUDES = [
  ".git", ".env", ".env.*", ".openclaw", ".ssh", ".aws", ".config/gcloud",
  "node_modules", ".next", "dist", "build", "coverage", ".cache", "__pycache__",
  "*.pem", "*.key", "*.p12", "*.sqlite", "*.sqlite3", "sessions.json",
];
const WORKSPACE_RUNNER_PATH = "/sandbox/.versa/workspace-runner.py";

export class OpenShellProvider {
  constructor(env = process.env) {
    this.env = { ...env, OPENSHELL_GATEWAY: env.OPENSHELL_GATEWAY ?? "v-sandbox-1" };
    this.bin = env.OPENSHELL_BIN ?? "openshell";
    this.image = env.VLAB_SANDBOX_IMAGE ?? "base";
    this.policyDir = env.VLAB_SANDBOX_POLICY_DIR ?? "/srv/vlab/state/sandbox/policies";
    this.artifactsDir = env.VLAB_SANDBOX_ARTIFACTS_DIR ?? "/srv/vlab/state/sandbox-broker/artifacts";
  }

  async createWorkspace(workspace, hooks = {}) {
    const name = workspace.sandboxName ?? workspace.id;
    const startedAt = Date.now();
    await hooks.phase?.("create", { sandboxName: name });
    await this.createSandbox(name, workspace.input, "workspace-id", workspace.id);
    await hooks.phase?.("upload");
    await this.uploadProject(name, workspace.input.projectPath);
    await hooks.phase?.("runner");
    await this.installWorkspaceRunner(name);
    await hooks.phase?.("baseline");
    for (const argv of [
      ["git", "init", "-q"],
      ["git", "add", "-A"],
      ["git", "-c", "user.name=VLab Sandbox", "-c", "user.email=vlab-sandbox@invalid", "commit", "--allow-empty", "-qm", "baseline"],
    ]) {
      const result = await this.execInWorkspace(name, argv, { timeoutSeconds: 300, maxBytes: 1_000_000 });
      requireSuccess(result, `workspace baseline ${argv[1] ?? argv[0]}`);
    }
    const fingerprint = await this.execInWorkspace(name, ["git", "rev-parse", "HEAD"], { timeoutSeconds: 60, maxBytes: 1_000 });
    requireSuccess(fingerprint, "workspace baseline fingerprint");
    return {
      name,
      provider: "openshell",
      cpu: workspace.input.cpu,
      memory: workspace.input.memory,
      networkProfile: workspace.input.networkProfile,
      baseFingerprint: fingerprint.stdout.toString("utf8").trim(),
      totalMs: Date.now() - startedAt,
    };
  }

  async execWorkspace(workspace, input) {
    const startedAt = Date.now();
    const result = await this.execInWorkspace(workspace.sandboxName, input.command, {
      timeoutSeconds: input.timeoutSeconds,
      maxBytes: 2_000_000,
    });
    return {
      ok: result.code === 0,
      exitCode: result.code,
      signal: result.signal,
      stdout: result.stdout.toString("utf8"),
      stderr: result.stderr.toString("utf8"),
      stdoutTruncated: result.stdoutTruncated,
      stderrTruncated: result.stderrTruncated,
      commandMs: Date.now() - startedAt,
    };
  }

  async startWorkspaceExec(workspace, input) {
    const result = await this.execInWorkspace(
      workspace.sandboxName,
      ["python3", WORKSPACE_RUNNER_PATH, "start", input.operationId, String(input.timeoutSeconds)],
      {
        timeoutSeconds: 15,
        maxBytes: 500_000,
        stdin: Buffer.from(JSON.stringify(input.command)),
      },
    );
    requireSuccess(result, "workspace operation start");
    return parseRunnerJson(result, "workspace operation start");
  }

  async statusWorkspaceExec(workspace, input) {
    const result = await this.execInWorkspace(
      workspace.sandboxName,
      ["python3", WORKSPACE_RUNNER_PATH, "status", input.operationId, String(input.maxBytes ?? 200_000)],
      { timeoutSeconds: 15, maxBytes: Math.min(2_100_000, (input.maxBytes ?? 200_000) * 2 + 100_000) },
    );
    requireSuccess(result, "workspace operation status");
    return parseRunnerJson(result, "workspace operation status");
  }

  async cancelWorkspaceExec(workspace, input) {
    const result = await this.execInWorkspace(
      workspace.sandboxName,
      ["python3", WORKSPACE_RUNNER_PATH, "cancel", input.operationId, String(input.maxBytes ?? 200_000)],
      { timeoutSeconds: 15, maxBytes: Math.min(2_100_000, (input.maxBytes ?? 200_000) * 2 + 100_000) },
    );
    requireSuccess(result, "workspace operation cancel");
    return parseRunnerJson(result, "workspace operation cancel");
  }

  async listWorkspaceExecs(workspace) {
    const result = await this.execInWorkspace(
      workspace.sandboxName,
      ["python3", WORKSPACE_RUNNER_PATH, "list"],
      { timeoutSeconds: 15, maxBytes: 1_000_000 },
    );
    requireSuccess(result, "workspace operation list");
    return parseRunnerJson(result, "workspace operation list").operations ?? [];
  }

  async listWorkspaceFiles(workspace, input) {
    const target = remoteProjectPath(input.path);
    const result = await this.execInWorkspace(workspace.sandboxName, ["find", target, "-maxdepth", "4", "-type", "f", "-print"], {
      timeoutSeconds: 60,
      maxBytes: input.maxBytes,
      workdir: "/sandbox/project",
    });
    requireSuccess(result, "workspace file list");
    return { files: result.stdout.toString("utf8").split("\n").filter(Boolean).map(stripRemoteProjectPrefix), truncated: result.stdoutTruncated };
  }

  async readWorkspaceFile(workspace, input) {
    const result = await this.execInWorkspace(workspace.sandboxName, ["cat", "--", remoteProjectPath(input.path)], {
      timeoutSeconds: 60,
      maxBytes: input.maxBytes,
    });
    requireSuccess(result, "workspace file read");
    return { path: input.path, content: result.stdout.toString("utf8"), truncated: result.stdoutTruncated };
  }

  async writeWorkspaceFile(workspace, input) {
    const target = remoteProjectPath(input.path);
    const directory = path.posix.dirname(target);
    const created = await this.execInWorkspace(workspace.sandboxName, ["mkdir", "-p", "--", directory], { timeoutSeconds: 60 });
    requireSuccess(created, "workspace parent directory create");
    const written = await this.execInWorkspace(workspace.sandboxName, ["tee", "--", target], {
      timeoutSeconds: 60,
      maxBytes: 1_000,
      stdin: Buffer.from(input.content),
    });
    requireSuccess(written, "workspace file write");
    return { path: input.path, sizeBytes: Buffer.byteLength(input.content) };
  }

  async applyWorkspacePatch(workspace, input) {
    const result = await this.execInWorkspace(workspace.sandboxName, ["git", "apply", "--whitespace=nowarn", "-"], {
      timeoutSeconds: 120,
      maxBytes: 1_000_000,
      stdin: Buffer.from(input.patch),
    });
    requireSuccess(result, "workspace patch apply");
    return { applied: true, sizeBytes: Buffer.byteLength(input.patch) };
  }

  async finishWorkspace(workspace, input) {
    const head = await this.execInWorkspace(workspace.sandboxName, ["git", "rev-parse", "HEAD"], { timeoutSeconds: 60, maxBytes: 1_000 });
    requireSuccess(head, "workspace baseline verification");
    if (head.stdout.toString("utf8").trim() !== workspace.sandbox?.baseFingerprint) {
      throw new Error("workspace Git baseline changed; refusing an untrusted diff");
    }
    const staged = await this.execInWorkspace(workspace.sandboxName, ["git", "add", "-A"], { timeoutSeconds: 120 });
    requireSuccess(staged, "workspace stage changes");
    const statusResult = await this.execInWorkspace(workspace.sandboxName, ["git", "status", "--porcelain=v1"], { timeoutSeconds: 60, maxBytes: 1_000_000 });
    requireSuccess(statusResult, "workspace status");
    const diffResult = await this.execInWorkspace(workspace.sandboxName, ["git", "diff", "--cached", "--binary", "HEAD"], {
      timeoutSeconds: 120,
      maxBytes: 20_000_000,
    });
    requireSuccess(diffResult, "workspace diff");
    if (diffResult.stdoutTruncated) throw new Error("workspace diff exceeds 20 MB safety limit");

    await mkdir(this.artifactsDir, { recursive: true });
    const diffPath = path.join(this.artifactsDir, `${workspace.id}-changes.diff`);
    const diffTemp = `${diffPath}.${process.pid}.tmp`;
    await writeFile(diffTemp, diffResult.stdout, { mode: 0o600 });
    await rename(diffTemp, diffPath);
    const artifacts = await this.collectPaths(workspace.id, workspace.sandboxName, input.collect);
    const diffSha256 = createHash("sha256").update(diffResult.stdout).digest("hex");
    return {
      ok: true,
      status: statusResult.stdout.toString("utf8"),
      diffPreview: diffResult.stdout.subarray(0, 200_000).toString("utf8"),
      diffPreviewTruncated: diffResult.stdout.length > 200_000,
      diff: {
        handle: `artifact://${workspace.id}/changes.diff`,
        path: diffPath,
        sizeBytes: diffResult.stdout.length,
        sha256: diffSha256,
      },
      baseFingerprint: workspace.sandbox?.baseFingerprint,
      artifacts,
    };
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

  async createSandbox(name, input, idLabel, idValue) {
    const policy = path.join(this.policyDir, input.networkProfile === "packages" ? "packages-dev-v1.yaml" : "offline-dev-v1.yaml");
    const created = await this.openshell([
      "sandbox", "create", "--name", name, "--from", this.image,
      "--cpu", input.cpu, "--memory", input.memory,
      "--policy", policy, "--label", "managed-by=vlab-sandbox-broker",
      "--label", `${idLabel}=${idValue}`, "--detach", "--no-tty", "--no-auto-providers", "-o", "json",
    ], { maxBytes: 500_000 });
    requireSuccess(created, "sandbox create");
  }

  async uploadProject(name, projectPath) {
    const tarArgs = ["tar", "-czf", "-"];
    for (const excluded of SNAPSHOT_EXCLUDES) tarArgs.push(`--exclude=${excluded}`);
    tarArgs.push("-C", projectPath, ".");
    const uploaded = await pipe(tarArgs, this.openshellArgs([
      "sandbox", "exec", "-n", name, "--no-tty", "--timeout", "300", "--",
      "sh", "-lc", "mkdir -p /sandbox/project && tar -xzf - -C /sandbox/project",
    ]), { env: this.env });
    if (uploaded.first?.code !== 0 || uploaded.second.code !== 0) {
      throw new Error(`project upload failed: ${uploaded.stderr.toString("utf8").slice(-2000)}`);
    }
  }

  async installWorkspaceRunner(name) {
    const source = await readFile(new URL("./workspace-runner.py", import.meta.url));
    const directory = await this.execInWorkspace(name, ["mkdir", "-p", "/sandbox/.versa/ops"], {
      timeoutSeconds: 60,
      workdir: "/sandbox",
    });
    requireSuccess(directory, "workspace runner directory create");
    const installed = await this.execInWorkspace(name, ["tee", "--", WORKSPACE_RUNNER_PATH], {
      timeoutSeconds: 60,
      maxBytes: 1_000,
      stdin: source,
      workdir: "/sandbox",
    });
    requireSuccess(installed, "workspace runner install");
    const permissions = await this.execInWorkspace(name, ["chmod", "0700", WORKSPACE_RUNNER_PATH], {
      timeoutSeconds: 60,
      workdir: "/sandbox",
    });
    requireSuccess(permissions, "workspace runner permissions");
  }

  execInWorkspace(name, argv, options = {}) {
    return this.openshell([
      "sandbox", "exec", "-n", name, "--workdir", options.workdir ?? "/sandbox/project", "--no-tty",
      "--timeout", String(options.timeoutSeconds ?? 900), "--", ...argv,
    ], { maxBytes: options.maxBytes ?? 2_000_000, stdin: options.stdin });
  }

  async collect(job, name) {
    return this.collectPaths(job.id, name, job.input.collect);
  }

  async collectPaths(id, name, paths) {
    if (paths.length === 0) return [];
    await mkdir(this.artifactsDir, { recursive: true });
    const result = await this.openshell([
      "sandbox", "exec", "-n", name, "--workdir", "/sandbox/project", "--no-tty", "--timeout", "120", "--",
      "tar", "-czf", "-", "--", ...paths,
    ], { maxBytes: 50_000_000 });
    requireSuccess(result, "artifact collection");
    if (result.stdoutTruncated) throw new Error("artifact bundle exceeds 50 MB safety limit");
    const target = path.join(this.artifactsDir, `${id}.tgz`);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, result.stdout, { mode: 0o600 });
    await rename(temp, target);
    return [{
      handle: `artifact://${id}/bundle.tgz`,
      path: target,
      sizeBytes: result.stdout.length,
      sha256: createHash("sha256").update(result.stdout).digest("hex"),
      requestedPaths: paths,
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

function remoteProjectPath(relativePath) {
  if (relativePath === ".") return "/sandbox/project";
  return path.posix.join("/sandbox/project", relativePath);
}

function stripRemoteProjectPrefix(value) {
  return value.replace(/^\/sandbox\/project\/?/, "");
}

function requireSuccess(result, label) {
  if (result.code !== 0) throw new Error(`${label} failed: ${result.stderr.toString("utf8").slice(-2000)}`);
}

function parseRunnerJson(result, label) {
  try {
    return JSON.parse(result.stdout.toString("utf8"));
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}
