#!/usr/bin/env node
// Reuse the existing authenticated /voice/ service after shared acceptance.
// The unit, access secret and tunnel route remain owned by the original entry.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { digest, freezeSource, validateSharedProof, fileIdentity, H5_PATHS } from "./gpt-live-h5-release.mjs";

export function validateReviewedPresentation(proof, request) {
  assert.equal(request.h5Only, true, 'A review waiver only applies to H5 presentation');
  assert.equal(proof.schema, 'user-reviewed-h5-presentation-v1');
  assert.equal(proof.sourceCommit, request.commit); assert.equal(proof.owner, request.owner);
  assert.equal(proof.h5FilesSha, digest(JSON.stringify(fileIdentity(request.files))));
  assert.equal(proof.authorization, 'skip-shared-h5-validation-and-publish');
  assert(/^[a-f0-9]{64}$/u.test(proof.artifactSha), 'Gateway baseline artifact required');
  assert(Array.isArray(proof.runtimeFiles) && proof.runtimeFiles.length > 0);
  for (const file of proof.runtimeFiles) {
    assert(/^(openclaw|production-worker|npm\/projects)\/[A-Za-z0-9._@/-]+$/u.test(file.target) && !file.target.split('/').includes('..'));
    assert(/^[a-f0-9]{64}$/u.test(file.after));
  }
}

export function assertEntrySnapshot(expected, actual) {
  for (const key of ["pointer", "unitSha", "launchDropInSha", "environmentSha", "gatewayPid", "gatewayStart", "gatewayInvocation", "configSha"])
    assert.equal(actual[key], expected[key], `Voice entry ${key} changed`);
  assert.equal(actual.openVoices, 0, "A voice call is open; do not replace the entry");
  if ('relayConnections' in expected) assert.equal(actual.relayConnections, 0, 'The H5 relay has a connection; defer the upgrade');
}
export function entryLaunchOverride(execStart, server, nativeEnvironment = "") {
  assert(/^\/opt\/openclaw-voice-h5\/releases\/[A-Za-z0-9._-]+\/lab\/gpt-live-h5\/server\.mjs$/.test(server));
  assert(!nativeEnvironment || /^\/opt\/openclaw-voice-h5\/releases\/[A-Za-z0-9._-]+\/native-voice.env$/.test(nativeEnvironment));
  const match = /^\{\s*path=([^;]+);\s*argv\[\]=([^;]+);\s*ignore_errors=(yes|no)\s*;/.exec(execStart);
  assert(match && !/[\r\n]/.test(match[2]), "Voice launcher definition unavailable");
  const entries = match[2].match(/\/opt\/openclaw-voice-h5\/[A-Za-z0-9._/-]+\/server\.mjs/g);
  assert.equal(entries?.length, 1, "Exactly one owned voice entrypoint required");
  // Node resolves a main-module symlink before import.meta.url comparison.
  // Launch the frozen real path so both the CLI guard and asset paths agree.
  return "[Service]\nExecStart=\nExecStart=" + match[2].trim().replace(entries[0], server) + "\n"
    + (nativeEnvironment ? "EnvironmentFile=" + nativeEnvironment + "\n" : "");
}
async function remoteMain(req) {
  const fs = await import("node:fs"), path = await import("node:path"), crypto = await import("node:crypto");
  const { execFileSync } = await import("node:child_process"), { request } = await import("node:http");
  const run = (bin, args) => execFileSync(bin, args, { encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  const proof = req.productionReview ?? req.sharedProof;
  if (req.productionReview) validateReviewedPresentation(proof, req);
  const hash = file => digest(fs.readFileSync(file));
  const properties = unit => Object.fromEntries(run("systemctl", ["show", unit, "-p", "MainPID,InvocationID,ActiveState,FragmentPath"])
    .split("\n").map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
  const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  const unit = "openclaw-rtc-h5.service", base = "/opt/openclaw-voice-h5", pointer = base + "/current";
  const launchDropIn = "/etc/systemd/system/" + unit + ".d/90-gpt-live-entry-launch.conf";
  const dir = base + "/releases/gpt-live-" + req.commit, wantedPointer = dir + "/lab/gpt-live-h5";
  const gateway = properties("openclaw-gateway.service"), gp = Number(gateway.MainPID);
  assert(gp > 1 && gateway.ActiveState === "active", "Production Gateway is unavailable");
  const env = Object.fromEntries(fs.readFileSync(`/proc/${gp}/environ`, "utf8").split("\0").filter(Boolean).map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
  const argv = fs.readFileSync(`/proc/${gp}/cmdline`, "utf8").split("\0");
  const entry = argv.find(value => value.endsWith("/dist/index.js"));
  assert(entry?.startsWith("/opt/") && argv.includes("gateway"), "Not a production Gateway");
  const runtime = path.dirname(path.dirname(entry));
  for (const file of proof.runtimeFiles) {
    const target = file.target.startsWith("openclaw/") ? path.join(runtime, file.target.slice(9))
      : file.target.startsWith('production-worker/') ? path.join(path.dirname(runtime), "worker", file.target.slice("production-worker/".length))
      : path.join(env.HOME, '.openclaw', file.target);
    assert.equal(hash(target), file.after, "V runtime differs from the shared accepted artifact");
  }
  const state = env.OPENCLAW_STATE_DIR ?? path.dirname(env.OPENCLAW_CONFIG_PATH);
  const countVoices = () => Number(run("python3", ["-c", "import sqlite3,json,sys; d=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); r=d.execute('select value_json from cache_entries where scope=?',('talk-client-voice-sessions',)); print(sum(json.loads(x[0]).get('status') not in ('closed','expired') for x in r))", path.join(state, "agents/makaron/agent/openclaw-agent.sqlite")]));
  const observe = () => ({ pointer: fs.readlinkSync(pointer), unitSha: digest(run("systemctl", ["cat", unit])),
    launchDropInSha: fs.existsSync(launchDropIn) ? hash(launchDropIn) : null,
    environmentSha: hash(path.join(state, "rtc-h5.env")), gatewayPid: gp,
    gatewayStart: fs.readFileSync(`/proc/${gp}/stat`, "utf8").split(") ")[1].split(/\s+/u)[19],
    gatewayInvocation: gateway.InvocationID, configSha: hash(env.OPENCLAW_CONFIG_PATH), openVoices: countVoices(),
    // Direct providers live in the H5 process, outside the Gateway voice DB.
    // A conservative socket check also protects those calls during cutover.
    ...(req.h5Only ? { relayConnections: run('ss', ['-H', '-tnp', 'state', 'established', '( sport = :26242 )']).split('\n').filter(Boolean).length } : {}) });
  const snapshot = observe();
  const metadata = { schema: "gpt-live-voice-entry-v1", commit: req.commit, release: req.release, owner: req.owner,
    avatarDecisions: req.avatarDecisions === true, artifactSha: proof.artifactSha, filesSha: req.filesSha, dir, unit, url: "https://openclaw.tianyi.live/voice/", snapshot,
    acceptanceBasis: req.productionReview ? 'user-reviewed-presentation; shared H5 gate explicitly waived' : 'shared-H5-acceptance', at: new Date().toISOString() };
  if (req.command === "plan") return { ...metadata, readOnly: true };
  assertEntrySnapshot(req.expected.snapshot, snapshot);
  const swap = target => { const temporary = pointer + ".gpt-live-new"; assert(!fs.existsSync(temporary)); fs.symlinkSync(target, temporary); fs.renameSync(temporary, pointer); };
  if (req.command === "rollback") {
    const installed = JSON.parse(fs.readFileSync(dir + (fs.existsSync(dir + "/installed.json") ? "/installed.json"
      : fs.existsSync(dir + "/installed-recovered.json") ? "/installed-recovered.json" : "/prepared.json")));
    assert.equal(installed.filesSha, req.filesSha); assert.equal(installed.owner, req.owner);
    assert.equal(snapshot.pointer, wantedPointer); assert.equal(snapshot.unitSha, installed.snapshot.unitSha);
    const launch = installed.launchDropIn;
    assert(launch || snapshot.launchDropInSha === null, "Unrecorded launcher override; inspect before rollback");
    if (launch) assert.equal(snapshot.launchDropInSha, launch.afterSha);
    run("systemctl", ["stop", unit]); swap(installed.beforePointer);
    if (launch) {
      if (launch.before.content === null) fs.unlinkSync(launchDropIn);
      else fs.writeFileSync(launchDropIn, Buffer.from(launch.before.content, "base64"), { mode: 0o644 });
      assert.equal(fs.existsSync(launchDropIn) ? hash(launchDropIn) : null, launch.before.sha);
      run("systemctl", ["daemon-reload"]);
    }
    run("systemctl", ["start", unit]);
    const receipt = { ...metadata, restored: true, restoredPointer: fs.readlinkSync(pointer) };
    save(dir + "/rolled-back.json", receipt); return receipt;
  }
  assert.equal(req.command, "install");
  assert(!fs.existsSync(dir), "This voice release already exists; inspect its receipt");
  assert(snapshot.pointer.startsWith(base + "/releases/") && !snapshot.pointer.includes(".."));
  fs.mkdirSync(dir, { mode: 0o755 });
  fs.chmodSync(dir, 0o755);
  for (const file of req.files) {
    const destination = path.join(dir, file.name);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
    const bytes = Buffer.from(file.content, "base64"); assert.equal(digest(bytes), file.sha);
    fs.writeFileSync(destination, bytes, { flag: "wx", mode: 0o644 });
    fs.chmodSync(destination, 0o644);
    for (let parent = path.dirname(destination); parent !== dir; parent = path.dirname(parent)) fs.chmodSync(parent, 0o755);
  }
  const beforeLaunch = fs.existsSync(launchDropIn)
    ? { sha: hash(launchDropIn), content: fs.readFileSync(launchDropIn).toString("base64") } : { sha: null, content: null };
  // Keep the original hosted entry environment intact. Native provider keys
  // come only from the actual Gateway environment, never the release artifact.
  const nativeEnvironment = dir + "/native-voice.env";
  const nativeEnv = Object.fromEntries(["VOLCENGINE_REALTIME_API_KEY", "DOUBAO_SPEECH_API_KEY", "XAI_API_KEY"].filter(key => env[key]).map(key => [key, env[key]]));
  if (req.avatarDecisions === true) {
    assert(env.OPENROUTER_API_KEY, 'Avatar decision credential unavailable in existing Gateway environment');
    nativeEnv.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
    nativeEnv.VOICE_AVATAR_DECISION_PROVIDER = 'openai_decisions';
    nativeEnv.VOICE_OPENAI_DECISIONS_MODEL = 'openai/gpt-6-luna-decisions';
  }
  const personalConfig = path.join(env.HOME, ".lark-cli/openclaw");
  const personalData = path.join(env.HOME, ".local/share");
  assert(fs.existsSync(path.join(personalConfig, "config.json")), "Personal Lark CLI configuration is unavailable");
  nativeEnv.LARKSUITE_CLI_CONFIG_DIR = env.LARKSUITE_CLI_CONFIG_DIR || personalConfig;
  nativeEnv.LARKSUITE_CLI_DATA_DIR = env.LARKSUITE_CLI_DATA_DIR || personalData;
  assert(nativeEnv.XAI_API_KEY && (nativeEnv.VOLCENGINE_REALTIME_API_KEY || nativeEnv.DOUBAO_SPEECH_API_KEY), "Native voice provider credentials unavailable");
  assert(Object.values(nativeEnv).every(value => !/[\r\n\0]/u.test(value)), "Invalid native environment value");
  fs.writeFileSync(nativeEnvironment, Object.entries(nativeEnv).map(([key, value]) => key + "=" + JSON.stringify(value)).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  const launchBytes = entryLaunchOverride(run("systemctl", ["show", unit, "-p", "ExecStart", "--value"]), wantedPointer + "/server.mjs", nativeEnvironment);
  const launch = { path: launchDropIn, before: beforeLaunch, afterSha: digest(launchBytes) };
  save(dir + "/prepared.json", { ...metadata, beforePointer: snapshot.pointer, launchDropIn: launch });
  assertEntrySnapshot(snapshot, observe());
  run("systemctl", ["stop", unit]);
  assert.equal(Number(properties(unit).MainPID), 0);
  swap(wantedPointer);
  assert.equal(fs.existsSync(launchDropIn) ? hash(launchDropIn) : null, beforeLaunch.sha);
  fs.mkdirSync(path.dirname(launchDropIn), { recursive: true });
  fs.writeFileSync(launchDropIn, launchBytes, { mode: 0o644 });
  run("systemctl", ["daemon-reload"]); run("systemctl", ["start", unit]);
  const hp = Number(properties(unit).MainPID); assert(hp > 1);
  const henv = Object.fromEntries(fs.readFileSync(`/proc/${hp}/environ`, "utf8").split("\0").filter(Boolean).map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
  assert.equal(henv.RTC_H5_BASE_PATH, "/voice"); assert.equal(henv.RTC_H5_PORT, "26242");
  assert.equal(henv.RTC_H5_RUNTIME_ROOT, runtime);
  assert(henv.RTC_H5_ACCESS_TOKEN?.length >= 32, "Original voice access protection is unavailable");
  const probe = route => new Promise((resolve, reject) => {
    const payload = `${crypto.randomBytes(16).toString("hex")}.${Date.now() + 60000}`;
    const cookie = `v_voice_access=${payload}.${crypto.createHmac("sha256", henv.RTC_H5_ACCESS_TOKEN).update(payload).digest("base64url")}`;
    const call = request({ host: "127.0.0.1", port: 26242, path: "/voice/" + route, headers: { host: "openclaw.tianyi.live", cookie } }, response => {
      const chunks = []; response.on("data", chunk => chunks.push(chunk)); response.on("end", () => resolve({ status: response.statusCode, bytes: Buffer.concat(chunks) }));
    }); call.on("error", reject); call.setTimeout(2000, () => call.destroy(new Error("Voice entry probe timeout"))); call.end();
  });
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { const response = await probe("api/status"); ready = response.status === 200 && JSON.parse(response.bytes).ready === true; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Voice entry not ready; preserve prepared.json and inspect before rollback");
  const served = await probe("app.js"); assert.equal(served.status, 200);
  assert.equal(digest(served.bytes), req.files.find(file => file.name.endsWith("/app.js")).sha);
  const result = { ...metadata, beforePointer: snapshot.pointer, snapshot: observe(), launchDropIn: launch, h5Pid: hp, ready: true,
    acceptance: "HTTP readiness only; real public H5 call validation required" };
  save(dir + "/installed.json", result); return result;
}
export function remoteSource() {
  return `import assert from 'node:assert/strict';import {createHash} from 'node:crypto';const digest=${digest.toString()};const H5_PATHS=${JSON.stringify(H5_PATHS)};const fileIdentity=${fileIdentity.toString()};\n`
    + [validateReviewedPresentation, assertEntrySnapshot, entryLaunchOverride, remoteMain].map(fn => fn.toString()).join("\n")
    + "\nlet text='';for await(const c of process.stdin)text+=c;try{const r=await remoteMain(JSON.parse(text));console.log(JSON.stringify(r))}catch{console.error('Voice entry identity or operation failed; preserve prepared receipts and inspect the service.');process.exitCode=1}";
}
function main(argv) {
  const command = argv.shift(); assert(["plan", "install", "rollback"].includes(command));
  const options = { command, target: "v", avatarDecisions: false };
  for (let i = 0; i < argv.length; i += 2) { assert(["--commit", "--release", "--owner", "--shared-proof", "--reviewed-proof", "--expected", "--output", "--h5-only", "--avatar-decisions"].includes(argv[i]) && argv[i + 1]); options[argv[i].slice(2)] = argv[i + 1]; }
  if ('h5-only' in options) { assert.equal(options['h5-only'], 'true'); options.h5Only = true; delete options['h5-only']; }
  if ('avatar-decisions' in options) { assert.equal(options['avatar-decisions'], 'true'); options.avatarDecisions = true; delete options['avatar-decisions']; }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const req = freezeSource(root, options);
  assert(Boolean(options['reviewed-proof']) !== Boolean(options['shared-proof']), 'Choose exactly one acceptance source');
  if (options['reviewed-proof']) { req.productionReview = JSON.parse(fs.readFileSync(options['reviewed-proof'])); validateReviewedPresentation(req.productionReview, req); }
  else { req.sharedProof = JSON.parse(fs.readFileSync(options['shared-proof'])); validateSharedProof(req.sharedProof, req); }
  if (command !== "plan") { req.expected = JSON.parse(fs.readFileSync(options.expected)); for (const key of ["commit", "release", "owner", "filesSha", "avatarDecisions"]) assert.equal(req.expected[key], req[key]); }
  assert(!fs.existsSync(options.output), "Do not overwrite an entry receipt");
  const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const output = execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "v", "sudo /opt/node-v22.23.1/bin/node --input-type=module -e " + quote(remoteSource())], { input: JSON.stringify(req), timeout: 120000, maxBuffer: 8000000, stdio: ["pipe", "pipe", "pipe"] });
  const result = JSON.parse(output); fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ command, ready: result.ready, url: result.url, receipt: options.output }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
