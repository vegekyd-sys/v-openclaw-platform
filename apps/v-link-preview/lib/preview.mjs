// Turns a link V produced into what Feishu shows for it. Pure: no I/O, so the
// wording and the states can be tested without a board or a Feishu app.

// Same list as the delivery page (v-nightshift apps/nightshift-dashboard/delivery/manifest.js).
// The manifest URL comes from the message, so nothing else may ever be fetched.
export const TRUSTED_MANIFEST_HOSTS = Object.freeze([
  "cdn.makaron.app",
  "sdyrtztrjgmmpnirswxt.supabase.co",
  "orywxdeppjtwckzqehpr.supabase.co",
]);

const PROJECT_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const NAME_LIMIT = 100;

function trusted(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && TRUSTED_MANIFEST_HOSTS.includes(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
}

// Which of our pages this link is, or null for anything else (a plain link).
export function parseLink(value, publicBaseUrl) {
  let url;
  let base;
  try {
    url = new URL(String(value));
    base = new URL(publicBaseUrl);
  } catch {
    return null;
  }
  if (url.origin !== base.origin) return null;
  const prefix = base.pathname.replace(/\/+$/u, "");
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return null;
  const page = url.pathname.slice(prefix.length).replace(/^\/+|\/+$/gu, "");
  if (page === "") {
    const projectId = url.searchParams.get("project");
    return projectId && PROJECT_ID.test(projectId) ? { kind: "project", key: `project:${projectId}`, projectId, url: url.href } : null;
  }
  if (page === "deliver") {
    const manifest = trusted(url.searchParams.get("m"));
    return manifest ? { kind: "delivery", key: `delivery:${manifest.href}`, manifestUrl: manifest.href, url: url.href } : null;
  }
  return null;
}

// The latest attempt of each piece of work, across project and per-item stages.
function latestRuns(project) {
  const latest = new Map();
  for (const run of [...(project.stageRuns ?? []), ...(project.contentItemRuns ?? [])]) {
    const key = `${run.contentItemId ?? ""}\u0000${run.stageId}`;
    const current = latest.get(key);
    if (!current || Number(run.attempt ?? 0) >= Number(current.attempt ?? 0)) latest.set(key, run);
  }
  return [...latest.values()];
}

export function projectFacts(project, openDecisions) {
  const runs = latestRuns(project);
  const count = (status) => runs.filter((run) => run.status === status).length;
  return {
    name: String(project.name ?? project.id).slice(0, NAME_LIMIT),
    status: project.status,
    items: (project.contentItems ?? []).length || Number(project.inputs?.targetCount) || 0,
    running: count("running"),
    blocked: count("blocked"),
    decisions: openDecisions,
  };
}

function projectState(facts) {
  if (facts.status === "done") return { label: "已交付", color: "green" };
  if (facts.status === "archived") return { label: "已归档", color: "grey" };
  if (facts.status !== "active") return { label: "已暂停", color: "grey" };
  if (facts.decisions > 0) return { label: `需要你处理 ${facts.decisions} 件`, color: "orange" };
  if (facts.blocked > 0) return { label: `卡住 ${facts.blocked} 项`, color: "red" };
  return { label: facts.running > 0 ? "进行中" : "排队中", color: "blue" };
}

function field(label, value) {
  return { is_short: true, text: { tag: "lark_md", content: `**${label}**\n${value}` } };
}

function card(title, color, fields, note, button, url) {
  return {
    type: "raw",
    data: {
      config: { wide_screen_mode: true },
      header: { title: { tag: "plain_text", content: title }, template: color },
      elements: [
        { tag: "div", fields },
        ...(note ? [{ tag: "note", elements: [{ tag: "plain_text", content: note }] }] : []),
        { tag: "action", actions: [{ tag: "button", type: "primary", text: { tag: "plain_text", content: button }, url }] },
      ],
    },
  };
}

function staleNote(ageMs) {
  return ageMs ? `看板暂时读不到，这是 ${Math.max(1, Math.round(ageMs / 60_000))} 分钟前的状态` : null;
}

export function projectPreview(facts, url, ageMs = 0) {
  const state = projectState(facts);
  const fields = [
    field("状态", state.label),
    ...(facts.items ? [field("内容", `${facts.items} 条`)] : []),
    field("在做", String(facts.running)),
    ...(facts.blocked ? [field("卡住", String(facts.blocked))] : []),
  ];
  return {
    inline: { title: `夜班｜${facts.name}｜${state.label}` },
    card: card(facts.name, state.color, fields, staleNote(ageMs), "打开看板", url),
  };
}

function size(bytes) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

// Mirrors what the delivery page itself shows: an item off the trusted hosts is not part of it.
export function deliveryFacts(manifest) {
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.items)) return null;
  const items = manifest.items.filter((item) => trusted(item?.url));
  const bytes = items.map((item) => Number(item.bytes));
  return {
    title: String(manifest.title ?? "").trim().slice(0, NAME_LIMIT) || "交付",
    count: items.length,
    bytes: bytes.length && bytes.every((value) => value > 0) ? bytes.reduce((sum, value) => sum + value, 0) : null,
    deliveredAt: typeof manifest.deliveredAt === "string" ? manifest.deliveredAt.slice(0, 10) : null,
  };
}

export function deliveryPreview(facts, url, ageMs = 0) {
  const fields = [
    field("内容", `${facts.count} 条`),
    ...(facts.bytes ? [field("大小", size(facts.bytes))] : []),
    ...(facts.deliveredAt ? [field("交付日期", facts.deliveredAt)] : []),
  ];
  return {
    inline: { title: `交付｜${facts.title}｜${facts.count} 条` },
    card: card(facts.title, "green", fields, staleNote(ageMs), "打开交付页", url),
  };
}
