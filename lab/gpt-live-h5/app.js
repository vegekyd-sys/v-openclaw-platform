import { transcriptEvent } from "./events.mjs";
import { createH5DuplexPlaybackGate } from "./duplex-playback.mjs";

const $ = (id) => document.getElementById(id);
let call = null;
let starting = false;
let liveReady = false;
const duplexRecoveryMessage = "上一段语音还没确认结束。若仍无声音，请结束通话后重新开始。";
const rows = new Map();
const finalIds = new Set();
const tasks = new Set();
const setStatus = (text) => { $("status").textContent = text; };
function duplexDiagnostic(active, entry) {
  if (call !== active) return;
  active.duplexDiagnostics.events.push(entry);
  if (active.duplexDiagnostics.events.length > 1200) active.duplexDiagnostics.events.shift();
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
  $("taskStatus").textContent = tasks.size ? `V 正在处理 ${tasks.size} 个后台请求，你可以继续说话。` : "";
  $("cancel").disabled = tasks.size === 0;
  $("avatar").src = tasks.size ? "./assets/v-tool-busy-20260922.png" : "./assets/v-idle-nohat-20260922.png";
  document.body.dataset.avatarState = tasks.size ? "busy" : "idle";
}
function appendTranscript(item) {
  if (item.final && item.id && finalIds.has(`${item.role}:${item.id}`)) return;
  const key = item.role;
  let row = rows.get(key);
  if (!row) {
    $("conversation").querySelector(".empty")?.remove();
    row = document.createElement("p"); row.className = item.role; rows.set(key, row);
    $("conversation").append(row);
  }
  const text = item.final ? item.text : (row.dataset.text ?? "") + item.text;
  row.dataset.text = text;
  row.textContent = `${item.role === "user" ? "你" : "V"}：${text}`;
  if (item.final) { rows.delete(key); if (item.id) finalIds.add(`${item.role}:${item.id}`); }
  $("conversation").scrollTop = $("conversation").scrollHeight;
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
  const item = transcriptEvent(data);
  if (item) appendTranscript(item);
  if (data.type === "error") setStatus("语音服务报告错误，请结束通话后重试。");
}
async function stopCall() {
  const active = call; call = null;
  if (active) {
    clearInterval(active.levelTimer); clearInterval(active.heartbeat);
    active.duplex?.dispose(); active.duplexDiagnostics.closed = true;
    active.events?.close(); active.channel?.close(); active.pc?.close();
    active.stream?.getTracks().forEach((track) => track.stop());
  }
  $("remoteAudio").srcObject = null;
  $("remoteAudio").muted = false;
  tasks.clear(); taskState(); document.body.dataset.voiceState = "idle";
  rows.clear(); finalIds.clear();
  $("start").hidden = false; $("start").disabled = false; $("stop").hidden = true;
  $("steerText").disabled = true; $("steer").disabled = true;
  $("badge").textContent = "可开始通话"; setStatus("可以边聊边补充，也可以随时打断");
  if (active) {
    await active.context?.close().catch(() => {});
    if (active.voiceSessionId) await api("close", { voiceSessionId: active.voiceSessionId }).catch(() => {});
  }
}
async function startCall() {
  if (starting || call) return;
  if (!liveReady) { setStatus("当前页面仅作预览，真实通话还未连接 VLab 候选服务。"); return; }
  starting = true; $("start").disabled = true; $("stop").hidden = false; setStatus("正在打开麦克风并连接 V…");
  const active = { pc: new RTCPeerConnection() }; call = active;
  // Activity metadata stays in this page's memory only. It contains no audio,
  // transcript, session identifiers or claim that the model was interrupted.
  active.duplexDiagnostics = { kind: "local-playback-gate", closed: false, events: [] };
  globalThis.__gptLiveDuplexDiagnostics = active.duplexDiagnostics;
  active.duplex = createH5DuplexPlaybackGate({ onGateChange: (entry) => {
    if (call !== active) return;
    $("remoteAudio").muted = entry.localPlaybackMuted;
    duplexDiagnostic(active, { type: "local-playback-gate", at: entry.at,
      muted: entry.localPlaybackMuted, reason: entry.reason,
      oldTurnTerminal: entry.oldTurnTerminal, outputDrained: entry.outputDrained });
  } });
  try {
    active.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
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
      try { await $("remoteAudio").play(); } catch { if (call === active) setStatus("请点一下页面，允许播放 V 的声音。"); }
      if (call !== active) return;
      active.context = new AudioContext(); await active.context.resume();
      if (call !== active) { await active.context.close().catch(() => {}); return; }
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
        duplexDiagnostic(active, { type: "activity-window", at, microphoneVoiced: microphoneEnergy >= .02,
          remoteActive: energy > .008, muted: duplex.localPlaybackMuted,
          oldTurnTerminal: duplex.oldTurnTerminal, outputDrained: duplex.outputDrained });
        if (duplex.recoverySuggested && !active.duplexRecoveryNotice) {
          active.duplexRecoveryNotice = true;
          setStatus(duplexRecoveryMessage);
        } else if (!duplex.localPlaybackMuted && active.duplexRecoveryNotice) {
          active.duplexRecoveryNotice = false;
          if ($("status").textContent === duplexRecoveryMessage) setStatus("V 正在听，直接说话就好");
        }
        document.body.dataset.voiceState = energy > .008 && !duplex.localPlaybackMuted ? "speaking" : "listening";
      }, 50);
    };
    active.pc.onconnectionstatechange = () => {
      if (call !== active) return;
      if (active.pc.connectionState === "connected") {
        $("badge").textContent = "通话中"; setStatus("V 正在听，直接说话就好");
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
  finally { starting = false; if (!call) $("start").disabled = false; }
}
$("start").addEventListener("click", startCall);
$("stop").addEventListener("click", () => void stopCall());
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
  call?.duplex?.dispose();
  call?.stream?.getTracks().forEach((track) => track.stop()); call?.pc?.close();
  if (call) navigator.sendBeacon("./api/close", new Blob([JSON.stringify({ voiceSessionId: call.voiceSessionId })], { type: "application/json" }));
});
fetch("./api/status").then((r) => r.json()).then((s) => { liveReady = s.ready === true; $("badge").textContent = s.ready ? "可开始通话" : "页面预览"; if (!s.ready) setStatus("这是页面预览，真实通话需连接 VLab 候选服务。"); }).catch(() => setStatus("暂时无法连接 VLab，请稍后重试。"));
