// Viewer page: claims the link token, shows the desktop through noVNC, and
// lets an authorised viewer take or release control. The server enforces
// who may send input; the viewOnly flag here is only for the local UX.
//
// On a phone the page behaves like a phone, not like a mouse:
//   one finger scrolls (with momentum), a tap clicks, a long press is a right
//   click and a long press then drag selects; two fingers zoom and pan the
//   picture locally. A keyboard bar types live (Chinese is pasted). While the
//   phone has control the desktop itself turns portrait ("phone layout"); the
//   service puts it back whenever this viewer stops being the controller.
import RFB from "./novnc/core/rfb.js";
import keysyms from "./novnc/core/input/keysymdef.js";

const $ = (id) => document.getElementById(id);
const base = new URL(".", location.href);
const api = (route) => new URL(`api/${route}`, base).toString();
const token = location.hash.replace(/^#/u, "").trim();
const storageKey = `v-desktop-handoff:${token.slice(0, 12)}`;
const query = new URLSearchParams(location.search);

let viewer = null; // { viewer, canControl, handoffId, wsPath, title }
let rfb = null;
let status = null;
let lastCloseCode = null;

const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  },
};

function setStatus(text, cls = "") {
  $("status").textContent = text;
  $("status").className = cls;
}
let noticeTimer = null;
function notice(text, ms = 0) {
  const el = $("notice");
  clearTimeout(noticeTimer);
  if (!text) {
    el.hidden = true;
    return;
  }
  el.textContent = text;
  el.hidden = false;
  if (ms) {
    noticeTimer = setTimeout(() => (el.hidden = true), ms);
  }
}
const touch = matchMedia("(pointer: coarse)").matches;
let autoTakeDone = false;
let lastRole = null;
let releasingLocally = false;

function isController() {
  return status?.role === "controller" && rfb && !rfb.viewOnly;
}

function showButtons({ take = false, release = false, reconnect = false }) {
  const toggle = $("toggle");
  toggle.hidden = !take && !release;
  toggle.textContent = release ? "交还给 V" : "接管电脑";
  toggle.classList.toggle("back", release);
  toggle.dataset.take = take ? "1" : "";
  $("keyboard").hidden = !(release && touch);
  $("layout").hidden = !(release && touch && status?.layout);
  $("reconnect").hidden = !reconnect;
  if (!release) {
    closeKeyboard();
  }
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
  setStatus("正在连接电脑…");
  if (rfb) {
    rfb.disconnect();
    rfb = null;
  }
  resetZoom();
  const wsUrl = new URL(`${viewer.wsPath}?viewer=${encodeURIComponent(viewer.viewer)}`, location.href);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  rfb = new RFB($("screen"), wsUrl.toString(), { shared: true, wsProtocols: ["binary"], credentials: {} });
  rfb.resizeSession = false;
  rfb.viewOnly = true;
  rfb.background = "#000";
  rfb.scaleViewport = true; // whole desktop fitted; zooming is done locally (two fingers)
  rfb.clipViewport = false;
  rfb.addEventListener("connect", () => {
    setStatus(viewer.canControl ? "已连接" : "已连接 · 只能观看");
    showButtons({ take: viewer.canControl });
    poll();
  });
  rfb.addEventListener("disconnect", (event) => {
    rfb = null;
    stopMomentum();
    const detail = event.detail ?? {};
    const code = lastCloseCode;
    const messages = {
      4000: "控制权被另一个窗口接管了。可以重新连接继续观看。",
      4001: "这次接管的时间到了，桌面已断开。需要的话让 V 再发一个链接。",
      4002: "V 已结束这次接管。",
      4003: "连接出现协议错误，已断开。",
      4004: "你在别处重新打开了这个页面，这里已断开。",
      4005: `${viewer?.subject ?? "V 的电脑"}${/[A-Za-z0-9]$/u.test(viewer?.subject ?? "") ? " " : ""}暂时不可用。`,
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
    if (lastRole !== "controller") {
      onBecameController();
    }
    syncLayoutButton();
  } else {
    rfb.viewOnly = true;
    stopMomentum();
    if (lastRole === "controller" && !releasingLocally) {
      notice("控制权已回到 V 手里。要再操作就点「接管电脑」。", 6000);
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
    // 交还给 V also wakes V in its conversation (the service records it, the plugin picks it up).
    body: JSON.stringify({ viewer: viewer.viewer, take, handBack: !take }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    notice(body.error === "watch_only" ? "这个链接只能观看" : body.error === "not_connected" ? "还没连上桌面，稍等再点" : `操作失败：${body.error ?? res.status}`, 5000);
    releasingLocally = false;
    return;
  }
  if (take) {
    if (!touch) {
      notice(`现在你在操作${/^[A-Za-z0-9]/u.test(viewer?.subject ?? "V") ? " " : ""}${viewer?.subject ?? "V 的电脑"}。做完点「交还给 V」，V 会接着做。`, 7000);
    }
  } else {
    closeKeyboard();
    notice(body.wakesAgent ? "已交还，V 会接着做。" : "已交还。回到飞书点卡片上的「我完成了」，V 就会接着做。", 7000);
  }
  await poll();
  releasingLocally = false;
}

function onBecameController() {
  if (!touch) {
    return;
  }
  if (!store.get("v-handoff-hint-seen")) {
    $("hint").hidden = false;
  }
  if (status?.layout && store.get("v-handoff-layout") !== "desktop") {
    requestLayout("phone");
  }
}

// ---------------------------------------------------------------------------
// Phone layout: ask the service to turn the desktop portrait while we control.
// Desktop pixels per CSS pixel of the picture: >1 is sharper but smaller text.
const LAYOUT_SCALE = Math.min(2, Math.max(1, Number(query.get("k")) || 1.25));
let layoutBusy = false;

function syncLayoutButton() {
  const phone = status?.layout?.mode === "phone";
  $("layout").textContent = phone ? "横屏" : "竖屏";
  $("layout").setAttribute("aria-label", phone ? "切换到电脑原来的横屏布局" : "切换到适合手机的竖屏布局");
}

async function requestLayout(mode) {
  if (layoutBusy || !viewer || !isController()) {
    return;
  }
  layoutBusy = true;
  const area = $("screen").getBoundingClientRect();
  try {
    const res = await fetch(api("layout"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ viewer: viewer.viewer, mode, width: area.width * LAYOUT_SCALE, height: area.height * LAYOUT_SCALE }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      status = { ...status, layout: body };
      resetZoom();
    } else if (mode === "phone") {
      notice("没能切到竖屏，先用原来的横屏。", 4000);
    }
  } catch {
    /* transient */
  } finally {
    layoutBusy = false;
    syncLayoutButton();
  }
}

$("layout").addEventListener("click", () => {
  const next = status?.layout?.mode === "phone" ? "desktop" : "phone";
  store.set("v-handoff-layout", next);
  requestLayout(next);
});
let rotateTimer = null;
window.addEventListener("orientationchange", () => {
  clearTimeout(rotateTimer);
  rotateTimer = setTimeout(() => {
    if (status?.layout?.mode === "phone" && !keyboardOpen) {
      requestLayout("phone");
    }
  }, 500);
});

// ---------------------------------------------------------------------------
// Pointer output. Coordinates are computed from the canvas' on-screen box, so
// they stay right under noVNC's fit scaling and our own pinch zoom.
const MASK = { left: 1, middle: 2, right: 4, wheelUp: 8, wheelDown: 16, wheelLeft: 32, wheelRight: 64 };
const canvasEl = () => rfb?._canvas ?? null;

function fbPoint(clientX, clientY) {
  const canvas = canvasEl();
  if (!canvas || !rfb?._fbWidth) {
    return null;
  }
  const r = canvas.getBoundingClientRect();
  const x = Math.round(((clientX - r.left) * rfb._fbWidth) / r.width);
  const y = Math.round(((clientY - r.top) * rfb._fbHeight) / r.height);
  return { x: Math.min(rfb._fbWidth - 1, Math.max(0, x)), y: Math.min(rfb._fbHeight - 1, Math.max(0, y)) };
}
/** Desktop pixels per CSS pixel at the current zoom. */
function fbPerCss() {
  const canvas = canvasEl();
  if (!canvas || !rfb?._fbWidth) {
    return 1;
  }
  return rfb._fbWidth / canvas.getBoundingClientRect().width;
}
const debug = query.has("debug");
function pointer(p, mask) {
  if (!p || !isController() || rfb._rfbConnectionState !== "connected") {
    if (debug) console.log("pointer dropped", JSON.stringify(p), mask, isController());
    return;
  }
  if (debug) console.log("pointer", p.x, p.y, mask);
  RFB.messages.pointerEvent(rfb._sock, p.x, p.y, mask);
}
function click(p, button = MASK.left) {
  pointer(p, 0);
  pointer(p, button);
  pointer(p, 0);
}
function wheel(p, mask) {
  pointer(p, mask);
  pointer(p, 0);
}

// Feedback drawn where the finger is.
function mark(cls, clientX, clientY, ms) {
  const screen = $("screen");
  const r = screen.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = cls;
  el.style.left = `${clientX - r.left}px`;
  el.style.top = `${clientY - r.top}px`;
  screen.appendChild(el);
  if (ms) {
    setTimeout(() => el.remove(), ms);
  }
  return el;
}

// ---------------------------------------------------------------------------
// Scrolling: finger travel in desktop pixels becomes wheel notches, so the page
// moves about as far as the finger did; a flick keeps going and slows down.
// Measured on the V desktop (Chrome under TigerVNC): one notch scrolls 120 px,
// and notches closer than ~40 ms apart are mostly dropped, so they are queued
// and sent at a steady pace.
const NOTCH_PX = Number(query.get("notch")) || 120;
const PACE_MS = 45;
const MAX_QUEUED = 10;
const scroller = { acc: 0, accX: 0, point: null, raf: 0, v: 0, vx: 0, qy: 0, qx: 0, timer: 0, lastAt: 0 };

function scrollBy(dyFb, dxFb) {
  // Finger moving up (negative) reveals content below: wheel down.
  scroller.acc += -dyFb;
  scroller.accX += -dxFb;
  const n = Math.trunc(scroller.acc / NOTCH_PX);
  if (n) {
    scroller.qy = Math.max(-MAX_QUEUED, Math.min(MAX_QUEUED, scroller.qy + n));
    scroller.acc -= n * NOTCH_PX;
  }
  const m = Math.trunc(scroller.accX / NOTCH_PX);
  if (m) {
    scroller.qx = Math.max(-MAX_QUEUED, Math.min(MAX_QUEUED, scroller.qx + m));
    scroller.accX -= m * NOTCH_PX;
  }
  pumpWheel();
}
function pumpWheel() {
  if (scroller.timer) {
    return;
  }
  const tick = () => {
    scroller.timer = 0;
    if (scroller.qy) {
      wheel(scroller.point, scroller.qy > 0 ? MASK.wheelDown : MASK.wheelUp);
      scroller.qy -= Math.sign(scroller.qy);
    } else if (scroller.qx) {
      wheel(scroller.point, scroller.qx > 0 ? MASK.wheelRight : MASK.wheelLeft);
      scroller.qx -= Math.sign(scroller.qx);
    } else {
      parkPointer();
      return;
    }
    scroller.lastAt = performance.now();
    scroller.timer = setTimeout(tick, PACE_MS);
  };
  scroller.timer = setTimeout(tick, Math.max(0, PACE_MS - (performance.now() - scroller.lastAt)));
}
function clearWheel() {
  clearTimeout(scroller.timer);
  scroller.timer = 0;
  scroller.qy = 0;
  scroller.qx = 0;
}
/** After a scroll, rest the pointer on the scrollbar so pages do not pop hover cards under it. */
function parkPointer() {
  if (g.mode === "scroll" || scroller.raf || !scroller.point || !rfb?._fbWidth) {
    return;
  }
  pointer({ x: rfb._fbWidth - 2, y: scroller.point.y }, 0);
}
if (debug) {
  window.__vtest = { wheel: (x, y, mask) => wheel({ x, y }, mask), raw: (x, y, mask) => pointer({ x, y }, mask), rfb: () => rfb };
}
function stopMomentum() {
  cancelAnimationFrame(scroller.raf);
  scroller.raf = 0;
  clearWheel();
}
function startMomentum(vy, vx) {
  cancelAnimationFrame(scroller.raf); // keep notches already queued by the drag
  scroller.v = vy;
  scroller.vx = vx;
  let last = performance.now();
  const step = (now) => {
    const dt = Math.min(48, now - last);
    last = now;
    scroller.v *= Math.pow(0.94, dt / 16);
    scroller.vx *= Math.pow(0.94, dt / 16);
    scrollBy(scroller.v * dt, scroller.vx * dt);
    if (Math.abs(scroller.v) < 0.04 && Math.abs(scroller.vx) < 0.04) {
      scroller.raf = 0;
      pumpWheel();
      return;
    }
    scroller.raf = requestAnimationFrame(step);
  };
  scroller.raf = requestAnimationFrame(step);
}

// ---------------------------------------------------------------------------
// Local zoom (two fingers): a CSS transform on the canvas, never sent to V.
const zoom = { s: 1, tx: 0, ty: 0 };
function applyZoom() {
  const canvas = canvasEl();
  if (canvas) {
    canvas.style.transform = zoom.s === 1 && !zoom.tx && !zoom.ty ? "" : `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.s})`;
  }
  $("fit").hidden = zoom.s <= 1.01;
}
function resetZoom() {
  zoom.s = 1;
  zoom.tx = 0;
  zoom.ty = 0;
  applyZoom();
}
/** Keeps the zoomed picture over the screen area (no empty margins dragged in). */
function clampZoom() {
  const canvas = canvasEl();
  if (!canvas) {
    return;
  }
  const area = $("screen").getBoundingClientRect();
  const w = canvas.offsetWidth * zoom.s;
  const h = canvas.offsetHeight * zoom.s;
  const left0 = canvas.offsetLeft;
  const top0 = canvas.offsetTop;
  const fit = (t, start, size, view) => (size <= view ? (view - size) / 2 - start : Math.min(-start, Math.max(view - size - start, t)));
  zoom.tx = fit(zoom.tx, left0, w, area.width);
  zoom.ty = fit(zoom.ty, top0, h, area.height);
  if (zoom.s <= 1.01) {
    zoom.s = 1;
    zoom.tx = 0;
    zoom.ty = 0;
  }
}
$("fit").addEventListener("click", resetZoom);

// ---------------------------------------------------------------------------
// The gesture layer. Capture-phase listeners on the screen stop noVNC's own
// (mouse-like) touch gestures from ever seeing these events.
const TAP_SLOP = 10; // css px a finger may wander and still be a tap
const LONG_PRESS_MS = 450;
const g = { mode: "idle", start: null, last: null, timer: 0, samples: [], stopper: false, pinch: null, ended: 0 };

const local = (t) => ({ x: t.clientX, y: t.clientY });
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function beginOne(t) {
  const p = local(t);
  g.stopper = scroller.raf !== 0 || scroller.qy !== 0 || scroller.qx !== 0; // a touch during a fling only stops it, like a phone
  stopMomentum();
  g.mode = "pending";
  g.start = p;
  g.last = p;
  g.samples = [{ ...p, t: performance.now() }];
  scroller.acc = 0;
  scroller.accX = 0;
  scroller.point = fbPoint(p.x, p.y);
  clearTimeout(g.timer);
  g.timer = setTimeout(() => {
    if (g.mode === "pending") {
      g.mode = "press";
      navigator.vibrate?.(12);
      g.ring = mark("press", p.x, p.y, 0);
    }
  }, LONG_PRESS_MS);
}

function moveOne(t) {
  const p = local(t);
  const now = performance.now();
  g.samples.push({ ...p, t: now });
  while (g.samples.length > 2 && now - g.samples[0].t > 100) {
    g.samples.shift();
  }
  if (g.mode === "pending" && dist(p, g.start) > TAP_SLOP) {
    clearTimeout(g.timer);
    g.mode = "scroll";
    // Move the pointer there first; a wheel right after a pointer jump can be lost.
    pointer(scroller.point, 0);
    scroller.lastAt = performance.now();
    // Lock to the dominant axis; most pages only scroll vertically.
    g.axis = Math.abs(p.y - g.start.y) >= Math.abs(p.x - g.start.x) ? "y" : "x";
  } else if (g.mode === "press" && dist(p, g.start) > TAP_SLOP / 2) {
    // Long press then drag: hold the left button and move (select text, drag things).
    g.mode = "drag";
    g.ring?.remove();
    const s = fbPoint(g.start.x, g.start.y);
    pointer(s, 0);
    pointer(s, MASK.left);
  }
  if (g.mode === "scroll") {
    const k = fbPerCss();
    const dy = g.axis === "y" ? (p.y - g.last.y) * k : 0;
    const dx = g.axis === "x" ? (p.x - g.last.x) * k : 0;
    scrollBy(dy, dx);
  } else if (g.mode === "drag") {
    pointer(fbPoint(p.x, p.y), MASK.left);
  }
  g.last = p;
}

function endOne() {
  clearTimeout(g.timer);
  g.ring?.remove();
  g.ring = null;
  const p = g.last;
  if (g.mode === "pending" && !g.stopper) {
    click(fbPoint(p.x, p.y));
    mark("tap", p.x, p.y, 400);
  } else if (g.mode === "press") {
    click(fbPoint(p.x, p.y), MASK.right);
    mark("tap", p.x, p.y, 400);
  } else if (g.mode === "drag") {
    pointer(fbPoint(p.x, p.y), 0);
  } else if (g.mode === "scroll") {
    const first = g.samples[0];
    const last = g.samples.at(-1);
    const dt = last.t - first.t;
    if (dt > 0 && performance.now() - last.t < 60) {
      const k = fbPerCss();
      const vy = g.axis === "y" ? ((last.y - first.y) / dt) * k : 0;
      const vx = g.axis === "x" ? ((last.x - first.x) / dt) * k : 0;
      if (Math.hypot(vx, vy) > 0.25) {
        g.mode = "idle";
        startMomentum(vy, vx);
        return;
      }
    }
    // A slow drag that ends past half a notch still gets that notch.
    if (Math.abs(scroller.acc) >= NOTCH_PX / 2) {
      scroller.qy += Math.sign(scroller.acc);
    }
    if (Math.abs(scroller.accX) >= NOTCH_PX / 2) {
      scroller.qx += Math.sign(scroller.accX);
    }
    scroller.acc = 0;
    scroller.accX = 0;
    g.mode = "idle";
    pumpWheel();
    return;
  }
  g.mode = "idle";
}

function beginPinch(a, b) {
  clearTimeout(g.timer);
  g.ring?.remove();
  if (g.mode === "drag") {
    pointer(fbPoint(g.last.x, g.last.y), 0);
  }
  stopMomentum();
  const area = $("screen").getBoundingClientRect();
  const m = mid(a, b);
  g.mode = "pinch";
  g.pinch = { d0: Math.max(1, dist(a, b)), s0: zoom.s, tx0: zoom.tx, ty0: zoom.ty, m0: { x: m.x - area.left, y: m.y - area.top } };
}

function movePinch(a, b) {
  const canvas = canvasEl();
  if (!canvas) {
    return;
  }
  const area = $("screen").getBoundingClientRect();
  const m = mid(a, b);
  const pm = { x: m.x - area.left, y: m.y - area.top };
  const { d0, s0, tx0, ty0, m0 } = g.pinch;
  const s = Math.min(4, Math.max(1, (s0 * dist(a, b)) / d0));
  // Keep the desktop point that was under the fingers under the fingers.
  const ox = canvas.offsetLeft;
  const oy = canvas.offsetTop;
  const ux = (m0.x - ox - tx0) / s0;
  const uy = (m0.y - oy - ty0) / s0;
  zoom.s = s;
  zoom.tx = pm.x - ox - ux * s;
  zoom.ty = pm.y - oy - uy * s;
  clampZoom();
  applyZoom();
}

function onTouch(e) {
  if (!touch || !rfb) {
    return;
  }
  if (debug && e.type !== "touchmove") console.log("touch", e.type, e.touches.length, g.mode);
  e.stopPropagation();
  e.preventDefault();
  if (!isController()) {
    // Watching only: two fingers may still zoom the picture.
    if (e.touches.length === 2 && e.type !== "touchend") {
      if (g.mode !== "pinch") {
        beginPinch(local(e.touches[0]), local(e.touches[1]));
      } else {
        movePinch(local(e.touches[0]), local(e.touches[1]));
      }
    } else if (e.touches.length === 0) {
      g.mode = "idle";
    }
    return;
  }
  const n = e.touches.length;
  if (e.type === "touchstart") {
    if (n === 1 && g.mode === "idle") {
      beginOne(e.touches[0]);
    } else if (n === 2) {
      beginPinch(local(e.touches[0]), local(e.touches[1]));
    }
  } else if (e.type === "touchmove") {
    if (g.mode === "pinch" && n >= 2) {
      movePinch(local(e.touches[0]), local(e.touches[1]));
    } else if (n === 1 && ["pending", "press", "scroll", "drag"].includes(g.mode)) {
      moveOne(e.touches[0]);
    }
  } else {
    // touchend / touchcancel
    if (["pending", "press", "scroll", "drag"].includes(g.mode) && n === 0) {
      if (e.type === "touchcancel") {
        clearTimeout(g.timer);
        g.ring?.remove();
        if (g.mode === "drag") {
          pointer(fbPoint(g.last.x, g.last.y), 0);
        }
        g.mode = "idle";
      } else {
        endOne();
      }
    } else if (g.mode === "pinch" && n === 0) {
      g.mode = "idle";
    }
  }
}
for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
  $("screen").addEventListener(type, onTouch, { capture: true, passive: false });
}

// ---------------------------------------------------------------------------
// Keyboard bar: a visible input. Latin text is typed live as key presses;
// anything an IME composes (Chinese) or a long paste goes through the
// clipboard and Ctrl+V, which is fast and never mangles characters.
const XK = { Control_L: 0xffe3 };
const SPECIAL_KEYS = { Backspace: 0xff08, Enter: 0xff0d, Tab: 0xff09, Escape: 0xff1b, ArrowLeft: 0xff51, ArrowUp: 0xff52, ArrowRight: 0xff53, ArrowDown: 0xff54 };
const kbd = $("kbd");
let keyboardOpen = false;

function key(keysym, code) {
  if (isController()) {
    rfb.sendKey(keysym, code);
  }
}
function combo(letter) {
  if (!isController()) {
    return;
  }
  rfb.sendKey(XK.Control_L, "ControlLeft", true);
  rfb.sendKey(keysyms.lookup(letter.codePointAt(0)), `Key${letter.toUpperCase()}`);
  rfb.sendKey(XK.Control_L, "ControlLeft", false);
}
function paste(text) {
  if (!isController() || !text) {
    return;
  }
  rfb.clipboardPasteFrom(text);
  setTimeout(() => combo("v"), 60);
}
function typeText(text) {
  if (!isController() || !text) {
    return;
  }
  // eslint-disable-next-line no-control-regex
  if (text.length > 24 || /[^\x20-\x7e\n]/u.test(text)) {
    paste(text);
    return;
  }
  for (const ch of text) {
    key(ch === "\n" ? 0xff0d : keysyms.lookup(ch.codePointAt(0)));
  }
}

function openKeyboard() {
  if (!isController()) {
    return;
  }
  keyboardOpen = true;
  $("kbdbar").hidden = false;
  $("dock").hidden = true;
  kbd.focus();
  fitViewport();
}
function closeKeyboard() {
  if (!keyboardOpen) {
    return;
  }
  keyboardOpen = false;
  kbd.blur();
  $("kbdbar").hidden = true;
  $("dock").hidden = false;
  fitViewport();
}

kbd.addEventListener("keydown", (e) => {
  const keysym = SPECIAL_KEYS[e.key];
  if (keysym && !e.isComposing) {
    e.preventDefault();
    key(keysym, e.key);
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
kbd.addEventListener("paste", (e) => {
  const text = e.clipboardData?.getData("text/plain");
  if (text) {
    e.preventDefault();
    paste(text);
  }
});
for (const button of $("keys").querySelectorAll("button")) {
  // pointerdown + preventDefault keeps the input focused, so the phone keyboard stays up.
  button.addEventListener("pointerdown", (e) => e.preventDefault());
  button.addEventListener("click", () => {
    if (button.dataset.key) {
      key(SPECIAL_KEYS[button.dataset.key], button.dataset.key);
    } else if (button.dataset.combo) {
      combo(button.dataset.combo);
    }
  });
}
$("kbdclose").addEventListener("click", closeKeyboard);
$("keyboard").addEventListener("click", openKeyboard);

// The visual viewport shrinks when the phone keyboard opens; size the page to it
// so the keyboard bar sits right above the keyboard and nothing is hidden.
function fitViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty("--vvh", `${Math.round(h)}px`);
  if (vv && (vv.offsetTop || window.scrollY)) {
    window.scrollTo(0, 0);
  }
}
window.visualViewport?.addEventListener("resize", fitViewport);
window.visualViewport?.addEventListener("scroll", fitViewport);
fitViewport();

$("hintok").addEventListener("click", () => {
  $("hint").hidden = true;
  store.set("v-handoff-hint-seen", "1");
});

// A new link differs only in the fragment; the browser would not reload the page by itself.
window.addEventListener("hashchange", () => location.reload());
$("toggle").addEventListener("click", () => control($("toggle").dataset.take === "1"));
$("reconnect").addEventListener("click", () => connect());

// Not top-level await: the bundle also has to run on older iOS WebKit.
(async () => {
  setStatus("正在打开链接…");
  viewer = await claim();
  if (viewer) {
    document.title = viewer.title ?? document.title;
    $("title").textContent = viewer.title ?? viewer.subject ?? "V 的电脑";
    connect();
  }
})();
