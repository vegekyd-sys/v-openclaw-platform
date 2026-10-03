import assert from "node:assert/strict";
import test from "node:test";
import { USER_PCM_SOURCE } from "./gpt-live-h5-user-pcm.mjs";

function setup(connectionState = "connected", fail = null) {
  const contexts = [], replacements = [], sources = [], destinationTracks = [];
  const originalTrack = { kind: "audio", readyState: "live" };
  const sender = { track: originalTrack, async replaceTrack(track) { this.track = track; replacements.push(track); if (fail === "replace" && track !== originalTrack) throw new Error("replace failed"); } };
  const pc = { connectionState, getSenders: () => [sender] };
  class Context {
    constructor() { this.state = "suspended"; contexts.push(this); }
    async decodeAudioData(bytes) { assert.equal(bytes.byteLength, 3); if (fail === "decode") throw new Error("decode failed"); return { duration: 2 }; }
    createMediaStreamDestination() {
      const track = { kind: "audio", readyState: "live", stop() { this.readyState = "ended"; } };
      destinationTracks.push(track);
      return { stream: { getAudioTracks: () => [track] } };
    }
    createBufferSource() {
      const source = { connections: [], connect(node) { this.connections.push(node); }, start() { if (fail === "start") throw new Error("start failed"); this.started = true; }, stop() { this.onended?.(); } };
      sources.push(source); return source;
    }
    createAnalyser() { return { fftSize: 0, connect() {}, getFloatTimeDomainData(samples) { samples.fill(.1); } }; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    async resume() { this.state = "running"; }
    async close() { this.state = "closed"; }
  }
  const p = { pcs: [pc] };
  new Function("globalThis", "AudioContext", USER_PCM_SOURCE)({ __sharedH5Smoke: p }, Context);
  return { p, pc, sender, originalTrack, contexts, replacements, sources, destinationTracks };
}
const settle = async () => { for (let at = 0; at < 8; at += 1) await Promise.resolve(); };

test("user PCM travels through the real sender source and restores the application's microphone", async () => {
  const f = setup();
  const clip = await f.p.playUserPcm("AQID", "barge");
  assert.equal(clip.label, "barge");
  assert.equal(clip.pcIndex, 0);
  assert.equal(clip.durationSeconds, 2);
  assert(f.sources[0].started);
  assert.equal(f.sender.track, f.destinationTracks[0]);
  assert.notEqual(f.sender.track, f.originalTrack);
  f.sources[0].onended(); await settle();
  assert.equal(f.sender.track, f.originalTrack);
  assert.equal(f.destinationTracks[0].readyState, "ended");
  assert.equal(f.contexts[0].state, "closed");
  assert(Number.isSafeInteger(f.p.userClips[0].endedAt));
});

test("closed RTC cleanup ends temporary audio without replacing a closed sender", async () => {
  const f = setup();
  await f.p.playUserPcm("AQID", "request");
  f.pc.connectionState = "closed";
  await f.p.stopUserPcm(); await settle();
  assert.equal(f.replacements.length, 1);
  assert(f.destinationTracks.every((track) => track.readyState === "ended"));
  assert(f.contexts.every((context) => context.state === "closed"));
  // The helper never stops or mutates the microphone track owned by app.js.
  assert.equal(f.originalTrack.readyState, "live");
});

test("PCM source cannot run before the actual H5 RTC connection", async () => {
  const f = setup("new");
  assert.match((await f.p.playUserPcm("AQID", "request")).error, /Connected real audio sender/u);
  assert.equal(f.replacements.length, 0);
  assert.equal(f.contexts.length, 0);
});


test("decode failure retains and closes the task-owned context without touching app microphone", async () => {
  const f = setup("connected", "decode");
  assert.match((await f.p.playUserPcm("AQID", "request")).error, /decode failed/u);
  assert.equal(f.p.syntheticMicrophoneSources.length, 1);
  assert.equal(f.contexts[0].state, "closed");
  assert.equal(f.sender.track, f.originalTrack);
  await f.p.stopUserPcm();
  assert.equal(f.originalTrack.readyState, "live");
});
test("replaceTrack and source-start failures restore app microphone and stop every auxiliary resource", async () => {
  for (const failure of ["replace", "start"]) {
    const f = setup("connected", failure);
    assert.match((await f.p.playUserPcm("AQID", "request")).error, new RegExp(failure + " failed", "u"));
    await settle();
    assert.equal(f.sender.track, f.originalTrack);
    assert(f.destinationTracks.every((track) => track.readyState === "ended"));
    assert(f.contexts.every((context) => context.state === "closed"));
    assert.equal(f.originalTrack.readyState, "live");
    await f.p.stopUserPcm();
  }
});
