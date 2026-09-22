import { VolcengineRtcManagedRoomClient } from "/adapter.js";

const elements = {
  badge: document.querySelector("#connectionBadge"),
  copy: document.querySelector("#copyLogButton"),
  conversation: document.querySelector("#conversation"),
  log: document.querySelector("#diagnosticLog"),
  orb: document.querySelector("#orb"),
  start: document.querySelector("#talkButton"),
  status: document.querySelector("#statusText"),
  stop: document.querySelector("#stopButton"),
};

const stepStartedAt = new Map();
let client = null;
let session = null;
let transcriptSeq = 0;
const logLines = [];

function elapsed(startedAt) {
  return `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
}

function log(message, detail) {
  const suffix = detail === undefined ? "" : ` ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  const line = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${message}${suffix}`;
  logLines.push(line);
  if (logLines.length > 180) logLines.splice(0, logLines.length - 180);
  elements.log.textContent = logLines.join("\n");
  elements.log.scrollTop = elements.log.scrollHeight;
}

function setStep(name, state, detail) {
  const node = document.querySelector(`[data-step="${name}"]`);
  if (!node) return;
  if (state === "running") stepStartedAt.set(name, performance.now());
  const startedAt = stepStartedAt.get(name);
  node.dataset.state = state;
  node.querySelector("em").textContent = detail ?? (state === "done" && startedAt ? elapsed(startedAt) : state === "running" ? "进行中" : state === "error" ? "失败" : "等待");
}

function resetSteps() {
  for (const name of ["gateway", "sdk", "room", "audio"]) setStep(name, "idle", "等待");
}

function setStatus(status, detail) {
  elements.status.textContent = detail || ({ connecting: "正在连接小何…", listening: "我在听，请直接说", thinking: "V 正在处理…", speaking: "V 正在说话", idle: "语音已结束", error: "连接失败" }[status] ?? status);
  const active = ["listening", "thinking", "speaking"].includes(status);
  elements.orb.classList.toggle("active", active);
  elements.badge.classList.toggle("active", active);
  elements.badge.textContent = status === "listening" ? "正在听" : status === "thinking" ? "处理中" : status === "speaking" ? "正在说" : status === "error" ? "错误" : status === "connecting" ? "连接中" : "未连接";
}

function addTranscript({ role, text, final }) {
  if (!text?.trim()) return;
  elements.conversation.querySelector(".empty")?.remove();
  const existing = elements.conversation.querySelector(`[data-live-role="${role}"]`);
  const row = existing ?? document.createElement("div");
  if (!existing) {
    row.className = `line ${role}`;
    row.dataset.liveRole = role;
    row.innerHTML = `<b>${role === "user" ? "你" : "V"}</b><span></span>`;
    elements.conversation.append(row);
  }
  row.querySelector("span").textContent = text;
  row.classList.toggle("partial", !final);
  if (final) {
    delete row.dataset.liveRole;
    persistTranscript(role, text).catch((error) => log("转录保存失败", error.message));
  }
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  return payload;
}

async function persistTranscript(role, text) {
  if (!session?.voiceSessionId) return;
  transcriptSeq += 1;
  await api("/api/transcript", {
    voiceSessionId: session.voiceSessionId,
    entryId: `h5-${Date.now()}-${transcriptSeq}`,
    role,
    text,
  });
}

async function executeToolCall({ callId, name, args, signal, submit }) {
  if (signal?.aborted) return;
  log(`工具调用 ${name}`, { callId });
  try {
    const result = name === "openclaw_agent_control"
      ? await api("/api/steer", { text: args?.text, mode: args?.mode })
      : await api("/api/tool-call", { callId, name, args, voiceSessionId: session?.voiceSessionId });
    if (!signal?.aborted) await submit(callId, result);
    log(`工具完成 ${name}`);
  } catch (error) {
    if (!signal?.aborted) await submit(callId, { error: error.message });
    log(`工具失败 ${name}`, error.message);
  }
}

async function start() {
  elements.start.disabled = true;
  resetSteps();
  setStatus("connecting");
  setStep("gateway", "running");
  log("开始独立 H5 验收");
  try {
    session = await api("/api/session", {});
    log("V 会话创建完成", { provider: session.provider, transport: session.transport });
    setStep("gateway", "done");
    client = new VolcengineRtcManagedRoomClient(session, {
      input: { stop() {} },
      executeToolCall,
      callbacks: {
        onStatus(status, detail) {
          setStatus(status, detail);
          if (status === "error") {
            const running = [...document.querySelectorAll('.step[data-state="running"]')].at(-1);
            if (running) setStep(running.dataset.step, "error", detail || "失败");
          }
        },
        onTranscript: addTranscript,
        onTalkEvent(event) { log(`RTC 事件 ${event.type}`, event.final === undefined ? undefined : { final: event.final }); },
      },
    }, {
      onStage(event) {
        setStep(event.stage, event.status, event.detail);
        log(`RTC ${event.stage} ${event.status}`, event.detail);
      },
    });
    const result = await client.start();
    if (result !== "ready") throw new Error(`RTC 返回 ${result}`);
    client.activate();
    elements.start.hidden = true;
    elements.stop.hidden = false;
    setStatus("listening");
  } catch (error) {
    log("启动失败", error.message);
    setStatus("error", error.message);
    const running = [...document.querySelectorAll('.step[data-state="running"]')].at(-1);
    if (running) setStep(running.dataset.step, "error", error.message);
    await stop({ keepStatus: true });
    elements.start.disabled = false;
  }
}

async function stop({ keepStatus = false } = {}) {
  client?.stop();
  client = null;
  if (session?.voiceSessionId) {
    await api("/api/close", { voiceSessionId: session.voiceSessionId }).catch((error) => log("会话关闭失败", error.message));
  }
  session = null;
  elements.start.hidden = false;
  elements.start.disabled = false;
  elements.stop.hidden = true;
  if (!keepStatus) setStatus("idle");
}

elements.start.addEventListener("click", start);
elements.stop.addEventListener("click", () => stop());
elements.copy.addEventListener("click", async () => {
  await navigator.clipboard.writeText(logLines.join("\n"));
  elements.copy.textContent = "已复制";
  window.setTimeout(() => { elements.copy.textContent = "复制诊断"; }, 1200);
});
window.addEventListener("pagehide", () => {
  client?.stop();
  if (session?.voiceSessionId) {
    navigator.sendBeacon(
      "/api/close",
      new Blob([JSON.stringify({ voiceSessionId: session.voiceSessionId })], { type: "application/json" }),
    );
  }
});

api("/api/status").then((status) => {
  log("H5 桥接已就绪", status);
  elements.badge.textContent = "可连接";
}).catch((error) => {
  log("H5 桥接不可用", error.message);
  setStatus("error", `桥接不可用：${error.message}`);
});
