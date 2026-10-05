// The entry page: reads the token from the URL fragment, shows what V asked
// for, and submits the value once. The fragment is cleared from the address
// bar right away so it does not linger in history or screenshots (this tab
// keeps it, so a reload still works).
const token = (() => {
  const fromHash = location.hash.slice(1);
  try {
    if (fromHash) sessionStorage.setItem("v-secret-entry", fromHash);
    return fromHash || sessionStorage.getItem("v-secret-entry") || "";
  } catch {
    return fromHash;
  }
})();
history.replaceState(null, "", location.pathname);
const $ = (id) => document.getElementById(id);

const post = async (route, body) => {
  const res = await fetch(`api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

const done = (text) => {
  try { sessionStorage.removeItem("v-secret-entry"); } catch {}
  $("form").hidden = true;
  $("status").textContent = text;
};

async function open() {
  if (!token) return done("链接不完整，请从聊天里重新点开。");
  const { ok, data } = await post("info", { token }).catch(() => ({ ok: false, data: {} }));
  if (!ok) return done(data.message ?? "打不开这个链接，请稍后再试。");
  $("name").textContent = data.name;
  if (data.reason) {
    $("reason").textContent = data.reason;
    $("reason").hidden = $("reason-label").hidden = false;
  }
  $("hosts").textContent = data.allowedHosts?.length ? data.allowedHosts.join("、") : "未限定";
  $("expires").textContent = new Date(data.expiresAtMs).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  $("status").textContent = "V 正在等你填写。";
  $("form").hidden = false;
  $("value").focus();
}

$("show").addEventListener("change", () => { $("value").type = $("show").checked ? "text" : "password"; });

$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = $("value").value;
  if (!value.trim()) { $("status").textContent = "请先填写再提交。"; return; }
  $("submit").disabled = true;
  $("status").textContent = "正在保存…";
  const { ok, status, data } = await post("submit", { token, value }).catch(() => ({ ok: false, status: 0, data: {} }));
  if (ok) {
    $("value").value = "";
    return done("✓ 已保存。可以回到聊天，V 会接着做。");
  }
  if (status === 410 || status === 404) {
    $("value").value = "";
    return done(data.message ?? "这个请求已经结束了。");
  }
  $("status").textContent = data.message ?? "保存失败，请稍后再试。";
  $("submit").disabled = false;
});

open();
