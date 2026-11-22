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
const pageSize = 10;
let distPage = 0,
  trendDay = "",
  periodDays = 7,
  nightView = false;

function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function periodText(data) {
  return "数据截至 " + clock.format(data.end * 1000) + "（北京时间）";
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
  return [el("from").value, el("to").value];
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
  distPage = 0;
  trendDay = "";
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
function rowView(item, title, sub, mid, action, avatar, i, denominator) {
  const line = node(action ? "button" : "div", undefined, "grid item"),
    name = node("span", undefined, "nameblock");
  if (avatar) {
    const first = [...title][0] || "·";
    name.append(node("span", first, "avatar tone" + (i % 5)));
  }
  const text = node("span", undefined, "identity");
  text.append(node("strong", title), node("small", sub));
  name.append(text);
  const amount = node("span", compact(item.total), "amount");
  amount.append(node("small", percent(item.total, denominator), "row-share"));
  const track = node("span", undefined, "rank-track");
  track.setAttribute("aria-hidden", "true");
  const fill = node("i");
  fill.style.width = (denominator ? (100 * item.total) / denominator : 0) + "%";
  track.append(fill);
  amount.append(track);
  line.append(
    name,
    node("span", mid),
    amount,
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
  const values = nightView
    ? [
        [
          "夜班 Token",
          snapshot.nightshift ? compact(sum(items)) : "待核对",
          sum(items),
        ],
        ["执行卡", full(new Set(items.map((r) => r.card)).size)],
        ["执行会话", full(new Set(items.map((r) => r.session)).size)],
      ]
    : user
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
    if (exact !== undefined) {
      cell.title = full(exact) + " Token";
      const detail = node("details", undefined, "exact-total");
      const label = node("summary");
      label.append(node("span", title), node("strong", value));
      label.setAttribute("aria-label", title + "，查看精确值");
      detail.append(label, node("output", cell.title));
      cell.append(detail);
    } else {
      cell.append(node("span", title), node("strong", value));
    }
    host.append(cell);
  }
}
function percent(value, total) {
  if (!total) return "—";
  if (value === 0) return "0%";
  if (value === total) return "100%";
  const p = (100 * value) / total;
  if (p < 0.1) return "<0.1%";
  if (p > 99.9) return ">99.9%";
  return p.toFixed(1) + "%";
}
function rankBar(host, label, value, total) {
  const row = node("div", undefined, "bar-row");
  const name = node("span", label, "bar-label");
  name.title = label;
  const amount = node("span", compact(value), "bar-amount");
  amount.title = full(value) + " Token";
  const track = node("div", undefined, "bar-track");
  const fill = node("div", undefined, "bar-fill");
  fill.style.width = (total ? (100 * value) / total : 0) + "%";
  track.append(fill);
  row.append(name, amount, node("b", percent(value, total)), track);
  host.append(row);
}
function coverage(all, from, to) {
  const total = sum(all),
    people = sum(all.filter((r) => human(r.user)));
  const unknown = sum(all.filter((r) => r.user === "未归属" && !r.card));
  const parts = [
    ["个人", people],
    ["系统任务", total - people - unknown],
    ["未归属", unknown],
  ];
  const host = el("coverage"),
    stack = node("div", undefined, "stack"),
    legend = node("div", undefined, "legend");
  stack.setAttribute("aria-hidden", "true");
  parts.forEach(([label, value], index) => {
    const slice = node("span", undefined, "category-" + index);
    slice.style.width = (total ? (100 * value) / total : 0) + "%";
    stack.append(slice);
    const line = node("div", undefined, "legend-row");
    line.append(
      node("i", undefined, "dot category-" + index),
      node("span", label),
      node("span", compact(value), "bar-amount"),
      node("b", percent(value, total)),
    );
    line.title = full(value) + " Token";
    legend.append(line);
  });
  const headline = node("div", undefined, "chart-total");
  headline.append(node("strong", compact(total)), node("span", "Token 总量"));
  host.replaceChildren(headline, stack, legend);
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
      snapshot.nightshift?.[sid] ||
      date < from ||
      date > to ||
      (filters.channel && ch !== filters.channel) ||
      (filters.model && provider + " / " + model !== filters.model) ||
      (filters.workload && snapshot.workloads?.[sid] !== filters.workload)
    )
      continue;
    reasons.set(reason, (reasons.get(reason) || 0) + n);
  }
  el("why").hidden = !unknown;
  const reasonsHost = el("reasons");
  reasonsHost.replaceChildren();
  reasonsHost.append(node("p", "占所选范围未归属 Token 的比例", "scope"));
  if (!reasons.size) reasonsHost.append(node("p", "此快照未记录原因。"));
  for (const [name, value] of [...reasons].sort((a, b) => b[1] - a[1]))
    rankBar(reasonsHost, name, value, unknown);
}
function technical(items) {
  const host = el("technical");
  host.replaceChildren();
  const total = sum(items),
    axis = el("groupby").value;
  let groups;
  if (axis === "token") {
    groups = ["普通输入", "缓存读取", "缓存写入", "输出"]
      .map((id, i) => ({
        id,
        total: items.reduce((n, r) => n + r.counts[i], 0),
      }))
      .sort((a, b) => b.total - a.total);
  } else {
    groups = group(items, axis);
  }
  el("dist-scope").textContent =
    (nightView
      ? "夜班执行"
      : session
        ? "该用户在本会话"
        : user
          ? "该用户"
          : "全平台") +
    " · " +
    compact(total) +
    " Token";
  const size = 5,
    pages = Math.max(1, Math.ceil(groups.length / size));
  distPage = Math.min(distPage, pages - 1);
  for (const g of groups.slice(distPage * size, (distPage + 1) * size)) {
    const label =
      axis === "channel"
        ? cname(g.id)
        : axis === "session"
          ? (nightView ? "执行会话" : sessionName(g.id, user)) +
            " · " +
            g.id.slice(-8)
          : g.id;
    rankBar(host, label, g.total, total);
  }
  if (!total) host.replaceChildren(node("p", "所选范围暂无用量", "empty"));
  el("dist-pages").hidden = !total || pages === 1;
  el("dist-count").textContent =
    groups.length + " 项 · " + (distPage + 1) + " / " + pages;
  el("dist-prev").disabled = distPage === 0;
  el("dist-next").disabled = distPage + 1 >= pages;
}
function dailyTotals(items) {
  const totals = new Map();
  for (const r of items)
    totals.set(r.date, (totals.get(r.date) || 0) + r.total);
  return totals;
}
function trend(items, from, to, platform) {
  const totals = dailyTotals(items);
  const compare = nightView && Boolean(snapshot.nightshift);
  const platformTotals = compare ? dailyTotals(platform) : totals;
  const host = el("trend");
  el("trend-key").hidden = !compare;
  el("trend-title").textContent = compare ? "每日夜班占比" : "每日用量";
  el("step-day").hidden = !compare || from === to;
  host.replaceChildren();
  el("trend-scope").textContent = nightView
    ? "夜班执行"
    : session
      ? "该用户在本会话"
      : user
        ? "该用户"
        : "已归属用户";
  const points = [];
  for (
    let ms = Date.parse(from + "T00:00:00Z");
    ms <= Date.parse(to + "T00:00:00Z");
    ms += 86400000
  ) {
    const date = new Date(ms).toISOString().slice(0, 10);
    points.push([date, totals.get(date) || 0, platformTotals.get(date) || 0]);
  }
  if (!points.length) return;
  const max = points.reduce((n, p) => Math.max(n, p[2]), 0);
  const peak = points.reduce((best, p) => p[1] > best[1] ? p : best)[0];
  if (!points.some((p) => p[0] === trendDay)) trendDay = peak;
  function highlight(index) {
    const [date, value, platformValue] = points[index];
    trendDay = date;
    for (const b of host.children)
      b.setAttribute("aria-pressed", String(b.dataset.day === date));
    const output = el("trend-value");
    if (compare) {
      output.replaceChildren(
        node("strong", date + " · 夜班占比 " + percent(value, platformValue)),
        node("span", "夜班 " + full(value) + " / 平台 " + full(platformValue) + " Token"),
      );
      el("day-prev").disabled = index === 0;
      el("day-next").disabled = index === points.length - 1;
      el("day-prev").onclick = () => highlight(index - 1);
      el("day-next").onclick = () => highlight(index + 1);
    } else {
      output.textContent = date + "　" + full(value) + " Token";
    }
  }
  host.classList.toggle("monthly", points.length > 12);
  for (const [idx, [date, value, platformValue]] of points.entries()) {
    const button = node("button", undefined, "day-bar");
    button.dataset.day = date;
    button.setAttribute("aria-label", compare
      ? date + "，夜班 " + full(value) + "，平台 " + full(platformValue) + " Token"
      : date + "，" + full(value) + " Token");
    const plot = node("span", undefined, "plot"),
      bar = node("i");
    bar.style.height = (max ? (100 * value) / max : 0) + "%";
    if (compare) {
      const rest = node("i", undefined, "other-usage");
      rest.style.height = (max ? (100 * (platformValue - value)) / max : 0) + "%";
      plot.append(rest);
    }
    plot.append(bar);
    button.append(
      plot,
      node("span", date.slice(5).replace("-", "/"), "day-label"),
    );
    if (
      points.length > 12 &&
      idx !== 0 &&
      idx !== points.length - 1 &&
      idx % 7 !== 0
    )
      button.lastElementChild.style.visibility = "hidden";
    if (
      points.length > 12 &&
      idx > points.length - 4 &&
      idx !== points.length - 1
    )
      button.lastElementChild.style.visibility = "hidden";
    button.onclick = () => highlight(idx);
    host.append(button);
  }
  highlight(points.findIndex(([date]) => date === trendDay));
}

function render() {
  if (!snapshot) return;
  const [from, to] = dateScope();
  const scope = rows.filter(
    (r) =>
      r.date >= from &&
      r.date <= to &&
      (nightView ||
        Object.entries(filters).every(([k, v]) => !v || r[k] === v)),
  );
  const personal = scope.filter((r) => human(r.user)),
    owned = user ? personal.filter((r) => r.user === user) : personal;
  const items = session ? owned.filter((r) => r.session === session) : owned;
  const nights = nightView ? scope.filter((r) => r.card) : [];
  const selected = nightView ? nights : items;
  metrics(nightView ? nights : user ? items : scope);
  if (!nightView) coverage(scope, from, to);
  technical(nightView ? nights : user ? items : scope);
  trend(selected, from, to, scope);
  el("range-caption").textContent =
    from.slice(5).replace("-", ".") + " – " + to.slice(5).replace("-", ".");
  el("calendar")
    .querySelector("summary")
    .setAttribute("aria-current", String(periodDays === null));
  const denominator = sum(items);
  for (const button of el("periods").children)
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.days) === periodDays),
    );
  el("people").hidden = nightView;
  el("attribution").hidden = nightView;
  el("night-note").hidden = !nightView;
  el("content").classList.toggle("night", nightView);
  if (nightView) {
    if (snapshot.nightshift) {
      const share = percent(sum(nights), sum(scope));
      el("metrics").firstChild.append(node("small", "占平台 Token " + share));
    } else {
      el("metrics").replaceChildren(
        node("p", "快照缺少夜班派工数据，请刷新后查看。"),
      );
      el("trend").replaceChildren();
      el("trend-value").textContent = "";
      el("technical").replaceChildren();
      el("dist-scope").textContent = "等待派工数据";
    }
    return;
  }
  el("back").hidden = !user;
  el("back").textContent = session ? "‹ 返回相关会话" : "‹ 返回用户榜";
  el("heading").textContent = session
    ? sessionName(session, user)
    : user
      ? uname(user)
      : "用户排行";
  const sessionCount = new Set(owned.map((r) => r.session)).size;
  el("subtitle").textContent = session
    ? "占该用户在本会话的 Token · " + session.split("/").pop().slice(-8)
    : user
      ? sessionCount +
        " 个相关会话 · " +
        full(sum(owned)) +
        " Token · 占个人用量"
      : "占已归属用户的 Token";
  const search = el("search"),
    query = search.value.trim().toLocaleLowerCase();
  search.placeholder = session ? "搜索模型" : user ? "搜索会话" : "搜索用户";
  search.setAttribute("aria-label", search.placeholder);
  const head = el("listhead");
  head.replaceChildren(
    ...[
      session ? "模型" : user ? "相关会话" : "用户",
      session ? "记录" : user ? "模型" : "会话数",
      "Token / 占比",
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
        distPage = 0;
        trendDay = "";
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
        distPage = 0;
        trendDay = "";
        user = g.id;
        page = 0;
        search.value = "";
        render();
      };
    }
    list.append(
      rowView(
        g,
        titleOf(g),
        sub,
        mid,
        action,
        !user,
        idx + page * pageSize,
        denominator,
      ),
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
      card: data.nightshift?.[session],
      workload: data.workloads?.[session] || "未知",
      total: counts[4],
      counts,
    }),
  );
  const first = day(data.start),
    last = day(data.end - 1);
  for (const id of ["from", "to"]) {
    const input = el(id);
    input.min = first;
    input.max = last;
    if (!input.value || input.value < first || input.value > last)
      input.value = id === "from" ? first : last;
  }
  const available = 1 + (Date.parse(last) - Date.parse(first)) / 86400000;
  for (const button of el("periods").children)
    button.disabled = Number(button.dataset.days) > available;
  if (periodDays !== null) {
    if (periodDays > available) periodDays = available >= 7 ? 7 : 1;
    applyPeriod(periodDays);
  }
  const stat = data.stats || {};
  el("audit").textContent =
    "快照核对 " +
    (stat.agentDatabases || 0) +
    " 个 Agent 库、替换 " +
    full(stat.replacedMirrors || 0) +
    " 条镜像；缺失日志 " +
    full(stat.missingRollouts || 0) +
    " 个，零值或缺用量消息 " +
    full(stat.zeroOrMissing || 0) +
    " 条，分项与上报总量不一致 " +
    full(stat.componentMismatch || 0) +
    " 条。";
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
function applyPeriod(days) {
  const start = el("from"),
    end = el("to");
  end.value = end.max;
  const first = days
    ? new Date(Date.parse(end.max + "T00:00:00Z") - (days - 1) * 86400000)
        .toISOString()
        .slice(0, 10)
    : start.min;
  start.value = first < start.min ? start.min : first;
  periodDays = days;
}
function changedScope() {
  page = 0;
  distPage = 0;
  trendDay = "";
  render();
}
const distributionByView = { people: "channel", night: "model" };
for (const tab of el("views").children) {
  tab.onclick = () => {
    const nextNight = tab.dataset.view === "night";
    if (nextNight === nightView) return;
    distributionByView[nightView ? "night" : "people"] = el("groupby").value;
    nightView = nextNight;
    el("groupby").value = distributionByView[tab.dataset.view];
    for (const sibling of el("views").children)
      sibling.setAttribute("aria-pressed", String(tab === sibling));
    changedScope();
  };
}
for (const button of el("periods").children)
  button.onclick = () => {
    el("calendar").open = false;
    applyPeriod(Number(button.dataset.days));
    changedScope();
  };
for (const id of ["from", "to"])
  el(id).onchange = () => {
    const input = el(id);
    if (!input.value) input.value = id === "from" ? input.min : input.max;
    input.value =
      input.value < input.min
        ? input.min
        : input.value > input.max
          ? input.max
          : input.value;
    if (el("from").value > el("to").value)
      el(id === "from" ? "to" : "from").value = input.value;
    periodDays = null;
    changedScope();
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
el("groupby").onchange = () => {
  distPage = 0;
  render();
};
el("dist-prev").onclick = () => {
  distPage--;
  render();
};
el("dist-next").onclick = () => {
  distPage++;
  render();
};
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
