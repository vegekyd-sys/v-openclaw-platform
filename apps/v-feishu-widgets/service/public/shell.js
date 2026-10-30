// The widget document already carries OpenClaw's bridge (src/canvas/wrap.ts), so this page
// only plays the host's side of it: it answers the prompt offer on the MessagePort and fits
// the frame. The same protocol runs in the iOS client's WKWebView. Identity lives here, in
// the trusted page, never in the sandboxed frame.
const config = JSON.parse(document.body.dataset.config);
const frame = document.getElementById("frame");
const status = document.getElementById("status");
let ticket = null;
let who = null;
let failure = null;
// The document's own bridge runs before widget code and offers its port first; that port is the
// one behind the click check. Any later offer is widget code trying to bring its own port.
let promptPortTaken = false;
const queue = [];
const say = (text, state = "") => { status.textContent = text; status.dataset.state = state; };
const sendAs = () => { status.textContent = "按钮的操作会以 "; const b = document.createElement("b"); b.textContent = who; status.append(b, " 的身份发回会话"); status.dataset.state = ""; };

async function post(route, body) {
  const res = await fetch(`${config.base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function sendPrompt(text) {
  if (!ticket) {
    if (failure) return say(failure, "error");
    queue.push(text);
    return say("正在确认身份，确认后发送…");
  }
  say("正在发送…");
  const { status: code, body } = await post("/api/prompt", { id: config.id, ticket, text }).catch(() => ({ status: 0, body: {} }));
  if (code === 200) { say("已发回会话，V 正在处理"); setTimeout(sendAs, 4000); return; }
  const reason = { 429: "点得太快了，稍后再试", 403: "你不在这个会话里，不能发送", 401: "身份已失效，请重新打开" }[code] ?? `发送失败${body.error ? `（${body.error}）` : ""}`;
  say(reason, "error");
}

window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow) return;
  const data = event.data;
  if (data?.type === "openclaw:widget-prompt-offer" && event.ports[0]) {
    if (promptPortTaken) return;
    promptPortTaken = true;
    const port = event.ports[0];
    port.onmessage = (message) => {
      if (message.data?.type === "openclaw:widget-prompt" && typeof message.data.prompt === "string") void sendPrompt(message.data.prompt);
    };
    port.start();
    port.postMessage({ type: "openclaw:widget-prompt-host-ready" });
    return;
  }
  if (data?.type === "openclaw:widget-bridge-ready") {
    frame.contentWindow.postMessage({ type: "openclaw:widget-chat-host" }, "*");
    return;
  }
  if (data?.type === "openclaw:widget-size" && Number.isFinite(data.height)) frame.style.height = `${Math.min(Math.ceil(data.height), 20000)}px`;
});

const showFrame = () => { promptPortTaken = false; frame.src = `${config.base}/w/${config.id}/frame?v=${config.version}`; };

// A pinned widget is updated by name: reload the document, keep this page and its identity.
setInterval(async () => {
  if (document.hidden) return;
  const meta = await fetch(`${config.base}/w/${config.id}/meta`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (meta && meta.version !== config.version) { config.version = meta.version; showFrame(); }
}, 15000);

function identify() {
  const giveUp = (reason, errno = null) => {
    failure = reason;
    say(reason, "error");
    void post("/api/identity", { id: config.id, failure: { errno } }).catch(() => {});
  };
  const timer = setTimeout(() => { if (!ticket) giveUp("没能确认飞书身份，组件可以看，但按钮发不回会话"); }, 10000);
  const onCode = async (result) => {
    clearTimeout(timer);
    if (typeof result?.code !== "string") return giveUp("飞书没有返回身份，按钮发不回会话");
    const { status: code, body } = await post("/api/identity", { id: config.id, code: result.code }).catch(() => ({ status: 0, body: {} }));
    if (code === 403) return giveUp("你不在这个会话里，只能查看");
    if (!body.ticket) return giveUp("身份确认失败，组件可以看，但按钮发不回会话");
    ticket = body.ticket;
    who = body.name;
    sendAs();
    while (queue.length) void sendPrompt(queue.shift());
  };
  const start = () => {
    const onFail = (error) => { clearTimeout(timer); giveUp(`飞书身份确认失败（${error?.errno ?? "?"}），按钮发不回会话`, Number.isInteger(error?.errno) ? error.errno : null); };
    const legacy = () => window.tt?.requestAuthCode ? window.tt.requestAuthCode({ appId: config.appId, success: onCode, fail: onFail }) : onFail();
    if (window.tt?.requestAccess) window.tt.requestAccess({ appID: config.appId, scopeList: [], success: onCode, fail: (error) => (error?.errno === 103 ? legacy() : onFail(error)) });
    else legacy();
  };
  const script = document.createElement("script");
  script.src = "https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.26.js";
  script.onerror = () => { clearTimeout(timer); giveUp("这个组件要在飞书里打开，按钮才能发回会话"); };
  script.onload = () => {
    if (!window.h5sdk) { clearTimeout(timer); return giveUp("这个组件要在飞书里打开，按钮才能发回会话"); }
    window.h5sdk.error((error) => { clearTimeout(timer); giveUp("飞书 SDK 初始化失败，按钮发不回会话", Number.isInteger(error?.errno) ? error.errno : null); });
    window.h5sdk.ready(start);
  };
  document.head.append(script);
}

showFrame();
identify();
