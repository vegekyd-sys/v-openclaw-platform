"use strict";

function unpackUsage(data) {
  const workloads = {},
    nightshift = data.hasNightshift ? {} : null;
  for (const [id, work, card] of data.dictionary) {
    workloads[id] = work;
    if (card) nightshift[id] = card;
  }
  for (const row of data.rows) row[3] = data.dictionary[row[3]][0];
  for (const row of data.unknownReasons) row[2] = data.dictionary[row[2]][0];
  delete data.dictionary;
  return { ...data, workloads, nightshift };
}

async function openPublishedFeed() {
  const message = el("status"),
    button = el("refresh");
  button.textContent = "检查更新";
  if (location.hash)
    history.replaceState(null, "", location.pathname + location.search);
  async function read(path) {
    const res = await fetch(path);
    if (!res.ok) throw Error("Snapshot unavailable");
    return new Response(
      res.body.pipeThrough(new DecompressionStream("gzip")),
    ).json();
  }
  let active = false,
    lastCheck = 0,
    complete = "";
  async function check() {
    if (active) return;
    active = true;
    lastCheck = Date.now();
    button.disabled = true;
    try {
      const home = await read("/usage/home.gz");
      if (!/^[0-9]+-[0-9a-f]{16}$/.test(home.version))
        throw Error("Invalid version");
      if (complete !== home.version) {
        install(home);
        message.textContent = periodText(home);
        await new Promise((done) => setTimeout(done, 0));
        const full = await read("/usage/datasets/" + home.version + ".gz");
        if (full.version !== home.version || full.end !== home.end)
          throw Error("Snapshot changed");
        install(unpackUsage(full));
        complete = home.version;
      }
      message.textContent = periodText(home);
    } catch {
      message.textContent = snapshot
        ? periodText(snapshot) + " · 更新未完成，可点击重试"
        : "读取失败，请点击检查更新重试。";
    } finally {
      active = false;
      button.disabled = false;
    }
  }
  button.onclick = check;
  const onReturn = () => {
    if (!document.hidden && Date.now() - lastCheck > 60000) check();
  };
  document.addEventListener("visibilitychange", onReturn);
  window.addEventListener("pageshow", onReturn);
  setInterval(onReturn, 300000);
  await check();
}
openPublishedFeed().catch(() => {
  el("status").textContent = "无法载入用量数据，请刷新页面重试。";
});
