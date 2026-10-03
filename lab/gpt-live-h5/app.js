import { createTranscriptPresentation } from "./transcript-presentation.mjs";
import { captureDuplexMicrophone } from "./microphone-capture.mjs";
import { createCallSounds } from "./call-sounds.mjs";
import { createH5DuplexPlaybackGate } from "./duplex-playback.mjs";

const $ = (id) => document.getElementById(id);
let call = null;
let starting = null;
let liveReady = false;
const duplexRecoveryMessage = "上一段语音还没确认结束。若仍无声音，请结束通话后重新开始。";
const playbackRecoveryMessage = "声音播放被暂停了，点一下页面恢复声音。";
const presentation = createTranscriptPresentation();
const renderedTurns = new Map();
const tasks = new Set();
const setStatus = (text) => { $("status").textContent = text; };
function duplexDiagnostic(active, entry) {
  if (call !== active) return;
  const counts = active.duplexDiagnostics.counts;
  counts[entry.type] = (counts[entry.type] ?? 0) + 1;
  if (entry.type === "activity-window") {
    if (entry.remoteActive) counts.remoteActiveFrames = (counts.remoteActiveFrames ?? 0) + 1;
    if (entry.appliedMuted) counts.appliedMutedFrames = (counts.appliedMutedFrames ?? 0) + 1;
    if (entry.remoteActive && entry.appliedMuted) counts.remoteActiveWhileMutedFrames = (counts.remoteActiveWhileMutedFrames ?? 0) + 1;
    active.duplexDiagnostics.latestActivity = entry;
  } else {
    active.duplexDiagnostics.transitions.push(entry);
    if (active.duplexDiagnostics.transitions.length > 128) active.duplexDiagnostics.transitions.shift();
  }
  active.duplexDiagnostics.events.push(entry);
  if (active.duplexDiagnostics.events.length > 1200) active.duplexDiagnostics.events.shift();
}
function playbackState(active) {
  const audio = $("remoteAudio");
  return { requestedMuted: active.duplex.snapshot().localPlaybackMuted,
    appliedMuted: audio.muted, paused: audio.paused, volume: audio.volume,
    readyState: audio.readyState, audioContextState: active.context?.state ?? "absent",
    mode: active.duplex.snapshot().mode, interruptionOwner: active.duplex.snapshot().interruptionOwner };
}
function connectedStatus(active) {
  if (active.playbackNeedsGesture) setStatus(playbackRecoveryMessage);
  else if (active.duplexRecoveryNotice) setStatus(duplexRecoveryMessage);
  else setStatus("V 正在听，直接说话就好");
}
async function startRemotePlayback(active, source) {
  if (call !== active) return false;
  const audio = $("remoteAudio");
  // Invoke play in the gesture's synchronous stack; awaiting context.resume
  // first can lose browser user activation. This does not unmute a local gate.
  try {
    const playing = audio.play();
    await playing;
    if (call !== active) return false;
    active.playbackAudioBlocked = false;
    active.playbackNeedsGesture = Boolean(active.playbackContextBlocked);
    duplexDiagnostic(active, { type: "playback-started", at: performance.now(), source, ...playbackState(active) });
    if (source === "gesture" || $("status").textContent === playbackRecoveryMessage) connectedStatus(active);
    return true;
  } catch (error) {
    if (call !== active) return false;
    active.playbackAudioBlocked = true;
    active.playbackNeedsGesture = true;
    duplexDiagnostic(active, { type: "playback-rejected", at: performance.now(), source,
      errorName: error?.name ?? "Error", ...playbackState(active) });
    setStatus(playbackRecoveryMessage);
    return false;
  }
}
async function recoverPlaybackGesture() {
  const active = call;
  if (!active || !$("remoteAudio").srcObject || !active.playbackNeedsGesture) return;
  const playing = startRemotePlayback(active, "gesture");
  try {
    await active.context?.resume();
    if (call !== active) return;
    active.playbackContextBlocked = active.context?.state === "suspended";
    active.playbackNeedsGesture = Boolean(active.playbackAudioBlocked || active.playbackContextBlocked);
    duplexDiagnostic(active, { type: "context-resumed", at: performance.now(), source: "gesture", ...playbackState(active) });
    if (!active.playbackNeedsGesture) connectedStatus(active);
  } catch (error) {
    if (call !== active) return;
    active.playbackContextBlocked = true;
    active.playbackNeedsGesture = true;
    duplexDiagnostic(active, { type: "context-resume-rejected", at: performance.now(), source: "gesture", errorName: error?.name ?? "Error", ...playbackState(active) });
    setStatus(playbackRecoveryMessage);
  }
  await playing;
}
async function api(route, payload) {
  const response = await fetch(`./api/${route}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "连接暂时不可用");
  return result;
}
function taskState() {
  $("taskStatus").textContent = tasks.size ? "后台任务正在继续" : "";
  $("cancel").disabled = tasks.size === 0;
  $("cancel").hidden = tasks.size === 0;
  $("avatar").src = tasks.size ? "./assets/v-tool-busy-20260922.png" : "./assets/v-idle-nohat-20260922.png";
  document.body.dataset.avatarState = tasks.size > 1 ? "very-busy" : tasks.size ? "busy" : "idle";
}
function renderTranscript(snapshot) {
  const log = $("conversation");
  const follow = log.scrollHeight - log.scrollTop - log.clientHeight < 64;
  const all = [...snapshot.history, ...snapshot.current];
  const visibleKeys = new Set(all.map(item => item.key));
  for (const [key, row] of renderedTurns) if (!visibleKeys.has(key)) { row.remove(); renderedTurns.delete(key); }
  $("currentLabel").textContent = call ? "正在说" : "最后的片段";
  $("conversationEmpty").hidden = all.length > 0;
  $("transcriptCurrent").hidden = snapshot.current.length === 0;
  for (const [items, parent] of [[snapshot.history, $("transcriptHistory")], [snapshot.current, $("transcriptCurrentRows")]]) {
    for (const [index, item] of items.entries()) {
      let row = renderedTurns.get(item.key);
      if (!row) {
        row = document.createElement("article");
        row.className = `transcript-turn ${item.role}`;
        const meta = document.createElement("div"); meta.className = "transcript-meta";
        const speaker = document.createElement("span"); speaker.className = "transcript-speaker";
        const time = document.createElement("time"); time.className = "transcript-time";
        const text = document.createElement("p"); text.className = "transcript-text";
        meta.append(speaker, time); row.append(meta, text);
        row.parts = { speaker, time, text };
        renderedTurns.set(item.key, row);
      }
      const streaming = String(Boolean(call) && !item.complete);
      if (row.dataset.streaming !== streaming) row.dataset.streaming = streaming;
      if (row.parts.speaker.textContent !== item.speaker) row.parts.speaker.textContent = item.speaker;
      if (row.parts.time.textContent !== item.time) row.parts.time.textContent = item.time;
      const dateTime = new Date(item.at).toISOString();
      if (row.parts.time.dateTime !== dateTime) row.parts.time.dateTime = dateTime;
      if (row.parts.text.textContent !== item.text) row.parts.text.textContent = item.text;
      if (parent.children[index] !== row) parent.insertBefore(row, parent.children[index] ?? null);
    }
  }
  if (follow) log.scrollTop = log.scrollHeight;
}
function resetTranscript() {
  presentation.reset(); renderedTurns.clear();
  $("transcriptHistory").replaceChildren(); $("transcriptCurrentRows").replaceChildren();
  renderTranscript(presentation.snapshot());
}
function providerMessage(event) {
  let data;
  try { data = JSON.parse(event.data); } catch { return; }
  const active = call;
  if (active && data.type === "turn.created" && ["user", "assistant"].includes(data.turn?.role)) {
    const at = performance.now();
    duplexDiagnostic(active, { type: "native-turn-created", at, role: data.turn.role });
    if (data.turn.role === "user") active.duplex.notifyUserTurnStarted(at);
    else if (typeof data.turn.id === "string" && data.turn.id.trim())
      active.duplex.notifyAssistantTurnCreated(data.turn.id, at);
  }
  if (active && data.type === "turn.done" && data.turn?.role === "assistant") {
    const at = performance.now();
    duplexDiagnostic(active, { type: "native-turn-done", at, role: "assistant" });
    if (typeof data.turn.id === "string" && data.turn.id.trim())
      active.duplex.notifyAssistantTurnDone(data.turn.id, at);
  }
  if (active && data.type === "output_audio_buffer.cleared") {
    const at = performance.now();
    duplexDiagnostic(active, { type: "native-output-audio-cleared", at });
    active.duplex.notifyOutputAudioCleared(at);
  }
  renderTranscript(presentation.consume(data, Date.now()));
  if (data.type === "error") setStatus("语音服务报告错误，请结束通话后重试。");
}
async function stopCall() {
  const active = call; call = null;
  if (starting === active) starting = null;
  if (active) {
    clearInterval(active.levelTimer); clearInterval(active.heartbeat);
    active.captureAbort?.abort(); active.capture?.dispose();
    void active.sounds?.dispose();
    active.duplex?.dispose(); active.duplexDiagnostics.closed = true;
    active.events?.close(); active.channel?.close(); active.pc?.close();
    if (!active.capture) active.stream?.getTracks().forEach((track) => track.stop());
  }
  $("remoteAudio").srcObject = null;
  $("remoteAudio").muted = false;
  tasks.clear(); taskState(); document.body.dataset.voiceState = "idle";
  document.body.dataset.callState = "idle";
  renderTranscript(presentation.snapshot());
  $("start").hidden = false; $("start").disabled = false; $("stop").hidden = true;
  $("steerText").disabled = true; $("steer").disabled = true;
  $("badge").textContent = liveReady ? "可以拨号" : "页面预览";
  $("startLabel").textContent = "拨号"; $("stopLabel").textContent = "结束通话";
  setStatus("拨号后，直接说话。");
  if (active) {
    await active.context?.close().catch(() => {});
    if (active.voiceSessionId) await api("close", { voiceSessionId: active.voiceSessionId }).catch(() => {});
  }
}
async function startCall() {
  if (starting || call) return;
  if (!liveReady) { setStatus("当前页面仅作预览，真实通话还未连接 VLab 候选服务。"); return; }
  $("start").disabled = true; $("start").hidden = true; $("stop").hidden = false;
  $("stopLabel").textContent = "取消拨号"; $("badge").textContent = "拨号中";
  document.body.dataset.callState = "dialing"; setStatus("正在连接 V…");
  resetTranscript();
  const active = { pc: new RTCPeerConnection(), captureAbort: new AbortController() }; call = active; starting = active;
  // Each call owns its sound element; a late play() from an older call cannot
  // pause or replace the next call's pickup. The page element configures assets.
  active.soundElement = document.createElement("audio"); active.soundElement.playsInline = true;
  for (const key of ["ringSrc", "pickupSrc"]) if ($("callSound").dataset[key]) active.soundElement.dataset[key] = $("callSound").dataset[key];
  active.sounds = createCallSounds({ audioElement: active.soundElement });
  void active.sounds.dial();
  // Activity metadata stays in this page's memory only. It contains no audio,
  // transcript, session identifiers or claim that the model was interrupted.
  active.duplexDiagnostics = { kind: "duplex-playback", schemaVersion: 2, closed: false,
    counts: {}, transitions: [], events: [] };
  globalThis.__gptLiveDuplexDiagnostics = active.duplexDiagnostics;
  active.duplex = createH5DuplexPlaybackGate({ mode: "native", onGateChange: (entry) => {
    if (call !== active) return;
    $("remoteAudio").muted = entry.localPlaybackMuted;
    duplexDiagnostic(active, { type: "local-playback-gate", at: entry.at,
      muted: entry.localPlaybackMuted, reason: entry.reason,
      oldTurnTerminal: entry.oldTurnTerminal, outputDrained: entry.outputDrained, ...playbackState(active) });
  } });
  active.duplexDiagnostics.playbackMode = active.duplex.snapshot().mode;
  active.duplexDiagnostics.interruptionOwner = active.duplex.snapshot().interruptionOwner;
  try {
    active.capture = await captureDuplexMicrophone({
      mediaDevices: navigator.mediaDevices, signal: active.captureAbort.signal,
      isCurrent: () => call === active,
      onDiagnostics: (metadata) => { if (call === active) active.duplexDiagnostics.microphone = metadata; },
    });
    active.stream = active.capture.stream;
    if (call !== active) { active.stream.getTracks().forEach((track) => track.stop()); return; }
    for (const track of active.stream.getAudioTracks()) active.pc.addTrack(track, active.stream);
    const reservation = await api("session"); active.voiceSessionId = reservation.voiceSessionId;
    if (call !== active) { await api("close", { voiceSessionId: active.voiceSessionId }); return; }
    active.channel = active.pc.createDataChannel("oai-events"); active.channel.onmessage = (event) => { if (call === active) providerMessage(event); };
    active.events = new EventSource("./api/events");
    active.events.onmessage = (event) => {
      if (call !== active) return;
      const value = JSON.parse(event.data);
      if (value.voiceSessionId !== active.voiceSessionId) return;
      if (value.type === "tool.call") tasks.add(value.callId);
      if (["tool.result", "tool.error"].includes(value.type)) tasks.delete(value.callId);
      taskState();
    };
    active.pc.ontrack = async (event) => {
      if (call !== active) return;
      const stream = new MediaStream([event.track]); $("remoteAudio").srcObject = stream;
      await startRemotePlayback(active, "track");
      if (call !== active) return;
      active.context = new AudioContext();
      try { await active.context.resume(); }
      catch (error) {
        if (call !== active) return;
        active.playbackContextBlocked = true;
        active.playbackNeedsGesture = true;
        duplexDiagnostic(active, { type: "context-resume-rejected", at: performance.now(), source: "track", errorName: error?.name ?? "Error", ...playbackState(active) });
        setStatus(playbackRecoveryMessage);
      }
      if (call !== active) { await active.context.close().catch(() => {}); return; }
      if (active.context.state !== "running") {
        active.playbackContextBlocked = true;
        active.playbackNeedsGesture = true;
        setStatus(playbackRecoveryMessage);
      }
      const analyser = active.context.createAnalyser(); analyser.fftSize = 1024;
      active.context.createMediaStreamSource(stream).connect(analyser);
      const microphoneAnalyser = active.context.createAnalyser(); microphoneAnalyser.fftSize = 1024;
      active.context.createMediaStreamSource(active.stream).connect(microphoneAnalyser);
      const samples = new Float32Array(analyser.fftSize);
      const microphoneSamples = new Float32Array(microphoneAnalyser.fftSize);
      active.levelTimer = setInterval(() => {
        if (call !== active) return;
        analyser.getFloatTimeDomainData(samples);
        microphoneAnalyser.getFloatTimeDomainData(microphoneSamples);
        const energy = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const microphoneEnergy = Math.sqrt(microphoneSamples.reduce((sum, value) => sum + value * value, 0) / microphoneSamples.length);
        const at = performance.now();
        // This analyser reads the inbound stream before HTML playback muting,
        // so a local gate cannot manufacture evidence of a provider audio gap.
        const duplex = active.duplex.observe({ at, microphoneRms: microphoneEnergy, remoteRms: energy });
        duplexDiagnostic(active, { type: "activity-window", at, microphoneRms: microphoneEnergy, remoteRms: energy,
          microphoneAboveAttack: microphoneEnergy >= .02, microphoneAboveRelease: microphoneEnergy > .01,
          microphoneVoiced: duplex.localUserSpeaking,
          remoteActive: energy > .008, muted: duplex.localPlaybackMuted,
          oldTurnTerminal: duplex.oldTurnTerminal, outputDrained: duplex.outputDrained, ...playbackState(active) });
        if (energy > .008 && ($("remoteAudio").paused || active.context.state !== "running") && !active.playbackNeedsGesture) {
          active.playbackNeedsGesture = true;
          active.playbackAudioBlocked = $("remoteAudio").paused;
          active.playbackContextBlocked = active.context.state !== "running";
          duplexDiagnostic(active, { type: "playback-not-running", at, ...playbackState(active) });
          setStatus(playbackRecoveryMessage);
        }
        if (duplex.recoverySuggested && !active.duplexRecoveryNotice) {
          active.duplexRecoveryNotice = true;
          setStatus(duplexRecoveryMessage);
        } else if (!duplex.localPlaybackMuted && active.duplexRecoveryNotice) {
          active.duplexRecoveryNotice = false;
          if ($("status").textContent === duplexRecoveryMessage) connectedStatus(active);
        }
        document.body.dataset.voiceState = energy > .008 && !duplex.localPlaybackMuted && !active.playbackNeedsGesture ? "speaking" : "listening";
      }, 50);
    };
    active.pc.onconnectionstatechange = () => {
      if (call !== active) return;
      if (active.pc.connectionState === "connected") {
        document.body.dataset.callState = "connected";
        void active.sounds.connected();
        $("stopLabel").textContent = "结束通话";
        $("badge").textContent = "通话中"; connectedStatus(active);
        $("start").hidden = true; $("stop").hidden = false;
        $("steerText").disabled = false; $("steer").disabled = false;
      } else if (["failed", "disconnected"].includes(active.pc.connectionState)) {
        void stopCall().then(() => { if (!call) setStatus("连接已中断，可以重新开始通话。"); });
      }
    };
    await active.pc.setLocalDescription(await active.pc.createOffer());
    await new Promise((resolve) => {
      if (active.pc.iceGatheringState === "complete") return resolve();
      const timer = setTimeout(resolve, 5000);
      active.pc.addEventListener("icegatheringstatechange", () => {
        if (active.pc.iceGatheringState === "complete") { clearTimeout(timer); resolve(); }
      });
    });
    if (call !== active) return;
    const result = await api("offer", { voiceSessionId: active.voiceSessionId, sdp: active.pc.localDescription.sdp });
    if (call !== active) return;
    await active.pc.setRemoteDescription({ type: "answer", sdp: result.sdp });
    if (call !== active) return;
    active.heartbeat = setInterval(() => { if (call === active) void api("heartbeat", { voiceSessionId: active.voiceSessionId }).catch(() => {}); }, 15000);
  } catch (error) { if (call === active) { await stopCall(); if (!call) setStatus(error.name === "NotAllowedError" ? "请允许麦克风访问后重试。" : error.message); } }
  finally { if (starting === active) starting = null; if (!call) $("start").disabled = false; }
}
$("start").addEventListener("click", startCall);
$("stop").addEventListener("click", () => void stopCall());
// A tap anywhere can restore browser playback. Never gate/stop the microphone
// or cancel accepted work while requesting this user gesture.
window.addEventListener("pointerdown", () => void recoverPlaybackGesture());
window.addEventListener("keydown", () => void recoverPlaybackGesture());
$("steerForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const text = $("steerText").value.trim(); if (!text || !call) return;
  const active = call;
  try { await api("steer", { voiceSessionId: active.voiceSessionId, text, mode: "steer" }); if (call === active) { $("steerText").value = ""; setStatus("补充条件已交给 V 的后台任务。"); } }
  catch (error) { if (call === active) setStatus(error.message); }
});
$("cancel").addEventListener("click", async () => {
  if (!call) return;
  const active = call;
  try { await api("steer", { voiceSessionId: active.voiceSessionId, text: "取消当前后台任务，不要继续执行。", mode: "cancel" }); if (call === active) setStatus("已请求取消后台任务。"); }
  catch (error) { if (call === active) setStatus(error.message); }
});
window.addEventListener("pagehide", () => {
  const active = call;
  if (!active) return;
  // Beacon survives navigation; stopCall synchronously releases every local
  // resource and dial owner before its best-effort asynchronous API cleanup.
  if (active.voiceSessionId) navigator.sendBeacon("./api/close", new Blob([JSON.stringify({ voiceSessionId: active.voiceSessionId })], { type: "application/json" }));
  void stopCall();
});
fetch("./api/status").then((r) => r.json()).then((s) => { liveReady = s.ready === true; $("badge").textContent = s.ready ? "可以拨号" : "页面预览"; if (!s.ready) setStatus("这是页面预览，真实通话需连接 VLab 候选服务。"); }).catch(() => setStatus("暂时无法连接 VLab，请稍后重试。"));
