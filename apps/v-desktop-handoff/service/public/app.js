// Viewer page: claims the link token, shows the desktop through noVNC, and
// lets an authorised viewer take or release control. The server enforces
// who may send input; the viewOnly flag here is only for the local UX.
import RFB from "./novnc/core/rfb.js";

const $ = (id) => document.getElementById(id);
const base = new URL(".", location.href);
const api = (route) => new URL(`api/${route}`, base).toString();
const token = location.hash.replace(/^#/u, "").trim();
const storageKey = `v-desktop-handoff:${token.slice(0, 12)}`;

let viewer = null; // { viewer, canControl, handoffId, wsPath, title }
let rfb = null;
let status = null;
let lastCloseCode = null;

function setStatus(text, cls = "") {
  $("status").textContent = text;
  $("status").className = cls;
}
function notice(text) {
  const el = $("notice");
  if (!text) {
    el.hidden = true;
    return;
  }
  el.textContent = text;
  el.hidden = false;
}
function showButtons({ take = false, release = false, reconnect = false }) {
  $("take").hidden = !take;
  $("release").hidden = !release;
  $("reconnect").hidden = !reconnect;
}

async function claim() {
  if (!token) {
    setStatus("链接无效：缺少令牌", "warn");
    return null;
  }
  try {
    const cached = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (cached?.viewer) {
      const check = await fetch(`${api("session")}?viewer=${encodeURIComponent(cached.viewer)}`, { cache: "no-store" });
      if (check.ok) {
        const s = await check.json();
        if (!s.ended) {
          return cached;
        }
      }
    }
  } catch {
    /* fall through to a fresh claim */
  }
  const res = await fetch(api("claim"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reasons = {
      unknown_token: "链接无效或已被撤销",
      expired: "链接已过期，请让 V 重新发一个",
      ended: "这次接管已经结束",
      too_many_claims: "这个链接打开次数过多，请让 V 重新发一个",
      too_many_viewers: "同时观看的人太多，稍后再试",
    };
    setStatus(reasons[body.error] ?? `无法打开（${body.error ?? res.status}）`, "warn");
    return null;
  }
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(body));
  } catch {
    /* private mode */
  }
  return body;
}

function connect() {
  notice("");
  if (rfb) {
    rfb.disconnect();
    rfb = null;
  }
  const wsUrl = new URL(`${viewer.wsPath}?viewer=${encodeURIComponent(viewer.viewer)}`, location.href);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  rfb = new RFB($("screen"), wsUrl.toString(), { shared: true, wsProtocols: ["binary"], credentials: {} });
  rfb.scaleViewport = true;
  rfb.resizeSession = false;
  rfb.viewOnly = true;
  rfb.background = "#000";
  rfb.addEventListener("connect", () => {
    setStatus(viewer.canControl ? "已连接 · 正在观看，点「接管控制」后可以操作" : "已连接 · 只能观看");
    showButtons({ take: viewer.canControl });
    poll();
  });
  rfb.addEventListener("disconnect", (event) => {
    rfb = null;
    const detail = event.detail ?? {};
    const code = lastCloseCode;
    const messages = {
      4000: "控制权被另一个窗口接管了。可以重新连接继续观看。",
      4001: "这次接管的时间到了，桌面已断开。需要的话让 V 再发一个链接。",
      4002: "V 已结束这次接管。",
      4003: "连接出现协议错误，已断开。",
      4004: "你在别处重新打开了这个页面，这里已断开。",
      4005: "V 的桌面暂时不可用。",
    };
    setStatus(messages[code] ?? (detail.clean ? "已断开" : "连接中断"), "warn");
    showButtons({ reconnect: ![4001, 4002].includes(code) });
  });
  const sock = rfb._sock?._websocket;
  if (sock) {
    sock.addEventListener("close", (e) => {
      lastCloseCode = e.code;
    });
  }
}

async function poll() {
  if (!viewer) {
    return;
  }
  try {
    const res = await fetch(`${api("session")}?viewer=${encodeURIComponent(viewer.viewer)}`, { cache: "no-store" });
    if (!res.ok) {
      return;
    }
    status = await res.json();
    render();
  } catch {
    /* transient */
  } finally {
    if (rfb) {
      setTimeout(poll, 4000);
    }
  }
}

function render() {
  if (!status || !rfb) {
    return;
  }
  const remaining = status.sessionExpiresAt ? Math.max(0, Math.round((status.sessionExpiresAt - status.now) / 60000)) : null;
  const tail = remaining !== null ? ` · 剩余约 ${remaining} 分钟` : "";
  if (status.role === "controller") {
    rfb.viewOnly = false;
    setStatus(`你正在控制 V 的桌面${tail}`, "controller");
    showButtons({ release: true });
    rfb.focus();
  } else {
    rfb.viewOnly = true;
    if (status.controlledByOther) {
      setStatus(`另一个窗口正在控制${tail}`);
    } else {
      setStatus(status.canControl ? `观看中 · 点「接管控制」后可以操作${tail}` : `观看中${tail}`);
    }
    showButtons({ take: status.canControl });
  }
}

async function control(take) {
  const res = await fetch(api("control"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ viewer: viewer.viewer, take }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    notice(body.error === "watch_only" ? "这个链接只能观看" : `操作失败：${body.error ?? res.status}`);
    return;
  }
  if (take) {
    notice("现在你在操作 V 的浏览器。登录完成后点「交还给 V」，再回到聊天里告诉 V 一声。");
    setTimeout(() => notice(""), 6000);
  }
  await poll();
}

$("take").addEventListener("click", () => control(true));
$("release").addEventListener("click", () => control(false));
$("reconnect").addEventListener("click", () => connect());

viewer = await claim();
if (viewer) {
  document.title = viewer.title ?? document.title;
  $("title").textContent = viewer.title ?? "V 的桌面";
  connect();
}
