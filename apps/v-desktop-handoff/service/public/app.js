// Viewer page: claims the link token, shows the desktop through noVNC, and
// lets an authorised viewer take or release control. The server enforces
// who may send input; the viewOnly flag here is only for the local UX.
// Mobile first: opening a control link takes control right away, one big
// button toggles 接管电脑 / 交还给 V, and a hidden input brings up the phone
// keyboard.
import RFB from "./novnc/core/rfb.js";
import keysyms from "./novnc/core/input/keysymdef.js";

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
const touch = matchMedia("(pointer: coarse)").matches;
let autoTakeDone = false;
let lastRole = null;
let releasingLocally = false;
let zoomed = false;

function showButtons({ take = false, release = false, reconnect = false }) {
  const toggle = $("toggle");
  toggle.hidden = !take && !release;
  toggle.textContent = release ? "交还给 V" : "接管电脑";
  toggle.classList.toggle("back", release);
  toggle.dataset.take = take ? "1" : "";
  $("keyboard").hidden = !(release && touch);
  $("zoom").hidden = !rfb;
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

function applyZoom() {
  if (!rfb) {
    return;
  }
  // Fit the whole desktop, or show it 1:1 and pan by dragging (a tap still clicks).
  rfb.scaleViewport = !zoomed;
  rfb.clipViewport = zoomed;
  rfb.dragViewport = zoomed;
  $("zoom").textContent = zoomed ? "适应" : "放大";
  $("zoom").classList.toggle("on", zoomed);
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
  rfb.resizeSession = false;
  rfb.viewOnly = true;
  rfb.background = "#000";
  applyZoom();
  rfb.addEventListener("connect", () => {
    setStatus(viewer.canControl ? "已连接" : "已连接 · 只能观看");
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
      4005: "V 的电脑暂时不可用。",
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
    // A control link takes control as soon as it opens: one tap in the chat, then just work.
    if (!autoTakeDone && rfb && status.canControl && status.role !== "controller" && !status.controlledByOther) {
      autoTakeDone = true;
      await control(true);
      return;
    }
    autoTakeDone = true;
  } catch {
    /* transient */
  } finally {
    if (rfb) {
      setTimeout(poll, status?.role === "controller" ? 2000 : 4000);
    }
  }
}

function render() {
  if (!status || !rfb) {
    return;
  }
  const remaining = status.sessionExpiresAt ? Math.max(0, Math.round((status.sessionExpiresAt - status.now) / 60000)) : null;
  const tail = remaining !== null ? ` · 剩约 ${remaining} 分钟` : "";
  if (status.role === "controller") {
    rfb.viewOnly = false;
    setStatus(`你在操作${tail}`, "controller");
    showButtons({ release: true });
    if (!touch) {
      rfb.focus();
    }
  } else {
    rfb.viewOnly = true;
    if (lastRole === "controller" && !releasingLocally) {
      notice("控制权已回到 V 手里。要再操作就点「接管电脑」。");
      setTimeout(() => notice(""), 6000);
    }
    if (status.controlledByOther) {
      setStatus(`另一个窗口正在操作${tail}`);
    } else {
      setStatus(status.canControl ? `V 在用${tail}` : `观看中${tail}`);
    }
    showButtons({ take: status.canControl });
  }
  lastRole = status.role;
}

async function control(take) {
  releasingLocally = !take;
  const res = await fetch(api("control"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ viewer: viewer.viewer, take }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    notice(body.error === "watch_only" ? "这个链接只能观看" : body.error === "not_connected" ? "还没连上桌面，稍等再点" : `操作失败：${body.error ?? res.status}`);
    releasingLocally = false;
    return;
  }
  if (take) {
    notice(touch ? "现在你在操作 V 的电脑：点一下就是点击，需要打字点「键盘」。做完回飞书点「交还给 V」。" : "现在你在操作 V 的电脑。做完点「交还给 V」，或回飞书点卡片上的「交还给 V」。");
    setTimeout(() => notice(""), 7000);
  } else {
    $("kbd").blur();
    notice("已交还。回到飞书点卡片上的「交还给 V」，V 就会接着做。");
  }
  await poll();
  releasingLocally = false;
}

// ---- phone keyboard: a hidden input whose text is forwarded as key presses ----
const SPECIAL_KEYS = { Backspace: 0xff08, Enter: 0xff0d, Tab: 0xff09, Escape: 0xff1b, ArrowLeft: 0xff51, ArrowUp: 0xff52, ArrowRight: 0xff53, ArrowDown: 0xff54 };
function typeText(text) {
  if (!rfb || rfb.viewOnly || !text) {
    return;
  }
  for (const ch of text) {
    const keysym = ch === "\n" ? 0xff0d : keysyms.lookup(ch.codePointAt(0));
    if (keysym) {
      rfb.sendKey(keysym);
    }
  }
}
const kbd = $("kbd");
kbd.addEventListener("keydown", (e) => {
  const keysym = SPECIAL_KEYS[e.key];
  if (keysym && rfb && !rfb.viewOnly) {
    e.preventDefault();
    rfb.sendKey(keysym);
  }
});
kbd.addEventListener("input", (e) => {
  if (e.isComposing) {
    return; // wait for the IME to finish (Chinese input)
  }
  typeText(kbd.value);
  kbd.value = "";
});
kbd.addEventListener("compositionend", () => {
  typeText(kbd.value);
  kbd.value = "";
});

// A new link differs only in the fragment; the browser would not reload the page by itself.
window.addEventListener("hashchange", () => location.reload());
$("toggle").addEventListener("click", () => control($("toggle").dataset.take === "1"));
$("keyboard").addEventListener("click", () => {
  kbd.focus();
});
$("zoom").addEventListener("click", () => {
  zoomed = !zoomed;
  applyZoom();
});
$("reconnect").addEventListener("click", () => connect());

viewer = await claim();
if (viewer) {
  document.title = viewer.title ?? document.title;
  $("title").textContent = viewer.title ?? "V 的电脑";
  connect();
}
