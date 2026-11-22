"use strict";
const el = id => document.getElementById(id);
const dimensions = {channel:"渠道", user:"用户", model:"模型", session:"会话", workload:"任务类型"};
const nextAxis = {channel:"user", user:"session", session:"model", model:"session",workload:"channel"};
const numbers = new Intl.NumberFormat("zh-CN");
const clock = new Intl.DateTimeFormat("zh-CN", {timeZone:"Asia/Shanghai", month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const day = seconds => new Date((seconds + 28800) * 1000).toISOString().slice(0,10);
const pageSize = 25;
let snapshot, rows = [], axis = "channel", page = 0, filters = {}, busy = false;

function tag(name, text) {
  const node = document.createElement(name);
  if (text !== undefined) node.textContent = text;
  return node;
}
function label(key, value) {
  if (key === "model") return JSON.parse(value).join(" / ");
  if (key === "user" && snapshot.names[value]) {
    const [channel, account, id] = JSON.parse(value);
    return [snapshot.names[value], channel, account, id].filter((v,i,a) => v && a.indexOf(v) === i).join(" · ");
  }
  return value;
}
function dateRows() {
  const mode = el("range").value;
  if (mode === "custom") return rows.filter(r => r.date >= el("from").value && r.date <= el("to").value);
  const selected = mode === "today" ? day(Date.now()/1000) : mode === "yesterday" ? day(Date.now()/1000 - 86400) : mode;
  return mode === "all" ? rows : rows.filter(r => r.date === selected);
}
function matches(row, except) {
  return Object.entries(filters).every(([k,v]) => k === except || !v || row[k] === v);
}
function refreshFilters(base) {
  const strip = el("filters");
  strip.replaceChildren();
  for (const [key, name] of Object.entries(dimensions)) {
    const field = tag("label",name), select = tag("select");
    select.add(new Option("全部",""));
    const values = new Set(base.filter(r => matches(r,key)).map(r => r[key]));
    if (filters[key]) values.add(filters[key]);
    for (const [value,title] of [...values].map(v => [v,label(key,v)]).sort((a,b) => a[1].localeCompare(b[1]))) {
      select.add(new Option(title,value));
    }
    select.value = filters[key] || "";
    select.onchange = () => { filters[key] = select.value; page = 0; render(); };
    field.append(select); strip.append(field);
  }
  const reset = tag("button","重置筛选");
  reset.onclick = () => { filters = {}; axis = "channel"; page = 0; render(); };
  strip.append(reset);
}

function render() {
  if (!snapshot) return;
  const base = dateRows(), selected = base.filter(r => matches(r));
  const totals = [0,0,0,0,0,0], groups = new Map(), sessions = new Set();
  const users = new Set(), models = new Set();
  let unknown = 0, system = 0;
  for (const row of selected) {
    sessions.add(row.session);
    models.add(row.model);
    if (!["未归属","系统任务"].includes(row.user)) users.add(row.user);
    const values = groups.get(row[axis]) || [0,0,0,0,0,0];
    row.counts.forEach((v,i) => { totals[i] += v; values[i] += v; });
    groups.set(row[axis],values);
    if (row.user === "未归属") unknown += row.counts[4];
    if (row.user === "系统任务") system += row.counts[4];
  }
  refreshFilters(base);
  const summary = el("summary");
  summary.replaceChildren();
  for (const [title,value] of [["总 Token 用量",totals[4]],["普通输入",totals[0]],["缓存读取",totals[1]],["缓存写入",totals[2]],["输出",totals[3]]]) {
    const box = tag("div"); box.append(tag("span",title),tag("strong",numbers.format(value))); summary.append(box);
  }
  el("axis").textContent = dimensions[axis];
  for (const button of el("tabs").children) button.setAttribute("aria-pressed",String(button.dataset.axis === axis));
  el("context").textContent = `${numbers.format(totals[5])} 条用量记录 · ${numbers.format(sessions.size)} 个会话 · ${users.size} 位可识别用户 · ${models.size} 个模型 · 未归属用户 ${numbers.format(unknown)} Token · 系统任务 ${numbers.format(system)} Token`;
  const sorted = [...groups].sort((a,b) => b[1][4]-a[1][4] || a[0].localeCompare(b[0]));
  const pages = Math.max(1,Math.ceil(sorted.length/pageSize));
  page = Math.min(page,pages-1);
  const body = document.querySelector("tbody");
  body.replaceChildren();
  for (const [key, counts] of sorted.slice(page*pageSize,(page+1)*pageSize)) {
    const row = tag("tr"), name = tag("td"), link = tag("button",label(axis,key));
    link.title = label(axis,key);
    link.onclick = () => { filters[axis] = key; axis = nextAxis[axis]; page = 0; render(); };
    name.append(link); row.append(name);
    counts.slice(0,5).forEach(n => row.append(tag("td",numbers.format(n))));
    const share = totals[4] ? counts[4] / totals[4] : 0, meter = tag("progress");
    meter.value = share; meter.setAttribute("aria-label","用量占比");
    const cell = tag("td"); cell.append(meter,share > 0 && share < 0.001 ? "<0.1%" : (100*share).toFixed(1)+"%"); row.append(cell); body.append(row);
  }
  if (!sorted.length) {
    const row = tag("tr"), cell = tag("td","当前筛选范围内没有用量记录"); cell.colSpan = 7;
    row.append(cell); body.append(row);
  }
  el("prev").disabled = page === 0; el("next").disabled = page+1 >= pages;
  el("pagination").textContent = `共 ${sorted.length} 项 · 第 ${page+1} / ${pages} 页`;
}
function install(data) {
  snapshot = data;
  rows = data.rows.map(([date,channel,user,session,provider,model,...counts]) => ({
    date,channel,user,session,workload:data.workloads?.[session] || "未知",model:JSON.stringify([provider,model]),counts
  }));
  const range = el("range"), current = range.value;
  for (const id of ["from","to"]) {
    const input = el(id);
    input.min = day(data.start); input.max = day(data.end-1);
    if (!input.value || input.value < input.min || input.value > input.max) input.value = id === "from" ? input.min : input.max;
  }
  while (range.options.length > 4) range.remove(4);
  for (let t = data.end-1; day(t) >= day(data.start); t -= 86400) range.add(new Option(day(t),day(t)));
  if ([...range.options].some(o => o.value === current)) range.value = current;
  const s = data.stats;
  el("quality").textContent = `扫描 ${s.agentDatabases} 个 Agent 库、${s.rollouts||0} 个原生文件。原生响应 ${s.nativeResponses||0} 条、旧格式增量 ${s.nativeLegacy||0} 条、会话用量 ${s.transcriptResponses||0} 条；替换镜像 ${s.replacedMirrors||0} 条。通过启动事件追溯 ${s.attributedChildren||0} 个子会话。零值或缺用量消息 ${s.zeroOrMissing||0} 条，索引指向缺失文件 ${s.missingRollouts||0} 个，窗口内未读取的归档版本 ${s.archiveVersions||0} 个，未完成日志行 ${s.partialLines||0} 条。分项与报告总数不一致 ${s.componentMismatch||0} 条，以报告总数为准。`;
  el("content").hidden = false; render();
}
async function status() {
  try {
    const resp = await fetch("/api/status");
    if (!resp.ok) throw Error();
    const state = await resp.json();
    if (state.ready && (!snapshot || (busy && !state.busy))) {
      const response = await fetch("/api/usage");
      if (!response.ok) throw Error();
      install(await response.json());
    }
    busy = state.busy;
    el("refresh").disabled = busy;
    const scope = snapshot ? `${day(snapshot.start)} 至 ${clock.format(snapshot.end*1000)}（北京时间）` : "";
    el("status").textContent = [scope, busy ? "正在从 V 采集…" : "",state.error].filter(Boolean).join(" · ");
    if (busy) setTimeout(status,2000);
  } catch { el("status").textContent = "无法读取看板数据，请刷新页面重试。"; el("refresh").disabled = false; }
}
for (const [key,name] of Object.entries(dimensions)) {
  const button = tag("button",name); button.dataset.axis = key;
  button.onclick = () => {axis = key; page = 0; render();}; el("tabs").append(button);
}
el("prev").onclick = () => {page--;render();}; el("next").onclick = () => {page++;render();};
el("range").onchange = () => {el("dates").hidden = el("range").value !== "custom"; page = 0; render();};
for (const id of ["from","to"]) el(id).onchange = () => {
  if (el("from").value > el("to").value) el(id === "from" ? "to" : "from").value = el(id).value;
  page = 0; render();
};
el("refresh").onclick = async () => {
  el("refresh").disabled = true;
  try {
    const response = await fetch("/api/refresh",{method:"POST"});
    if (!response.ok) throw Error();
    busy = true; await status();
  } catch { el("status").textContent = "刷新请求失败，请稍后重试。"; el("refresh").disabled = false; }
};
status();
