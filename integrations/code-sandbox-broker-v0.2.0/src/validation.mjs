import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const ALLOWED_CPU = new Set(["500m", "1", "2"]);
const ALLOWED_MEMORY = new Set(["1Gi", "2Gi", "4Gi"]);
const BLOCKED_COMMANDS = new Set(["sudo", "mount", "nsenter", "docker", "podman", "systemctl", "reboot", "shutdown"]);

export function validateJobInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("job must be an object");
  const owner = String(value.owner ?? "").trim();
  const session = String(value.session ?? "").trim();
  const request = String(value.request ?? "").trim();
  const idempotencyKey = String(value.idempotencyKey ?? "").trim();
  const projectPath = String(value.projectPath ?? "").trim();
  if (!owner || owner.length > 128) throw new Error("owner is required and must be <= 128 characters");
  if (!session || session.length > 256) throw new Error("session is required and must be <= 256 characters");
  if (!request || request.length > 4000) throw new Error("request is required and must be <= 4000 characters");
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error("idempotencyKey is required and must be <= 200 characters");
  if (!projectPath) throw new Error("projectPath is required");

  const command = value.command;
  if (!Array.isArray(command) || command.length < 1 || command.length > 64) throw new Error("command must contain 1-64 argv entries");
  const argv = command.map((part) => String(part));
  if (argv.some((part) => Buffer.byteLength(part) > 4096)) throw new Error("command argument exceeds 4096 bytes");
  const base = path.basename(argv[0]);
  if (BLOCKED_COMMANDS.has(base)) throw new Error(`command ${base} is blocked by sandbox policy`);
  if (["sh", "bash", "zsh"].includes(base) && process.env.VLAB_SANDBOX_ALLOW_SHELL !== "1") {
    throw new Error("shell command requires the operator-only VLAB_SANDBOX_ALLOW_SHELL gate");
  }

  const cpu = String(value.cpu ?? "1");
  const memory = String(value.memory ?? "2Gi");
  if (!ALLOWED_CPU.has(cpu)) throw new Error("cpu must be 500m, 1, or 2");
  if (!ALLOWED_MEMORY.has(memory)) throw new Error("memory must be 1Gi, 2Gi, or 4Gi");
  const timeoutSeconds = Number(value.timeoutSeconds ?? 900);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 3600) {
    throw new Error("timeoutSeconds must be between 10 and 3600");
  }
  const networkProfile = String(value.networkProfile ?? "offline");
  if (!new Set(["offline", "packages"]).has(networkProfile)) throw new Error("networkProfile must be offline or packages");
  const collect = normalizeRelativePaths(value.collect ?? []);

  return { owner, session, request, idempotencyKey, projectPath, command: argv, cpu, memory, timeoutSeconds, networkProfile, collect };
}

export async function resolveAllowedProject(projectPath, roots = allowedRoots()) {
  const resolved = await realpath(projectPath);
  const stat = await lstat(resolved);
  if (!stat.isDirectory()) throw new Error("projectPath must be a directory");
  const allowed = await Promise.all(roots.map(async (root) => {
    try { return await realpath(root); } catch { return null; }
  }));
  if (!allowed.filter(Boolean).some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error(`projectPath is outside approved roots: ${roots.join(", ")}`);
  }
  return resolved;
}

export function allowedRoots(env = process.env) {
  return String(env.VLAB_SANDBOX_PROJECT_ROOTS ?? "/srv/vlab/projects:/srv/vlab/state/sandbox/projects")
    .split(":").map((value) => value.trim()).filter(Boolean);
}

export function normalizeRelativePaths(values) {
  if (!Array.isArray(values) || values.length > 32) throw new Error("collect must contain at most 32 paths");
  return values.map((value) => {
    const item = String(value).replaceAll("\\", "/");
    if (!item || item.startsWith("/") || item.split("/").some((part) => !part || part === ".." || part === ".")) {
      throw new Error(`unsafe artifact path: ${item || "<empty>"}`);
    }
    return item;
  });
}

export function safeId(value) {
  const normalized = String(value).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  if (!ID_RE.test(normalized)) throw new Error("could not derive a safe identifier");
  return normalized;
}
