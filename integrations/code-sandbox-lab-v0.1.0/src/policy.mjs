import { randomBytes } from "node:crypto";

const JOB_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MAX_FILES = 100;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_FILE_BYTES = 5_000_000;
const MAX_COMMAND_PARTS = 64;
const MAX_COMMAND_PART_BYTES = 4096;

const PACKAGE_DOMAINS = Object.freeze([
  "registry.npmjs.org",
  "npmjs.com",
  "*.npmjs.com",
  "pypi.org",
  "files.pythonhosted.org",
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
]);

export function parseJobRequest(value, env = process.env) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("request must be a JSON object");
  }

  const jobId = String(value.jobId ?? "").trim();
  if (!JOB_ID_RE.test(jobId)) {
    throw new Error("jobId must match /^[a-z0-9][a-z0-9-]{0,47}$/");
  }

  const command = value.command;
  if (!Array.isArray(command) || command.length === 0 || command.length > MAX_COMMAND_PARTS) {
    throw new Error(`command must contain 1-${MAX_COMMAND_PARTS} argv entries`);
  }
  const argv = command.map((part) => String(part));
  if (argv.some((part) => Buffer.byteLength(part) > MAX_COMMAND_PART_BYTES)) {
    throw new Error(`command entries must be <= ${MAX_COMMAND_PART_BYTES} bytes`);
  }
  if (["sh", "bash", "/bin/sh", "/bin/bash"].includes(argv[0]) && env.VLAB_SANDBOX_ALLOW_SHELL !== "1") {
    throw new Error("shell execution is disabled by policy");
  }

  const vcpus = Number(value.vcpus ?? 1);
  if (![1, 2, 4].includes(vcpus)) {
    throw new Error("vcpus must be one of 1, 2, or 4");
  }

  const timeoutMs = Number(value.timeoutMs ?? 5 * 60_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30 * 60_000) {
    throw new Error("timeoutMs must be between 1000 and 1800000");
  }

  const networkProfile = String(value.networkProfile ?? "offline");
  if (!["offline", "packages", "allow-all"].includes(networkProfile)) {
    throw new Error("networkProfile must be offline, packages, or allow-all");
  }
  if (networkProfile === "allow-all" && env.VLAB_SANDBOX_ALLOW_ALL_NETWORK !== "1") {
    throw new Error("allow-all network is disabled by policy");
  }

  const files = normalizeFiles(value.files ?? []);
  const collect = normalizeCollect(value.collect ?? []);
  const cwd = normalizeAbsoluteSandboxPath(value.cwd ?? "/vercel/workspace");

  return {
    jobId,
    command: argv,
    vcpus,
    timeoutMs,
    networkProfile,
    networkPolicy: resolveNetworkPolicy(networkProfile),
    files,
    collect,
    cwd,
  };
}

export function resolveNetworkPolicy(profile) {
  if (profile === "offline") return "deny-all";
  if (profile === "allow-all") return "allow-all";
  return { allow: [...PACKAGE_DOMAINS] };
}

export function sandboxName(jobId, now = Date.now(), nonce = randomBytes(4).toString("hex")) {
  const timestamp = new Date(now).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `vjob-${jobId.slice(0, 24)}-${timestamp}-${nonce}`;
}

function normalizeFiles(files) {
  if (!Array.isArray(files) || files.length > MAX_FILES) {
    throw new Error(`files must be an array with at most ${MAX_FILES} entries`);
  }
  let total = 0;
  return files.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("file entries must be objects");
    const path = normalizeRelativePath(entry.path);
    const content = entry.contentBase64 != null
      ? Buffer.from(String(entry.contentBase64), "base64")
      : Buffer.from(String(entry.content ?? ""), "utf8");
    if (content.byteLength > MAX_FILE_BYTES) throw new Error(`${path} exceeds ${MAX_FILE_BYTES} bytes`);
    total += content.byteLength;
    if (total > MAX_TOTAL_FILE_BYTES) throw new Error(`files exceed ${MAX_TOTAL_FILE_BYTES} bytes total`);
    return { path, content };
  });
}

function normalizeCollect(paths) {
  if (!Array.isArray(paths) || paths.length > 20) throw new Error("collect must have at most 20 paths");
  return paths.map(normalizeRelativePath);
}

function normalizeRelativePath(value) {
  const path = String(value ?? "").replaceAll("\\", "/");
  if (!path || path.startsWith("/") || path.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`unsafe relative path: ${path || "<empty>"}`);
  }
  return path;
}

function normalizeAbsoluteSandboxPath(value) {
  const path = String(value ?? "");
  if (path !== "/vercel/workspace" && !path.startsWith("/vercel/workspace/")) {
    throw new Error("cwd must stay under /vercel/workspace");
  }
  if (path.split("/").includes("..")) throw new Error("cwd cannot contain ..");
  return path;
}
