"use strict";
const el = (id) => document.getElementById(id);
const full = (n) => new Intl.NumberFormat("zh-CN").format(n);
const compact = (n) =>
  n >= 1e8
    ? (n / 1e8).toFixed(2) + " 亿"
    : n >= 1e4
      ? (n / 1e4).toFixed(1) + " 万"
      : full(n);
const day = (seconds) =>
  new Date((seconds + 28800) * 1000).toISOString().slice(0, 10);
const clock = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const channels = {
  feishu: "飞书",
  telegram: "Telegram",
  dashboard: "控制台",
  wecom: "企业微信",
  "dingtalk-connector": "钉钉",
};
const human = (id) => !["系统任务", "未归属"].includes(id);
let snapshot,
  rows = [],
  user = "",
  session = "",
  page = 0,
  busy = false,
  filters = {};
const pageSize = 15;

function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function periodText(data) {
  return (
    day(data.start).slice(5).replace("-", ".") +
    " — " +
    clock.format(data.end * 1000).replace("/", ".") +
    " · 北京时间"
  );
}
function cname(id) {
  return channels[id] || id;
}
function uname(key) {
  const saved = snapshot.names[key];
  if (saved && !/^(ou_|oc_)/.test(saved)) return saved;
  const [channel, , actor] = JSON.parse(key);
  return cname(channel) + "用户 · " + actor.slice(-6);
}
function sessionName(id, owner) {
  const meta = snapshot.sessions?.[id] || {};
  if (meta.title && !/^(ou_|oc_)/.test(meta.title)) return meta.title;
  if (meta.kind === "direct")
    return (owner ? uname(owner) + "的" : "") + "私聊";
  if (meta.kind === "group" || meta.kind === "channel") return "群聊";
  return snapshot.workloads?.[id] || "对话";
}
function dateScope() {
  const value = el("range").value;
  if (value === "custom") return [el("from").value, el("to").value];
  const date =
    value === "today"
      ? day(Date.now() / 1000)
      : value === "yesterday"
        ? day(Date.now() / 1000 - 86400)
        : value;
  return value === "all"
    ? [day(snapshot.start), day(snapshot.end - 1)]
    : [date, date];
}
function sum(items) {
  return items.reduce((n, r) => n + r.total, 0);
}
function group(items, field) {
  const groups = new Map();
  for (const r of items) {
    if (!groups.has(r[field])) groups.set(r[field], []);
    groups.get(r[field]).push(r);
  }
  return [...groups]
    .map(([id, rs]) => ({ id, rs, total: sum(rs) }))
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
}
function resetView() {
  user = "";
  session = "";
  page = 0;
  el("search").value = "";
  render();
}
function selectFilters() {
  const host = el("selectors");
  host.replaceChildren();
  for (const [field, name] of Object.entries({
    channel: "渠道",
    model: "模型",
    workload: "任务类型",
  })) {
    const label = node("label", name),
      control = node("select");
    control.add(new Option("全部", ""));
    for (const v of [...new Set(rows.map((r) => r[field]))].sort())
      control.add(new Option(field === "channel" ? cname(v) : v, v));
    control.value = filters[field] || "";
    control.onchange = () => {
      filters[field] = control.value;
      resetView();
    };
    label.append(control);
    host.append(label);
  }
  const reset = node("button", "清除筛选");
  reset.onclick = () => {
    filters = {};
    selectFilters();
    resetView();
  };
  host.append(reset);
}
function mini(host, title, amount, cls = "") {
  const line = node("div", undefined, "mini " + cls);
  line.append(node("span", title), node("b", amount));
  host.append(line);
}
function rowView(item, title, sub, mid, action, avatar, i) {
  const line = node(action ? "button" : "div", undefined, "grid item"),
    name = node("span", undefined, "nameblock");
  if (avatar) {
    const first = [...title][0] || "·";
    name.append(node("span", first, "avatar tone" + (i % 5)));
  }
  const text = node("span", undefined, "identity");
  text.append(node("strong", title), node("small", sub));
  name.append(text);
  line.append(
    name,
    node("span", mid),
    node("span", compact(item.total), "amount"),
    node("span", action ? "›" : "", "chevron"),
  );
  line.title = title + " · " + full(item.total) + " Token";
  if (action) line.onclick = action;
  return line;
}
function metrics(items) {
  const people = items.filter((r) => human(r.user)),
    host = el("metrics");
  host.replaceChildren();
  const sessions = full(new Set(people.map((r) => r.session)).size);
  const values = user
    ? [
        session
          ? ["用量记录", full(people.reduce((n, r) => n + r.counts[5], 0))]
          : ["相关会话", sessions],
        ["使用模型", full(new Set(people.map((r) => r.model)).size)],
        [
          session ? "会话内 Token" : "个人 Token",
          compact(sum(people)),
          sum(people),
        ],
      ]
    : [
        ["活跃用户", full(new Set(people.map((r) => r.user)).size)],
        ["用户会话", sessions],
        ["用户 Token", compact(sum(people)), sum(people)],
      ];
  for (const [title, value, exact] of values) {
    const cell = node("div");
    cell.append(node("span", title), node("strong", value));
    if (exact !== undefined) cell.title = full(exact) + " Token";
    host.append(cell);
  }
}
function coverage(all, from, to) {
  const host = el("coverage");
  host.replaceChildren();
  const total = sum(all),
    people = sum(all.filter((r) => human(r.user))),
    unknown = sum(all.filter((r) => r.user === "未归属"));
  el("personal-share").textContent = total
    ? ((people / total) * 100).toFixed(1) + "% 归到个人"
    : "";
  mini(
    host,
    "全部会话（按 Session ID 去重）",
    full(new Set(all.map((r) => r.session)).size),
  );
  for (const [label, n] of [
    ["V 总用量", total],
    ["已归属用户", people],
    ["系统任务", sum(all.filter((r) => r.user === "系统任务"))],
    ["未归属", unknown],
  ]) {
    mini(host, label, full(n));
  }
  const reasons = new Map();
  for (const [
    date,
    ch,
    sid,
    provider,
    model,
    reason,
    n,
  ] of snapshot.unknownReasons || []) {
    if (
      date < from ||
      date > to ||
      (filters.channel && ch !== filters.channel) ||
      (filters.model && provider + " / " + model !== filters.model) ||
      (filters.workload && snapshot.workloads?.[sid] !== filters.workload)
    )
      continue;
    reasons.set(reason, (reasons.get(reason) || 0) + n);
  }
  for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1]))
    mini(host, reason, compact(n), "indent");
}
function technical(items) {
  const host = el("technical");
  host.replaceChildren();
  for (const [i, label] of [
    "普通输入",
    "缓存读取",
    "缓存写入",
    "输出",
    "合计",
  ].entries())
    mini(host, label, full(items.reduce((n, r) => n + r.counts[i], 0)));
  const axis = el("groupby").value,
    groups = group(items, axis);
  for (const g of groups.slice(0, 20))
    mini(
      host,
      axis === "channel"
        ? cname(g.id)
        : axis === "session"
          ? sessionName(g.id, user) + " · " + g.id.slice(-8)
          : g.id,
      full(g.total),
    );
  const stat = snapshot.stats || {};
  host.append(
    node(
      "p",
      "快照核对了 " +
        (stat.agentDatabases || 0) +
        " 个 Agent 库，替换 " +
        full(stat.replacedMirrors || 0) +
        " 条镜像。缺失原生日志 " +
        full(stat.missingRollouts || 0) +
        " 个，零值或缺用量消息 " +
        full(stat.zeroOrMissing || 0) +
        " 条，分项与上报总量不一致 " +
        full(stat.componentMismatch || 0) +
        " 条。",
    ),
  );
  if (groups.length > 20)
    host.append(
      node("p", "显示用量最高的 20 项，共 " + full(groups.length) + " 项。"),
    );
}
function render() {
  if (!snapshot) return;
  const [from, to] = dateScope();
  const scope = rows.filter(
    (r) =>
      r.date >= from &&
      r.date <= to &&
      Object.entries(filters).every(([k, v]) => !v || r[k] === v),
  );
  const personal = scope.filter((r) => human(r.user)),
    owned = user ? personal.filter((r) => r.user === user) : personal;
  const items = session ? owned.filter((r) => r.session === session) : owned;
  metrics(user ? items : scope);
  coverage(scope, from, to);
  if (el("analysis").open) technical(user ? items : scope);
  el("back").hidden = !user;
  el("back").textContent = session ? "‹ 返回相关会话" : "‹ 返回用户榜";
  el("heading").textContent = session
    ? sessionName(session, user)
    : user
      ? uname(user)
      : "用户排行";
  const sessionCount = new Set(owned.map((r) => r.session)).size;
  el("subtitle").textContent = session
    ? "该用户在此会话的模型用量 · " + session.split("/").pop().slice(-8)
    : user
      ? sessionCount + " 个相关会话 · " + full(sum(owned)) + " Token"
      : "按 Token 用量排序";
  const search = el("search"),
    query = search.value.trim().toLocaleLowerCase();
  search.placeholder = session ? "搜索模型" : user ? "搜索会话" : "搜索用户";
  search.setAttribute("aria-label", search.placeholder);
  const head = el("listhead");
  head.replaceChildren(
    ...[
      session ? "模型" : user ? "相关会话" : "用户",
      session ? "记录" : user ? "模型" : "会话数",
      "Token",
      "",
    ].map((x) => node("span", x)),
  );
  const axis = session ? "model" : user ? "session" : "user";
  let groups = group(items, axis);
  const titleOf = (g) =>
    session
      ? g.id.split(" / ").at(-1)
      : user
        ? sessionName(g.id, user)
        : uname(g.id);
  if (query)
    groups = groups.filter((g) =>
      (titleOf(g) + " " + g.id).toLowerCase().includes(query),
    );
  const pages = Math.max(1, Math.ceil(groups.length / pageSize));
  page = Math.min(page, pages - 1);
  const list = el("list");
  list.replaceChildren();
  for (const [idx, g] of groups
    .slice(page * pageSize, (page + 1) * pageSize)
    .entries()) {
    let sub, mid, action;
    if (session) {
      sub = g.id.split(" / ")[0];
      mid = full(g.rs.reduce((n, r) => n + r.counts[5], 0));
    } else if (user) {
      const kind = snapshot.sessions?.[g.id]?.kind;
      const desc =
        kind === "direct"
          ? "私聊"
          : ["group", "channel"].includes(kind)
            ? "群聊"
            : g.rs[0].workload;
      sub =
        desc +
        " · " +
        g.rs
          .map((r) => r.date)
          .sort()
          .at(-1)
          .slice(5) +
        " · " +
        g.id.split("/").pop().slice(-8);
      mid = full(new Set(g.rs.map((r) => r.model)).size);
      action = () => {
        session = g.id;
        page = 0;
        search.value = "";
        render();
      };
    } else {
      sub = cname(g.rs[0].channel);
      if (!snapshot.names[g.id] || /^(ou_|oc_)/.test(snapshot.names[g.id]))
        sub += " · 姓名待核实";
      mid = full(new Set(g.rs.map((r) => r.session)).size);
      action = () => {
        user = g.id;
        page = 0;
        search.value = "";
        render();
      };
    }
    list.append(
      rowView(g, titleOf(g), sub, mid, action, !user, idx + page * pageSize),
    );
  }
  if (!groups.length) list.append(node("p", "当前条件下没有匹配记录", "empty"));
  el("count").textContent =
    "共 " +
    full(groups.length) +
    (session ? " 个模型" : user ? " 个会话" : " 位用户") +
    " · " +
    (page + 1) +
    " / " +
    pages;
  el("prev").disabled = page === 0;
  el("next").disabled = page + 1 >= pages;
}
function install(data) {
  snapshot = data;
  rows = data.rows.map(
    ([date, channel, user, session, provider, model, ...counts]) => ({
      date,
      channel,
      user,
      session,
      model: provider + " / " + model,
      workload: data.workloads?.[session] || "未知",
      total: counts[4],
      counts,
    }),
  );
  const range = el("range");
  while (range.options.length > 4) range.remove(4);
  for (let t = data.end - 1; day(t) >= day(data.start); t -= 86400)
    range.add(new Option(day(t), day(t)));
  for (const id of ["from", "to"]) {
    const input = el(id);
    input.min = day(data.start);
    input.max = day(data.end - 1);
    if (!input.value || input.value < input.min || input.value > input.max)
      input.value = id === "from" ? input.min : input.max;
  }
  selectFilters();
  el("content").hidden = false;
  render();
}
async function status() {
  try {
    const state = await (await fetch("/api/status")).json();
    if (state.ready && (!snapshot || (busy && !state.busy)))
      install(await (await fetch("/api/usage")).json());
    busy = state.busy;
    el("refresh").disabled = busy;
    const scope = snapshot ? periodText(snapshot) : "";
    el("status").textContent = [scope, busy ? "采集中…" : "", state.error]
      .filter(Boolean)
      .join(" · ");
    if (busy) setTimeout(status, 2000);
  } catch {
    el("status").textContent = "读取失败，请刷新重试。";
    el("refresh").disabled = false;
  }
}
el("range").onchange = () => {
  el("dates").hidden = el("range").value !== "custom";
  resetView();
};
for (const id of ["from", "to"])
  el(id).onchange = () => {
    if (el("from").value > el("to").value)
      el(id === "from" ? "to" : "from").value = el(id).value;
    resetView();
  };
el("prev").onclick = () => {
  page--;
  render();
};
el("next").onclick = () => {
  page++;
  render();
};
el("search").oninput = () => {
  page = 0;
  render();
};
el("back").onclick = () => {
  if (session) session = "";
  else user = "";
  page = 0;
  el("search").value = "";
  render();
};
el("groupby").onchange = render;
el("analysis").ontoggle = render;
el("refresh").onclick = async () => {
  try {
    el("refresh").disabled = true;
    const res = await fetch("/api/refresh", { method: "POST" });
    if (!res.ok) throw Error();
    busy = true;
    await status();
  } catch {
    el("status").textContent = "刷新失败，请重试。";
    el("refresh").disabled = false;
  }
};
status();
