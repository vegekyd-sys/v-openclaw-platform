// Checks after the planned restart on the mirror (run as root):
//   node post-restart-check.mjs <readyEpochSeconds>
// - A9 receipts: one per agent database in the current epoch directory
//   (newest .db91-integrity/<epoch>/, written by this Gateway), each under its
//   current fence (<db revoked nonce>|<global revoked nonce>).
// - No revocation of this epoch records a failure (verification-failed /
//   native-terminal-failure), including its reason history.
// - Journal since ready: no "slow OpenClaw agent database open", no unhandled
//   rejections. Prints counts and reasons only.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Shared VLab: VERSA_ROOT, VERSA_UNIT_NAME, VERSA_EXPECT_RECEIPTS override the mirror defaults.
const R = process.env.VERSA_ROOT ?? "/srv/versa-mirror95", UNIT = process.env.VERSA_UNIT_NAME ?? "versa-mirror95-gateway";
const EXPECT = Number(process.env.VERSA_EXPECT_RECEIPTS ?? 8);
const readyAt = Number(process.argv[2]);
if (!(readyAt > 0)) throw new Error("usage: post-restart-check.mjs <readyEpochSeconds>");
const run = (c, a) => execFileSync(c, a, { encoding: "utf8", timeout: 120_000, maxBuffer: 256 << 20 }).trim();
const pid = Number(run("systemctl", ["show", UNIT, "-p", "MainPID", "--value"]));
const envVar = (name) => fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").find((e) => e.startsWith(`${name}=`))?.slice(name.length + 1);
// The gate epoch/dir are set by the Gateway itself at startup (not in the
// launch environment): the newest <state>/.db91-integrity/<epoch>/ is this run's.
const root = envVar("OPENCLAW_DB91_INTEGRITY_STATE_ROOT") ?? `${R}/state`;
const base = path.join(root, ".db91-integrity");
const epoch = envVar("OPENCLAW_DB91_INTEGRITY_EPOCH") ?? fs.readdirSync(base).filter((d) => fs.statSync(path.join(base, d)).isDirectory())
  .sort((a, b) => fs.statSync(path.join(base, b)).mtimeMs - fs.statSync(path.join(base, a)).mtimeMs)[0];
const dir = path.join(base, epoch ?? "");
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const FAIL = new Set(["verification-failed", "native-terminal-failure"]);
const out = { pid, epoch, dir, dirMtime: epoch ? fs.statSync(dir).mtime.toISOString() : null, receipts: 0, current: 0, stale: [], revocations: {}, failures: [] };
if (epoch && fs.existsSync(dir)) {
  const files = fs.readdirSync(dir);
  const global = readJson(path.join(dir, "global.revoked.json"));
  for (const f of files.filter((f) => f.endsWith(".json") && !f.endsWith(".revoked.json") && f !== "global.revoked.json")) {
    out.receipts += 1;
    const key = f.slice(0, -5);
    const r = readJson(path.join(dir, f));
    const rev = readJson(path.join(dir, `${key}.revoked.json`));
    const fence = `${rev?.nonce ?? "none"}|${global?.nonce ?? "none"}`;
    if (r?.epoch === epoch && r?.fence === fence) out.current += 1; else out.stale.push(key.slice(0, 12));
  }
  for (const f of files.filter((f) => f.endsWith(".revoked.json"))) {
    const m = readJson(path.join(dir, f));
    const reasons = [m?.reason, ...(m?.history ?? []).map((h) => h.reason)].filter(Boolean);
    for (const reason of reasons) out.revocations[reason] = (out.revocations[reason] ?? 0) + 1;
    if (m?.failure || reasons.some((x) => FAIL.has(x))) out.failures.push({ db: f.slice(0, 12), reason: m?.failure?.reason ?? m?.reason });
  }
}
const since = new Date(readyAt * 1000).toISOString().replace("T", " ").slice(0, 19);
const j = run("journalctl", ["-u", UNIT, "--since", `${since} UTC`, "--no-pager", "-o", "cat"]);
const count = (needle) => j.split(needle).length - 1;
out.journalSinceReady = {
  slowAgentDbOpen: count("slow OpenClaw agent database open"),
  unhandledRejection: count("Unhandled promise rejection") + count("unhandledRejection"),
  verificationFailed: count("verification-failed"),
  integrityVerifierFailed: count("database integrity verifier failed"),
  delegateSubgroupMirrorOnly: count("Expected systemd DelegateSubgroup"),
  livenessWarnings: count("liveness"),
  compactionFallback: count("falling back to LLM") + count("configured but not registered"),
  modelRouteChanged: count("Model route changed"),
};
out.pass = out.receipts === EXPECT && out.current === EXPECT && out.failures.length === 0 &&
  out.journalSinceReady.slowAgentDbOpen === 0 && out.journalSinceReady.unhandledRejection === 0;
console.log(JSON.stringify(out, null, 2));
