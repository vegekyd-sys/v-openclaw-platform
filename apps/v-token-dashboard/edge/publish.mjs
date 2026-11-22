import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  copyFileSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { gzipSync, gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const app = dirname(here);

export function partition(data, version) {
  const peopleRows = data.rows.filter(
    (row) => row[2] !== "未归属" && row[2] !== "系统任务",
  );
  const peopleIds = new Set(peopleRows.map((row) => row[3]));
  const entries = (key) =>
    Object.fromEntries(
      Object.entries(data[key] || {}).filter(([id]) => peopleIds.has(id)),
    );
  const home = {
    start: data.start,
    end: data.end,
    stats: data.stats,
    names: data.names,
    sessions: entries("sessions"),
    workloads: entries("workloads"),
    rows: peopleRows,
    peopleOnly: true,
    version,
  };
  // A session reference occurs in up to four maps and many rows. Transmit it once.
  const ids = [...new Set(data.rows.map((row) => row[3]))],
    index = new Map(ids.map((v, i) => [v, i]));
  const encode = (source, field) =>
    source.map((row) => {
      const copy = [...row];
      copy[field] = index.get(row[field]);
      if (copy[field] === undefined) throw Error("Missing session reference");
      return copy;
    });
  const cards = new Map();
  for (const card of Object.values(data.nightshift || {}))
    if (!cards.has(card)) cards.set(card, cards.size + 1);
  const full = {
    start: data.start,
    end: data.end,
    stats: data.stats,
    names: data.names,
    sessions: data.sessions,
    version,
    hasNightshift: data.nightshift != null,
    dictionary: ids.map((id) => [
      id,
      data.workloads?.[id] || "",
      cards.get(data.nightshift?.[id]) || 0,
    ]),
    rows: encode(data.rows, 3),
    unknownReasons: encode(data.unknownReasons || [], 2),
  };
  return { home, full };
}

// Keep joins stable across refreshes without publishing transport IDs or free-text titles.
export function publicUsage(data, salt) {
  const users = new Map(),
    sessions = new Map();
  const alias = (kind, id) =>
    createHmac("sha256", salt)
      .update(kind)
      .update("\0")
      .update(id)
      .digest("hex")
      .slice(0, 24);
  const names = {},
    labels = {},
    workloads = {},
    nightshift = {};
  for (const row of data.rows) {
    const [, , user, session] = row;
    if (user !== "系统任务" && user !== "未归属" && !users.has(user)) {
      const [channel] = JSON.parse(user);
      const key = JSON.stringify([channel, "", alias("user", user)]);
      users.set(user, key);
      const name = data.names[user];
      if (name && !/(?:ou_|oc_|om_)|@|^\+?[\d -]{7,}$/i.test(name))
        names[key] = name;
    }
    if (!sessions.has(session)) {
      const id = alias("session", session);
      sessions.set(session, id);
      if (data.sessions?.[session])
        labels[id] = { kind: data.sessions[session].kind };
      workloads[id] = data.workloads?.[session] || "";
      if (data.nightshift?.[session]) nightshift[id] = data.nightshift[session];
    }
  }
  return {
    start: data.start,
    end: data.end,
    stats: data.stats,
    names,
    sessions: labels,
    workloads,
    nightshift: data.nightshift == null ? null : nightshift,
    rows: data.rows.map(([day, channel, user, session, ...usage]) => [
      day,
      channel,
      users.get(user) || user,
      sessions.get(session),
      ...usage,
    ]),
    unknownReasons: (data.unknownReasons || []).map(
      ([day, channel, session, ...rest]) => [
        day,
        channel,
        sessions.get(session),
        ...rest,
      ],
    ),
  };
}

function readSalt(state) {
  const path = join(state, "public-ids.key");
  try {
    writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const salt = readFileSync(path);
  if (salt.length !== 32) throw Error("Invalid public ID salt");
  return salt;
}

function assets(state) {
  const dir = join(here, "public");
  mkdirSync(dir, { recursive: true });
  for (const name of ["ui.js", "public.js", "style.css"])
    copyFileSync(join(app, name), join(dir, name));
  copyFileSync(join(state, "v-brand.webp"), join(dir, "v-brand.webp"));
  const html = readFileSync(join(app, "index.html"), "utf8")
    .replace('<html lang="zh-CN">', '<html lang="zh-CN" data-feed="published">')
    .replace(
      "</head>",
      '<link rel="preload" href="/usage/home.gz" as="fetch" crossorigin="anonymous"><script defer src="/public.js"></script></head>',
    );
  writeFileSync(join(dir, "index.html"), html);
}

function publish(state) {
  const raw = readFileSync(join(state, "snapshot.json.gz"));
  const salt = readSalt(state);
  const data = JSON.parse(gunzipSync(raw));
  if (!data.rows?.length || !Number.isInteger(data.end) || !data.nightshift)
    throw Error("Incomplete source snapshot");
  const version =
    data.end +
    "-" +
    createHash("sha256").update(salt).update(raw).digest("hex").slice(0, 16);
  const { home, full } = partition(publicUsage(data, salt), version);
  const tmp = mkdtempSync(join(tmpdir(), "v-usage-publish-"));
  try {
    // The small entry point is the commit marker. Readers keep the previous pair if upload fails.
    for (const [name, payload] of [
      ["usage/datasets/" + version + ".gz", full],
      ["usage/home.gz", home],
    ]) {
      const file = join(tmp, "public.gz");
      writeFileSync(file, gzipSync(JSON.stringify(payload)), { mode: 0o600 });
      execFileSync(
        process.env.WRANGLER || "wrangler",
        [
          "r2",
          "object",
          "put",
          "v-token-usage-private/" + name,
          "--remote",
          "--file",
          file,
          "--content-type",
          "application/octet-stream",
        ],
        { stdio: "inherit", cwd: here, timeout: 180000 },
      );
    }
    console.log(
      "Published collection ending",
      new Date(data.end * 1000).toISOString(),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, dir] = process.argv.slice(2);
  if (!dir || !["assets", "publish"].includes(command))
    throw Error("Expected assets|publish STATE_DIRECTORY");
  (command === "assets" ? assets : publish)(resolve(dir));
}
