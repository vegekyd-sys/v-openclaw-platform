import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { transcriptEvent } from "./events.mjs";
import { createH5DuplexPlaybackGate } from "./duplex-playback.mjs";

const appSource = readFileSync(new URL("./app.js", import.meta.url), "utf8")
  .replace(/^import \{ (?:transcriptEvent|createH5DuplexPlaybackGate) \} from "[^"]+";\n/gmu, "");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};
const track = (kind = "audio") => ({ kind, stopped: 0, stop() { this.stopped++; } });
const stream = (tracks) => ({ getTracks: () => tracks, getAudioTracks: () => tracks.filter((item) => item.kind === "audio") });

async function fixture(t, options = {}) {
  class Element {
    dataset = {};
    children = [];
    listeners = new Map();
    textContent = "";
    value = "";
    hidden = false;
    disabled = false;
    srcObject = null;
    muted = false;
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    append(child) { this.children.push(child); }
    querySelector() { return null; }
    get scrollHeight() { return this.children.length; }
    play() { return options.play?.() ?? Promise.resolve(); }
  }
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const body = { dataset: {} };
  const requests = [];
  const peers = [];
  const eventSources = [];
  const contexts = [];
  const intervals = new Map();
  const timeouts = new Map();
  let timerId = 0;
  let sessionId = 0;
  let now = 0;
  const levels = { microphone: 0, remote: 0 };
  class Peer {
    iceGatheringState = "complete";
    connectionState = "new";
    tracks = [];
    closed = false;
    constructor() { peers.push(this); }
    addTrack(value) { this.tracks.push(value); }
    createDataChannel() { return this.channel = { closed: false, close() { this.closed = true; } }; }
    async createOffer() { return { type: "offer", sdp: "v=0\r\noffer" }; }
    async setLocalDescription(value) { this.localDescription = value; }
    async setRemoteDescription(value) { this.remoteDescription = value; return await options.remoteDescription?.(value); }
    addEventListener() {}
    close() { this.closed = true; }
  }
  class AudioContext {
    state = "running";
    closeCount = 0;
    constructor() { contexts.push(this); }
    analyserCount = 0;
    resume() { return options.resume?.() ?? Promise.resolve(); }
    async close() { this.state = "closed"; this.closeCount++; }
    createAnalyser() {
      const kind = this.analyserCount++ === 0 ? "remote" : "microphone";
      return { fftSize: 1024, getFloatTimeDomainData: (values) => values.fill(levels[kind]) };
    }
    createMediaStreamSource() { return { connect() {} }; }
  }
  class EventSource {
    closed = false;
    constructor() { eventSources.push(this); }
    close() { this.closed = true; }
  }
  const context = vm.createContext({
    transcriptEvent,
    createH5DuplexPlaybackGate,
    performance: { now: () => now },
    document: { body, getElementById: element, createElement: () => new Element() },
    window: { addEventListener() {} },
    navigator: { mediaDevices: { getUserMedia: () => options.getUserMedia?.() ?? Promise.resolve(stream([track()])) }, sendBeacon() {} },
    RTCPeerConnection: Peer,
    AudioContext,
    EventSource,
    MediaStream: class { constructor(tracks) { Object.assign(this, stream(tracks)); } },
    Blob,
    fetch: async (url, init) => {
      const route = url.split("/").at(-1);
      const payload = init?.body ? JSON.parse(init.body) : undefined;
      requests.push({ route, payload });
      const defaultResult = route === "status" ? { ready: true }
        : route === "session" ? { voiceSessionId: `voice-${++sessionId}` }
        : route === "offer" ? { sdp: "v=0\r\nanswer" } : { ok: true };
      const result = await (options.api?.(route, payload, defaultResult) ?? defaultResult);
      return { ok: true, json: async () => result };
    },
    setInterval: (callback, delay) => { const id = ++timerId; intervals.set(id, { callback, delay }); return id; },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: (callback, delay) => { const id = ++timerId; timeouts.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timeouts.delete(id),
  });
  vm.runInContext(appSource, context, { filename: "gpt-live-h5/app.js" });
  await tick();
  t.after(() => context.stopCall());
  const meter = (at, microphone, remote) => {
    now = at; levels.microphone = microphone; levels.remote = remote;
    for (const value of intervals.values()) if (value.delay === 50) value.callback();
  };
  return { context, element, body, requests, peers, contexts, eventSources, intervals, timeouts, meter, setNow: value => {now = value;} };
}

test("stopping before microphone permission returns releases every late track without creating a session", async (t) => {
  const permission = deferred();
  const f = await fixture(t, { getUserMedia: () => permission.promise });
  const starting = f.context.startCall();
  await tick();
  await f.context.stopCall();
  const tracks = [track(), track(), track("video")];
  permission.resolve(stream(tracks));
  await starting;
  assert(tracks.every((item) => item.stopped === 1));
  assert.equal(f.requests.filter(({ route }) => route === "session" || route === "offer").length, 0);
  assert.equal(f.peers[0].closed, true);
  assert.equal(f.contexts.length, 0);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.element("start").disabled, false);
  assert.equal(f.body.dataset.voiceState, "idle");
});

test("a remote audio play that resolves after stop cannot create an AudioContext or meter timer", async (t) => {
  const playback = deferred();
  const f = await fixture(t, { play: () => playback.promise });
  await f.context.startCall();
  const playing = f.peers[0].ontrack({ track: track() });
  await tick();
  assert(f.element("remoteAudio").srcObject);
  await f.context.stopCall();
  playback.resolve();
  await playing;
  assert.equal(f.contexts.length, 0);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.timeouts.size, 0);
  assert.equal(f.element("remoteAudio").srcObject, null);
  assert.equal(f.body.dataset.voiceState, "idle");
});

test("an AudioContext resume that resolves after stop closes the context and never installs a meter", async (t) => {
  const resuming = deferred();
  const f = await fixture(t, { resume: () => resuming.promise });
  await f.context.startCall();
  const playing = f.peers[0].ontrack({ track: track() });
  await tick();
  assert.equal(f.contexts.length, 1);
  await f.context.stopCall();
  resuming.resolve();
  await playing;
  assert.equal(f.contexts[0].state, "closed");
  assert(f.contexts[0].closeCount >= 1);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.timeouts.size, 0);
  assert.equal(f.element("remoteAudio").srcObject, null);
});

test("a rejected old playback cannot overwrite the stopped call status", async (t) => {
  const playback = deferred();
  const f = await fixture(t, { play: () => playback.promise });
  await f.context.startCall();
  const playing = f.peers[0].ontrack({ track: track() });
  await tick();
  await f.context.stopCall();
  const status = f.element("status").textContent;
  playback.reject(new Error("late autoplay failure"));
  await playing;
  assert.equal(f.element("status").textContent, status);
  assert.equal(f.contexts.length, 0);
  assert.equal(f.intervals.size, 0);
});

test("a remote description that finishes after stop cannot leak a heartbeat timer", async (t) => {
  const remote = deferred();
  const f = await fixture(t, { remoteDescription: () => remote.promise });
  const starting = f.context.startCall();
  await tick();
  assert(f.peers[0].remoteDescription);
  await f.context.stopCall();
  remote.resolve();
  await starting;
  assert.equal(f.intervals.size, 0);
  assert.equal(f.timeouts.size, 0);
  assert.equal(f.peers[0].closed, true);
});

test("native transcript added and turn.done update a single row and repeated final does not duplicate it", async (t) => {
  const f = await fixture(t);
  await f.context.startCall();
  const send = (payload) => f.peers[0].channel.onmessage({ data: JSON.stringify(payload) });
  send({ type: "input_transcript.added", item: { id: "fragment-1", text: "请查" } });
  send({ type: "input_transcript.added", item: { id: "fragment-2", text: "周四" } });
  const conversation = f.element("conversation");
  assert.equal(conversation.children.length, 1);
  assert.equal(conversation.children[0].textContent, "你：请查周四");
  send({ type: "turn.done", turn: { id: "turn-user-1", role: "user", transcript: "请查周四的日程" } });
  send({ type: "turn.done", turn: { id: "turn-user-1", role: "user", transcript: "请查周四的日程" } });
  assert.equal(conversation.children.length, 1);
  assert.equal(conversation.children[0].textContent, "你：请查周四的日程");
  send({ type: "output_transcript.added", item: { id: "assistant-fragment", text: "正在查询" } });
  send({ type: "turn.done", turn: { id: "turn-assistant-1", role: "assistant", transcript: "正在查询你的日程" } });
  assert.deepEqual(conversation.children.map((row) => row.textContent), ["你：请查周四的日程", "V：正在查询你的日程"]);
});

test("data channel and event stream callbacks from an old call cannot alter the new call UI", async (t) => {
  const f = await fixture(t);
  await f.context.startCall();
  const oldPeer = f.peers[0];
  const oldEvents = f.eventSources[0];
  await f.context.stopCall();
  await f.context.startCall();
  const currentPeer = f.peers[1];
  currentPeer.connectionState = "connected";
  currentPeer.onconnectionstatechange();
  const before = { status: f.element("status").textContent, badge: f.element("badge").textContent, taskStatus: f.element("taskStatus").textContent };
  oldPeer.channel.onmessage({ data: JSON.stringify({ type: "input_transcript.added", item: { text: "旧通话字幕" } }) });
  oldPeer.channel.onmessage({ data: JSON.stringify({ type: "error" }) });
  oldEvents.onmessage({ data: JSON.stringify({ voiceSessionId: "voice-1", type: "tool.call", callId: "old-task" }) });
  oldPeer.connectionState = "disconnected";
  oldPeer.onconnectionstatechange();
  await tick();
  assert.deepEqual({ status: f.element("status").textContent, badge: f.element("badge").textContent, taskStatus: f.element("taskStatus").textContent }, before);
  assert.equal(f.element("conversation").children.length, 0);
  assert.equal(currentPeer.closed, false);
  currentPeer.channel.onmessage({ data: JSON.stringify({ type: "output_transcript.added", item: { text: "新通话字幕" } }) });
  assert.equal(f.element("conversation").children[0].textContent, "V：新通话字幕");
});

test("an old close response cannot reset a new connected call UI or its remote audio", async (t) => {
  const closing = deferred();
  const f = await fixture(t, { api: (route, payload, result) => route === "close" && payload.voiceSessionId === "voice-1" ? closing.promise : result });
  await f.context.startCall();
  const stopping = f.context.stopCall();
  await tick();
  await f.context.startCall();
  const peer = f.peers[1];
  peer.connectionState = "connected";
  peer.onconnectionstatechange();
  await peer.ontrack({ track: track() });
  const audio = f.element("remoteAudio").srcObject;
  const state = () => ({
    status: f.element("status").textContent,
    badge: f.element("badge").textContent,
    startHidden: f.element("start").hidden,
    stopHidden: f.element("stop").hidden,
    steerDisabled: f.element("steer").disabled,
    voiceState: f.body.dataset.voiceState,
  });
  const before = state();
  closing.resolve({ ok: true });
  await stopping;
  assert.deepEqual(state(), before);
  assert.equal(f.element("remoteAudio").srcObject, audio);
  assert.equal(peer.closed, false);
});

for (const mode of ["steer", "cancel"]) for (const outcome of ["success", "failure"]) {
  test(`a ${mode} ${outcome} from an ended call cannot change the new call status or input`, async (t) => {
    const reply = deferred();
    const f = await fixture(t, { api: (route, payload, result) => route === "steer" && payload.voiceSessionId === "voice-1" ? reply.promise : result });
    await f.context.startCall();
    f.element("steerText").value = "旧通话条件";
    const request = mode === "steer"
      ? f.element("steerForm").listeners.get("submit")({ preventDefault() {} })
      : f.element("cancel").listeners.get("click")();
    await tick();
    assert.equal(f.requests.at(-1).route, "steer");
    assert.equal(f.requests.at(-1).payload.mode, mode);
    await f.context.stopCall();
    await f.context.startCall();
    const peer = f.peers[1];
    peer.connectionState = "connected";
    peer.onconnectionstatechange();
    f.element("steerText").value = "新通话尚未提交的条件";
    const status = f.element("status").textContent;
    if (outcome === "success") reply.resolve({ ok: true });
    else reply.reject(new Error("old call request failed"));
    await request;
    assert.equal(f.element("status").textContent, status);
    assert.equal(f.element("steerText").value, "新通话尚未提交的条件");
    assert.equal(peer.closed, false);
  });
}

test("old disconnected-call cleanup cannot replace a new connected call status", async (t) => {
  const closing = deferred();
  const f = await fixture(t, { api: (route, payload, result) => route === "close" && payload.voiceSessionId === "voice-1" ? closing.promise : result });
  await f.context.startCall();
  const oldPeer = f.peers[0];
  oldPeer.connectionState = "disconnected";
  oldPeer.onconnectionstatechange();
  await tick();
  assert.equal(f.requests.at(-1).route, "close");
  await f.context.startCall();
  const peer = f.peers[1];
  peer.connectionState = "connected";
  peer.onconnectionstatechange();
  const status = f.element("status").textContent;
  closing.resolve({ ok: true });
  await tick();
  assert.equal(f.element("status").textContent, status);
  assert.equal(f.element("badge").textContent, "通话中");
  assert.equal(peer.closed, false);
});

test("real app microphone gate mutes playback while leaving the call and backend active", async (t) => {
  const f = await fixture(t); await f.context.startCall();
  const peer = f.peers[0]; await peer.ontrack({track: track()});
  const incoming = f.element("remoteAudio").srcObject;
  f.eventSources[0].onmessage({data: JSON.stringify({voiceSessionId: "voice-1", type: "tool.call", callId: "backend-work"})});
  const before = f.requests.length;
  f.meter(0, .04, .2); f.meter(50, .04, .2); f.meter(100, .04, .2);
  assert.equal(f.element("remoteAudio").muted, true);
  assert.equal(f.element("remoteAudio").srcObject, incoming);
  assert.equal(peer.closed, false);
  assert(peer.tracks.every(value => value.stopped === 0));
  assert.equal(f.element("cancel").disabled, false, "Accepted backend request remains pending");
  assert.equal(f.requests.length, before, "Local speech does not send a cancel/steer/close API call");
  assert.equal(f.body.dataset.voiceState, "listening");
  assert.equal(f.context.__gptLiveDuplexDiagnostics.events.at(-1).remoteActive, true,
    "The upstream signal remains observable while local playback is muted");
});

test("real app resumes only after the frozen assistant ends and queued inbound audio drains", async (t) => {
  const f = await fixture(t); await f.context.startCall(); await f.peers[0].ontrack({track: track()});
  f.peers[0].channel.onmessage({data: JSON.stringify({type: "turn.created", turn: {role: "assistant", id: "old"}})});
  f.meter(0, .04, .2); f.meter(50, .04, .2); f.meter(100, .04, .2);
  for (let at = 150; at <= 600; at += 50) f.meter(at, 0, .2);
  assert.equal(f.element("remoteAudio").muted, true);
  f.setNow(625);
  f.peers[0].channel.onmessage({data: JSON.stringify({type: "turn.done", turn: {role: "assistant", id: "old"}})});
  assert.equal(f.element("remoteAudio").muted, true, "turn.done alone is not audio clear");
  for (let at = 650; at <= 900; at += 50) f.meter(at, 0, 0);
  assert.equal(f.element("remoteAudio").muted, false);
  f.meter(950, 0, .2);
  assert.equal(f.body.dataset.voiceState, "speaking");
});

test("native user turn provides a local fallback without claiming or sending model interruption", async (t) => {
  const f = await fixture(t); await f.context.startCall(); await f.peers[0].ontrack({track: track()});
  f.meter(0, .005, .2);
  f.setNow(20);
  f.peers[0].channel.onmessage({data: JSON.stringify({type: "turn.created", turn: {role: "user", id: "private-turn"}})});
  assert.equal(f.element("remoteAudio").muted, true);
  const diagnostics = f.context.__gptLiveDuplexDiagnostics;
  assert(diagnostics.events.some(value => value.type === "native-turn-created" && value.role === "user"));
  assert(diagnostics.events.some(value => value.type === "local-playback-gate" && value.reason === "provider-user-turn-start"));
  f.peers[0].channel.onmessage({data: JSON.stringify({type: "output_audio_buffer.cleared"})});
  assert(diagnostics.events.some(value => value.type === "native-output-audio-cleared"));
  assert.doesNotMatch(JSON.stringify(diagnostics), /private-turn|transcript|model.?interrupted/u);
  assert(!f.requests.some(({route}) => route === "steer" || route === "close"));
});

test("first caller speech without old output leaves the first answer audible", async (t) => {
  const f = await fixture(t); await f.context.startCall(); await f.peers[0].ontrack({track: track()});
  for (let at = 0; at <= 100; at += 50) f.meter(at, .04, 0);
  for (let at = 150; at <= 600; at += 50) f.meter(at, 0, 0);
  f.setNow(625);
  f.peers[0].channel.onmessage({data: JSON.stringify({type: "turn.created", turn: {role: "assistant", id: "first"}})});
  f.meter(650, 0, .2);
  assert.equal(f.element("remoteAudio").muted, false);
  assert.equal(f.body.dataset.voiceState, "speaking");
  assert(!f.context.__gptLiveDuplexDiagnostics.events.some(value => value.type === "local-playback-gate"));
});

test("a long old-answer pause, context ack, captions and new created event do not unlock playback", async (t) => {
  const f = await fixture(t); await f.context.startCall(); await f.peers[0].ontrack({track: track()});
  const send = payload => f.peers[0].channel.onmessage({data: JSON.stringify(payload)});
  send({type: "turn.created", turn: {role: "assistant", id: "private-old"}});
  f.meter(0, .04, .2); f.meter(50, .04, .2); f.meter(100, .04, .2);
  for (let at = 150; at <= 600; at += 50) f.meter(at, 0, 0);
  f.setNow(625);
  send({type: "session.context.appended"});
  send({type: "output_transcript.added", item: {id: "private-caption", text: "旧回答后续"}});
  send({type: "turn.created", turn: {role: "assistant", id: "private-new"}});
  send({type: "turn.done", turn: {role: "assistant", id: "private-new"}});
  for (let at = 650; at <= 1100; at += 50) f.meter(at, 0, 0);
  assert.equal(f.element("remoteAudio").muted, true);
  const sample = f.context.__gptLiveDuplexDiagnostics.events.at(-1);
  assert.equal(sample.oldTurnTerminal, false);
  assert.equal(sample.outputDrained, false);
  f.meter(1150, 0, .2);
  assert.equal(f.element("remoteAudio").muted, true, "The resumed old tail stays muted");
  f.setNow(1175); send({type: "turn.done", turn: {role: "assistant", id: "private-old"}});
  for (let at = 1200; at <= 1450; at += 50) f.meter(at, 0, 0);
  assert.equal(f.element("remoteAudio").muted, false);
  assert.doesNotMatch(JSON.stringify(f.context.__gptLiveDuplexDiagnostics), /private-|旧回答后续/u);
});

test("late assistant metadata needs a real terminal and fresh drain before unknown output can recover", async (t) => {
  const f = await fixture(t); await f.context.startCall(); await f.peers[0].ontrack({track: track()});
  const send = payload => f.peers[0].channel.onmessage({data: JSON.stringify(payload)});
  f.meter(0, .04, .2); f.meter(50, .04, .2); f.meter(100, .04, .2);
  for (let at = 150; at <= 600; at += 50) f.meter(at, 0, 0);
  f.setNow(625); send({type: "turn.created", turn: {role: "assistant", id: "delayed"}});
  for (let at = 650; at <= 1000; at += 50) f.meter(at, 0, 0);
  assert.equal(f.element("remoteAudio").muted, true);
  f.setNow(1025); send({type: "turn.done", turn: {role: "assistant", id: "delayed"}});
  f.meter(1050, 0, 0);
  assert.equal(f.context.__gptLiveDuplexDiagnostics.events.at(-1).oldTurnTerminal, true);
  assert.equal(f.context.__gptLiveDuplexDiagnostics.events.at(-1).outputDrained, false);
  for (let at = 1100; at <= 1300; at += 50) f.meter(at, 0, 0);
  assert.equal(f.element("remoteAudio").muted, false);
});

test("app preserves a drain proved during caller speech and releases the fresh reply when the caller finishes", async (t) => {
  const f = await fixture(t); await f.context.startCall(); await f.peers[0].ontrack({track: track()});
  const send = payload => f.peers[0].channel.onmessage({data: JSON.stringify(payload)});
  send({type: "turn.created", turn: {role: "assistant", id: "old"}});
  f.meter(0, .04, .2); f.meter(50, .04, .2); f.meter(100, .04, .2);
  f.setNow(125); send({type: "turn.done", turn: {role: "assistant", id: "old"}});
  for (let at = 150; at <= 400; at += 50) f.meter(at, .04, 0);
  assert.equal(f.context.__gptLiveDuplexDiagnostics.events.at(-1).outputDrained, true);
  assert.equal(f.element("remoteAudio").muted, true);
  f.setNow(425); send({type: "turn.created", turn: {role: "assistant", id: "fresh"}});
  for (let at = 450; at <= 1000; at += 50) f.meter(at, .04, .2);
  for (let at = 1050; at <= 1500; at += 50) f.meter(at, 0, .2);
  assert.equal(f.element("remoteAudio").muted, false);
  const finalGate = [...f.context.__gptLiveDuplexDiagnostics.events].reverse().find(value => value.type === "local-playback-gate");
  assert.equal(finalGate.oldTurnTerminal, true);
  assert.equal(finalGate.outputDrained, true);
  assert(!f.context.__gptLiveDuplexDiagnostics.events.some(value => value.type === "native-output-audio-cleared"),
    "The app distinguishes an assistant terminal from a native clear");
});

test("missing terminal proof offers a restart without timing out into old playback", async (t) => {
  const f = await fixture(t); await f.context.startCall(); await f.peers[0].ontrack({track: track()});
  f.meter(0, .04, .2); f.meter(50, .04, .2); f.meter(100, .04, .2);
  for (let at = 150; at <= 4600; at += 50) f.meter(at, 0, 0);
  assert.equal(f.element("remoteAudio").muted, true);
  assert.match(f.element("status").textContent, /结束通话后重新开始/u);
  assert(!f.requests.some(({route}) => route === "steer" || route === "close"));
  f.setNow(4625);
  f.peers[0].channel.onmessage({data: JSON.stringify({type: "turn.done", turn: {role: "assistant", id: "delayed"}})});
  for (let at = 4650; at <= 4900; at += 50) f.meter(at, 0, 0);
  assert.equal(f.element("remoteAudio").muted, false);
  assert.equal(f.element("status").textContent, "V 正在听，直接说话就好");
});

test("stopping a muted call clears its meter and gate without muting the replacement call", async (t) => {
  const f = await fixture(t); await f.context.startCall();
  const old = f.peers[0]; await old.ontrack({track: track()});
  const oldMeter = [...f.intervals.values()].find(value => value.delay === 50).callback;
  f.meter(0, .04, .2); f.meter(50, .04, .2); f.meter(100, .04, .2);
  const diagnostics = f.context.__gptLiveDuplexDiagnostics;
  await f.context.stopCall();
  assert.equal(diagnostics.closed, true);
  assert.equal(f.element("remoteAudio").muted, false);
  assert.equal(f.intervals.size, 0);
  await f.context.startCall(); await f.peers[1].ontrack({track: track()});
  oldMeter();
  old.channel.onmessage({data: JSON.stringify({type: "turn.created", turn: {role: "user"}})});
  assert.equal(f.element("remoteAudio").muted, false);
  assert.equal(f.peers[1].closed, false);
});
