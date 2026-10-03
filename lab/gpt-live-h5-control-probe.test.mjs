import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./gpt-live-h5-control-smoke.mjs", import.meta.url), "utf8");
const probe = /const probe=String\.raw`([\s\S]+?)`;/u.exec(source)?.[1];
assert(probe, "Actual control probe source must be available");

// Run the exact browser-side probe with the real app.js ordering: the app
// constructs its RTC peer first and acquires the microphone afterwards.
function fixture() {
  const contexts = [], timers = new Set(); let nextTimer = 0;
  class Peer {
    constructor() {this.listeners = new Map();}
    addEventListener(type, callback) {this.listeners.set(type, callback);}
    createDataChannel() {return {addEventListener() {}};}
    emitTrack() {this.listeners.get("track")({track: {kind:"audio",readyState:"live"}});}
  }
  class Stream {constructor(tracks = []) {this.tracks = tracks;} getTracks() {return this.tracks;}}
  class Recorder {
    addEventListener() {} start() {this.state = "recording";}
  }
  class Context {
    constructor() {this.state="suspended";this.destination={};contexts.push(this);}
    createMediaStreamSource() {return {connect() {}};}
    createAnalyser() {return {connect() {},getFloatTimeDomainData() {},getByteTimeDomainData() {}};}
    createGain() {return {gain:{value:1},connect() {}};}
    async resume() {this.state="running";}
    async close() {this.state="closed";}
  }
  const browser = {RTCPeerConnection:Peer,EventSource:class {},fetch:async()=>({})};
  const navigator = {mediaDevices:{getUserMedia:async()=>new Stream([{kind:"audio",readyState:"live"}])}};
  new Function("globalThis", "navigator", "document", "AudioContext", "MediaRecorder", "MediaStream", "setInterval", "clearInterval", probe)(
    browser, navigator, {addEventListener() {}}, Context, Recorder, Stream,
    () => {const id = ++nextTimer;timers.add(id);return id;}, id => timers.delete(id));
  return {browser,navigator,p:browser.__sharedH5Smoke,contexts,timers};
}

test("exact control probe closes microphone and remote contexts for each actual RTC index", async () => {
  const f=fixture();
  const first=new f.browser.RTCPeerConnection();
  await f.navigator.mediaDevices.getUserMedia({audio:true}); first.emitTrack();
  assert.deepEqual(f.p.probeResources.map(resource=>resource.pcIndex),[0,0]);
  assert.equal(f.timers.size,2);
  await f.p.disposeProbeResources(0);
  assert(f.p.probeResources.every(resource=>resource.disposed&&resource.context.state==="closed"));
  assert.equal(f.timers.size,0);
  const second=new f.browser.RTCPeerConnection();
  await f.navigator.mediaDevices.getUserMedia({audio:true}); second.emitTrack();
  assert.deepEqual(f.p.probeResources.map(resource=>resource.pcIndex),[0,0,1,1]);
  assert.equal(f.timers.size,2);
  await f.p.disposeProbeResources(0);
  assert(f.p.probeResources.slice(2).every(resource=>!resource.disposed&&resource.context.state==="running"));
  assert.equal(f.timers.size,2,"Closing old call must not dispose new microphone resources");
  await f.p.disposeProbeResources(1);
  assert(f.p.probeResources.every(resource=>resource.disposed&&resource.context.state==="closed"));
  assert.equal(f.timers.size,0);
  await f.p.disposeProbeResources();
  assert.equal(f.timers.size,0,"Final cleanup remains idempotent");
});
