// Every string from the server goes through textContent. The recap is built from chat
// that anyone in the group can write, so it never becomes markup.
const raw = document.body.dataset.config;
const notice = document.getElementById("notice");
const content = document.getElementById("content");
const bar = document.getElementById("bar");
const refresh = document.getElementById("refresh");

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

function section(title, items, build, className) {
  if (!items.length) return [];
  const list = el("ul", undefined, className);
  for (const item of items) list.append(build(item));
  return [el("h2", title), list];
}

// The same zone the timeline is written in, wherever the reader's phone happens to be.
const clock = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(5, 16).replace("T", " ");

function render(data) {
  const { recap } = data;
  const facts = [`基于最近 ${data.messages} 条消息`, `截至 ${clock(data.lastAt ?? data.generatedAt)}`];
  if (data.skipped) facts.push(`跳过 ${data.skipped} 条过大的内容`);
  if (data.running) facts.push("V 正在回复，这份回顾可能马上过时");
  if (data.stale) facts.push("生成繁忙，这是上一份");
  const parts = [el("div", facts.join(" · "), "meta"), el("h1", recap.status)];
  parts.push(...section("需要你", recap.needs, (item) => {
    const row = el("li");
    if (item.who) row.append(el("b", item.who === data.viewer ? "你" : item.who), "：");
    row.append(item.what);
    return row;
  }, "need"));
  parts.push(...section("进展", recap.progress, (item) => el("li", `${item.state === "done" ? "☑️" : "▶️"} ${item.text}`, item.state === "done" ? "done" : "")));
  parts.push(...section("V 接下来", recap.next, (item) => el("li", item)));
  parts.push(...section("风险", recap.risks, (item) => el("li", `⚠️ ${item}`, "risk")));
  if (recap.timeline.length) {
    const details = el("details");
    details.append(el("summary", `时间线（${recap.timeline.length} 段）`));
    const list = el("ul");
    for (const item of recap.timeline) {
      const row = el("li");
      row.append(el("time", item.when), el("span", item.text));
      list.append(row);
    }
    details.append(list);
    parts.push(details);
  }
  content.replaceChildren(...parts);
  content.hidden = false;
  notice.textContent = "";
}

async function load(config, force) {
  refresh.disabled = true;
  if (content.hidden) notice.textContent = "正在读这个群最近的聊天，大约十几秒……";
  const failed = (text) => { if (content.hidden) notice.textContent = text; };
  try {
    const res = await fetch(`${config.api}${force ? "&force=1" : ""}`, { credentials: "same-origin", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return location.reload();
    if (res.status === 403) return failed("你不在这个群里，看不了它的回顾。");
    if (res.status === 429) return failed("现在生成的人有点多，过一会儿点刷新。");
    if (!res.ok) return failed("这次没生成出来，点下面的刷新再试一次。");
    if (data.state === "empty") return failed("这个群还没有和 V 聊过，暂时没有可回顾的内容。");
    render(data);
  } catch {
    failed("网络断了，点下面的刷新再试一次。");
  } finally {
    refresh.disabled = false;
  }
}

if (raw) {
  const config = JSON.parse(atob(raw.replaceAll("-", "+").replaceAll("_", "/")));
  document.getElementById("back").href = config.back;
  refresh.addEventListener("click", () => load(config, true));
  bar.hidden = false;
  load(config, false);
}
