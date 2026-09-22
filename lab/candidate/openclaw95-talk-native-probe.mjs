import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const archive = join(process.cwd(), "lab/candidate/private/openclaw-2026.9.5-talk-closure.tgz");
const expectedArchiveSha = "5603ebc7aa955b3452bec0de21210260152db49658b5021330945f93cf9b9027";
const archiveSha = createHash("sha256").update(readFileSync(archive)).digest("hex");
assert.equal(archiveSha, expectedArchiveSha, "official package archive drifted");

const root = join(process.env.VLAB_CANDIDATE_DATA, "openclaw95-talk-native-probe");
mkdirSync(root, { recursive: true });
execFileSync("tar", ["-xzf", archive, "-C", root]);
const dist = join(root, "package/dist");

const { i: buildInstructions } = await import(pathToFileURL(join(dist, "realtime-quicksilver-instructions-CkYwSLJz.mjs")));
const { t: DelegationController } = await import(pathToFileURL(join(dist, "realtime-quicksilver-delegation-controller-vmxzqWll.mjs")));

const instructions = buildInstructions("gpt-live-1", "Speak naturally.");
assert.match(instructions, /Delegate each user request once and wait for its result/);
assert.match(instructions, /Keep the conversation natural while delegated work runs/);
assert.match(instructions, /session\.commentary\.append is an update to speak aloud naturally/);

const started = performance.now();
const sent = [];
const socket = {
  readyState: 1,
  send(raw) {
    sent.push({ atMs: Math.round(performance.now() - started), frame: JSON.parse(raw) });
  },
};
const sessionAbort = new AbortController();
let appendDelayedFinal;
let finalRevocations = 0;
const runAgentConsult = Object.assign(
  async ({ requesterFinal }) => {
    appendDelayedFinal = requesterFinal.append;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { text: "I am still working on it." };
  },
  {
    adoptCompletionClaims() {},
    claimAppend: () => true,
    revokeRequesterFinal: () => { finalRevocations += 1; },
  },
);
const controller = new DelegationController({
  model: "gpt-live-1",
  signal: sessionAbort.signal,
  runAgentConsult,
  handleDelegationInput: () => undefined,
  getSocket: () => socket,
  logger: { debug() {}, warn(message) { throw new Error(message); } },
  onFatalError(error) { throw error; },
}, (error) => String(error));

controller.handleEvent({ kind: "transcript-done", role: "user", text: "Please do a task that takes a while." });
controller.handleEvent({ kind: "delegation", id: "delegation-1" });
await new Promise((resolve) => setTimeout(resolve, 80));

assert.equal(typeof appendDelayedFinal, "function");
assert.equal(sent[0]?.frame.type, "session.commentary.append");
assert.equal(sent[0]?.frame.delegation_id, null);
assert(sent[0].atMs < 20, `first acknowledgement took ${sent[0].atMs}ms`);
assert.equal(sent[1]?.frame.type, "session.commentary.append");
assert.equal(sent[1]?.frame.delegation_id, "delegation-1");

const beforeFinal = sent.length;
const firstFinalAccepted = appendDelayedFinal("The delegated task is complete.");
const duplicateFinalAccepted = appendDelayedFinal("Duplicate final must be rejected.");
assert.equal(firstFinalAccepted, true);
assert.equal(duplicateFinalAccepted, false);
assert.equal(sent.length, beforeFinal + 1);
assert.equal(sent.at(-1)?.frame.type, "session.commentary.append");
assert.equal(sent.at(-1)?.frame.delegation_id, "delegation-1");
assert.equal(finalRevocations, 0);

console.log(JSON.stringify({
  packageVersion: "2026.9.5",
  archiveSha,
  instructionDelegatesOnce: true,
  instructionKeepsConversationNatural: true,
  commentaryIsSpeakableProgress: true,
  acknowledgementBeforeAgentResult: sent[0].atMs < sent[1].atMs,
  acknowledgementMs: sent[0].atMs,
  agentResultMs: sent[1].atMs,
  delayedFinalAcceptedExactlyOnce: firstFinalAccepted && !duplicateFinalAccepted,
  delayedFinalFrameCount: sent.length - beforeFinal,
  providerSessionStillActive: !controller.stopped && !sessionAbort.signal.aborted,
  physicalSpeakerUsed: false,
}));

controller.stop(new Error("probe complete"));
