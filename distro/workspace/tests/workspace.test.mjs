// node --test distro/workspace/tests/
// The installable V workspace: no V-private content, a review gate that stops on
// unclassified skills, a sync that keeps the distro's own edits, a build and
// render that leave no placeholder, and the Heartbeat / schedule helpers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const WS = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAYLOAD = path.join(WS, "payload");
const lib = await import(path.join(WS, "lib.mjs"));
const { render } = await import(path.join(WS, "render.mjs"));
const { build } = await import(path.join(WS, "build.mjs"));
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `distro-ws-${p}-`));
const grep = (dir, re) => lib.walk(dir).flatMap((rel) => {
  const buf = fs.readFileSync(path.join(dir, rel));
  if (buf.includes(0)) return [];
  return buf.toString("utf8").split("\n").flatMap((line, i) => (re.test(line) ? [`${rel}:${i + 1}`] : []));
});

// ------------------------------------------------------------------ no private content

test("payload passes the leak scan (public shapes + DISTRO_DENY_FILE when set)", () => {
  const hits = lib.scanDir(PAYLOAD, lib.loadDenyFile());
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line} [${h.label}]`), []);
});

for (const [what, re] of [
  ["the owner's name", /\bTianyi\b|天翊|天懿|tianyicai/i],
  ["V's host paths", /\/home\/openclaw\b|\/vercel\/sandbox\b|makaron-openclaw\/\.openclaw-local/],
  ["Feishu ids", /\b(ou|oc|on|om)_[0-9a-f]{20,}\b|\bcli_[0-9a-f]{12,}\b/],
  ["private links", /(feishu\.cn|larksuite\.com)\/(docx|docs|wiki|base|sheets|file|drive|minutes)\/[A-Za-z0-9]|tianyi\.live|versa-ai\.|vegekyd|agentmail\.to/i],
]) {
  test(`no ${what} anywhere in the payload`, () => assert.deepEqual(grep(PAYLOAD, re), []));
}

test("the scanner really fires: planted samples of every shape are caught", () => {
  const dir = tmp("plant");
  const planted = [
    "see /home/openclaw/makaron-openclaw/.openclaw-local/workspace",
    "user ou_0123456789abcdef0123456789abcdef",
    "chat oc_0123456789abcdef0123456789abcdef",
    "app cli_a1b2c3d4e5f6a7b8",
    "doc https://acme.feishu.cn/docx/AbCdEf123",
    "Tianyi said so", "天懿确认", "https://wiki.tianyi.live/x",
    "key sk-abcdefghijklmnopqrstuvwxyz12", "call 13812345678",
    "星擎 客户",
  ];
  fs.writeFileSync(path.join(dir, "a.md"), planted.join("\n"));
  const lines = new Set(lib.scanDir(dir).map((h) => h.line));
  assert.equal(lines.size, planted.length, `caught lines ${[...lines]}`);
  const deny = path.join(dir, "deny.txt");
  fs.writeFileSync(deny, "# private\nSecret Person\n");
  fs.writeFileSync(path.join(dir, "b.md"), "hello secret person\n");
  assert.ok(lib.scanDir(dir, lib.loadDenyFile(deny)).some((h) => h.file === "b.md" && h.label === "private deny list"));
});

test("sanitise rewrites V's paths, ids, names and doc links into neutral text", () => {
  const out = lib.sanitise([
    "cd /home/openclaw/makaron-openclaw/.openclaw-local/workspace && ls /home/openclaw/.openclaw/logs",
    "session agent:makaron:feishu:direct:ou_cb000000000000000000000000000000",
    "Tianyi's call; ask 天懿; https://x.feishu.cn/wiki/AbC123",
    'DEFAULT_REPORT_CHAT_ID = "oc_ff000000000000000000000000000000"',
  ].join("\n"));
  assert.deepEqual(lib.scanText(out), []);
  assert.match(out, /@@WORKSPACE@@ && ls @@STATE_DIR@@\/logs/);
  assert.match(out, /agent:@@AGENT_ID@@:feishu:direct:ou_xxx/);
  assert.match(out, /the owner's call; ask 主人/);
  assert.match(out, /DEFAULT_REPORT_CHAT_ID = ""/);
});

// ------------------------------------------------------------------ placeholders, build, render

test("the payload uses only the declared placeholders", () => {
  const used = new Set();
  for (const rel of lib.walk(PAYLOAD)) {
    const t = fs.readFileSync(path.join(PAYLOAD, rel), "latin1");
    for (const m of t.matchAll(lib.PLACEHOLDER_RE)) used.add(m[1]);
  }
  assert.deepEqual([...used].filter((k) => !(k in lib.PLACEHOLDERS)), []);
  assert.ok(used.has("WORKSPACE") && used.has("AGENT_ID"));
});

test("build + render: no placeholder left, leak-free, manifest records the v-core commit", () => {
  const out = path.join(tmp("build"), "ws");
  const values = { WORKSPACE: "/srv/v/workspace", AGENT_ID: "boss-v", STATE_DIR: "/srv/v/state", TIMEZONE: "Asia/Shanghai" };
  const m = build(out, { values });
  assert.match(m.vCoreCommit, /^[0-9a-f]{40}$/);
  assert.equal(m.files.length, lib.walk(PAYLOAD).length);
  assert.deepEqual(grep(out, /@@[A-Z_]+@@/), []);
  assert.deepEqual(lib.scanDir(out), []);
  assert.match(fs.readFileSync(path.join(out, "scripts/v-schedule.py"), "utf8"), /or "boss-v"/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, "knight.config.json"), "utf8")).workspace, "/srv/v/workspace");
  for (const rel of lib.walk(out)) {
    if (!rel.endsWith(".py")) continue;
    const r = spawnSync("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1]).read())", path.join(out, rel)]);
    assert.equal(r.status, 0, `${rel} does not parse after render: ${r.stderr}`);
  }
});

test("an unrendered build keeps the placeholders and lists them for the installer", () => {
  const out = path.join(tmp("raw"), "ws");
  const m = build(out);
  assert.equal(m.rendered, false);
  assert.deepEqual(Object.keys(m.placeholders).sort(), Object.keys(lib.PLACEHOLDERS).sort());
});

test("render refuses missing values and unknown placeholders", () => {
  const dir = tmp("render");
  fs.writeFileSync(path.join(dir, "a.txt"), "@@WORKSPACE@@ @@AGENT_ID@@\n");
  assert.throws(() => render(dir, { WORKSPACE: "/w" }), /missing value for AGENT_ID/);
  fs.writeFileSync(path.join(dir, "b.txt"), "@@SOMETHING_ELSE@@\n");
  assert.throws(() => render(dir, { WORKSPACE: "/w", AGENT_ID: "a", STATE_DIR: "/s", TIMEZONE: "Asia/Shanghai" }), /SOMETHING_ELSE/);
});

// ------------------------------------------------------------------ files git must carry

test("no payload file is git-ignored (a package built from git objects would silently lose it)", () => {
  // The platform root ignores artifacts/, which once kept the memory-graph library out of every package.
  const files = lib.walk(PAYLOAD).map((rel) => path.join("distro/workspace/payload", rel));
  const r = spawnSync("git", ["-C", path.resolve(WS, "../.."), "check-ignore", "--stdin", "-v"], { input: files.join("\n"), encoding: "utf8" });
  assert.equal(r.stdout.trim(), "", `ignored by git:\n${r.stdout}`);
});

test("memory graph: the vendored library ships and memory-graph.py builds the page from a built workspace", () => {
  assert.ok(fs.statSync(path.join(PAYLOAD, "artifacts/memory-graph/vendor/force-graph.min.js")).size > 100_000);
  const ws = renderedWorkspace();
  const r = py(ws, "memory-graph.py", []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(ws, "artifacts/memory-graph/index.html")), "graph page not written");
});

test("a project made from _TEMPLATE keeps its TODO.md reachable for the Librarian; an unlinked one is reported", () => {
  const ws = renderedWorkspace();
  const proj = path.join(ws, "memory/projects");
  for (const [slug, link] of [["acme-launch", true], ["orphan-todo", false]]) {
    fs.mkdirSync(path.join(proj, slug));
    let main = fs.readFileSync(path.join(proj, "_TEMPLATE/main.md"), "utf8").replace("<项目名>", slug);
    if (!link) main = main.replace(/^- \[待办\]\(TODO\.md\).*\n/m, "");
    fs.writeFileSync(path.join(proj, slug, "main.md"), main);
    fs.writeFileSync(path.join(proj, slug, "history.md"), `# ${slug} history\n`);
    fs.copyFileSync(path.join(proj, "_TEMPLATE/TODO.md"), path.join(proj, slug, "TODO.md"));
  }
  const index = path.join(ws, "memory/index.md");
  fs.appendFileSync(index, "\n- [acme-launch](projects/acme-launch/main.md) — test\n- [orphan-todo](projects/orphan-todo/main.md) — test\n");
  const r = py(ws, "librarian-reachability.py", []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(fs.readFileSync(path.join(ws, "memory/librarian/unreachable.json"), "utf8"));
  const unreachable = Object.values(out.groups).flat().map((n) => n.path);
  assert.ok(!unreachable.includes("memory/projects/acme-launch/TODO.md"), `template-linked TODO.md unreachable: ${unreachable}`);
  assert.ok(unreachable.includes("memory/projects/orphan-todo/TODO.md"), "the check must still flag an unlinked TODO.md");
  assert.ok(!unreachable.some((p) => p.includes("/_TEMPLATE/")), "the template itself is not a page");
  // heartbeat-assistant does not offer the template's example tasks as real work
  const ctx = py(ws, "heartbeat-assistant.py", ["context"]);
  assert.equal(ctx.status, 0, ctx.stderr);
  const run = JSON.parse(ctx.stdout).context_path;
  const todos = JSON.parse(fs.readFileSync(path.join(ws, run), "utf8")).material.open_todos;
  assert.ok(todos.length > 0 && todos.every((t) => !t.file.includes("_TEMPLATE")));
});

// ------------------------------------------------------------------ review lists

test("every carried path exists in the payload, and no entry is both carried and skipped", () => {
  const l = lib.lists();
  for (const e of l.carry) {
    assert.ok(fs.existsSync(path.join(PAYLOAD, e.glob)), `carry.txt names ${e.glob}, which the payload does not have`);
    const top = lib.topEntry(e.glob) ?? e.glob;
    assert.ok(!lib.matches(l.skip, top) && !lib.matches(l.decide, top), `${top} is carried and also skipped/decided`);
  }
  for (const e of [...l.skip, ...l.decide]) assert.ok(e.reason, `${e.glob} has no reason`);
});

// ------------------------------------------------------------------ sync gate and three-way merge (fixture v-core)

function fixture() {
  const root = tmp("sync");
  const core = path.join(root, "core");
  const ws = path.join(root, "ws");
  const g = (...a) => execFileSync("git", ["-C", core, ...a], { encoding: "utf8" });
  fs.mkdirSync(path.join(core, "skills/alpha"), { recursive: true });
  g("init", "-q", "-b", "main"); g("config", "user.email", "t@example.com"); g("config", "user.name", "t");
  fs.writeFileSync(path.join(core, "skills/alpha/SKILL.md"), "line one\nline two\nline three\n");
  g("add", "-A"); g("commit", "-qm", "base");
  const base = g("rev-parse", "HEAD").trim();
  fs.mkdirSync(path.join(ws, "payload/skills/alpha"), { recursive: true });
  fs.writeFileSync(path.join(ws, "payload/skills/alpha/SKILL.md"), "line one EDITED BY DISTRO\nline two\nline three\n");
  fs.writeFileSync(path.join(ws, "carry.txt"), "skills/alpha\n");
  fs.writeFileSync(path.join(ws, "skip.txt"), "");
  fs.writeFileSync(path.join(ws, "decide.txt"), "");
  fs.writeFileSync(path.join(ws, "V_CORE_COMMIT"), base + "\n");
  return { core, ws, g, base };
}
const sync = (f, ...a) => spawnSync(process.execPath, [path.join(WS, "sync.mjs"), "--core", f.core, "--ref", "main", ...a],
  { encoding: "utf8", env: { ...process.env, DISTRO_WORKSPACE_DIR: f.ws, DISTRO_DENY_FILE: "" } });

test("sync stops with UNREVIEWED when v-core adds a skill nobody classified, and writes nothing", () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.core, "skills/brand-new"), { recursive: true });
  fs.writeFileSync(path.join(f.core, "skills/brand-new/SKILL.md"), "x\n");
  fs.appendFileSync(path.join(f.core, "skills/alpha/SKILL.md"), "line four from V\n");
  f.g("add", "-A"); f.g("commit", "-qm", "new skill");
  const r = sync(f);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /UNREVIEWED[\s\S]*skills\/brand-new/);
  assert.doesNotMatch(fs.readFileSync(path.join(f.ws, "payload/skills/alpha/SKILL.md"), "utf8"), /line four/);
  assert.equal(fs.readFileSync(path.join(f.ws, "V_CORE_COMMIT"), "utf8").trim(), f.base);
});

test("once classified, sync merges V's change into the distro's edited copy and records the commit", () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.core, "skills/brand-new"), { recursive: true });
  fs.writeFileSync(path.join(f.core, "skills/brand-new/SKILL.md"), "x\n");
  fs.appendFileSync(path.join(f.core, "skills/alpha/SKILL.md"), "line four from V, see /home/openclaw/makaron-openclaw/.openclaw-local/workspace\n");
  f.g("add", "-A"); f.g("commit", "-qm", "new skill");
  fs.writeFileSync(path.join(f.ws, "skip.txt"), "skills/brand-new  test: not for customers\n");
  const r = sync(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const merged = fs.readFileSync(path.join(f.ws, "payload/skills/alpha/SKILL.md"), "utf8");
  assert.match(merged, /EDITED BY DISTRO/);
  assert.match(merged, /line four from V, see @@WORKSPACE@@/);
  assert.ok(!fs.existsSync(path.join(f.ws, "payload/skills/brand-new")));
  assert.equal(fs.readFileSync(path.join(f.ws, "V_CORE_COMMIT"), "utf8").trim(), f.g("rev-parse", "HEAD").trim());
});

test("a conflicting change is left as markers and not recorded until --resolved", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.core, "skills/alpha/SKILL.md"), "line one CHANGED BY V\nline two\nline three\n");
  f.g("add", "-A"); f.g("commit", "-qm", "conflict");
  const r = sync(f);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(fs.readFileSync(path.join(f.ws, "V_CORE_COMMIT"), "utf8").trim(), f.base);
  const env = { ...process.env, DISTRO_WORKSPACE_DIR: f.ws, DISTRO_DENY_FILE: "" };
  assert.equal(spawnSync(process.execPath, [path.join(WS, "sync.mjs"), "--resolved"], { env }).status, 1);
  fs.writeFileSync(path.join(f.ws, "payload/skills/alpha/SKILL.md"), "line one EDITED BY DISTRO AND V\nline two\nline three\n");
  assert.equal(spawnSync(process.execPath, [path.join(WS, "sync.mjs"), "--resolved"], { env }).status, 0);
  assert.equal(fs.readFileSync(path.join(f.ws, "V_CORE_COMMIT"), "utf8").trim(), f.g("rev-parse", "HEAD").trim());
});

// ------------------------------------------------------------------ schedules and helpers

test("schedules.json: unique keys, valid crons, NO_REPLY as the silent token, scripts it names exist", () => {
  const items = JSON.parse(fs.readFileSync(path.join(PAYLOAD, "schedules.json"), "utf8"));
  assert.equal(new Set(items.map((s) => s.key)).size, items.length);
  for (const s of items) {
    assert.match(s.key, /^[a-z0-9-]+$/);
    assert.equal(s.cron.split(" ").length, 5, s.name);
    assert.doesNotMatch(s.prompt, /HEARTBEAT_OK|portal_schedule|\/vercel\//, s.name);
    for (const m of s.prompt.matchAll(/scripts\/([\w.-]+\.(?:py|sh|mjs))/g)) assert.ok(fs.existsSync(path.join(PAYLOAD, "scripts", m[1])), `${s.name} calls ${m[1]}`);
    for (const m of s.prompt.matchAll(/(skills\/[\w.-]+\/[\w./-]+\.md)/g)) assert.ok(fs.existsSync(path.join(PAYLOAD, m[1])), `${s.name} reads ${m[1]}`);
  }
  const hb = items.find((s) => s.key === "heartbeat-proactive");
  assert.equal(hb.cron, "30 2,8,14,20 * * *", "proactive heartbeat runs every 6 hours");
  assert.equal(items.find((s) => s.key === "heartbeat-daily-review").enabled, true, "daily review is on by default, like V");
});

test("the 2026-11-27 decisions hold: VSync, A2A and computer use ship and follow V; nothing is left undecided", () => {
  const l = lib.lists();
  for (const s of ["vsync", "agent-to-agent-protocol-feishu-a2a-defaults", "computer-use", "background-worker-contract", "qcc-company-lookup"]) {
    assert.equal(lib.classify(l, `skills/${s}`), "carry", s);
    assert.ok(fs.existsSync(path.join(PAYLOAD, "skills", s, "SKILL.md")), s);
  }
  const undecided = fs.readFileSync(path.join(WS, "decide.txt"), "utf8").split("\n").filter((x) => x.trim() && !x.startsWith("#"));
  assert.deepEqual(undecided, []);
  const cu = fs.readFileSync(path.join(PAYLOAD, "skills/computer-use/SKILL.md"), "utf8");
  assert.doesNotMatch(cu, /agentmail|22804|Profile 1|tianyi-mac|eleme-takeout|459 条|the owner/, "V's own browser setup stays out");
  assert.ok(fs.readFileSync(path.join(PAYLOAD, "AGENTS.md"), "utf8").includes("skills/computer-use"));
});

test("task room: the skill ships, takes the owner and app from this machine, and AGENTS.md points at it", () => {
  const s = fs.readFileSync(path.join(PAYLOAD, "skills/feishu-task-room-router/SKILL.md"), "utf8");
  assert.match(s, /agent:@@AGENT_ID@@:feishu:group:<chat_id>/);
  assert.match(s, /v-schedule\.py owner/);
  assert.match(s, /feishu-docs\.py status/);
  assert.doesNotMatch(s, /\b(ou|cli)_[0-9a-f]{6,}/);
  assert.ok(fs.readFileSync(path.join(PAYLOAD, "AGENTS.md"), "utf8").includes("skills/feishu-task-room-router"));
});

test("2026-11-28: no Scene; Night Shift ships generic and says it needs the service; public links say they need Vercel or Cloudflare", () => {
  const read = (rel) => fs.readFileSync(path.join(PAYLOAD, rel), "utf8");
  for (const rel of lib.walk(PAYLOAD)) {
    if (!/\.(md|json|py|mjs|cjs)$/.test(rel)) continue;
    assert.doesNotMatch(read(rel), /scene-cli|Scene retrieval|scenes-ai\.com/, rel);
  }
  const ns = read("skills/night-shift-operator/SKILL.md");
  assert.match(ns, /nightshiftctl health/);
  assert.match(ns, /需要部署方装好夜班服务并配置服务地址才生效/);
  assert.match(ns, /这项需要你补|需要你补 Vercel 或 Cloudflare 账号/);
  assert.doesNotMatch(ns, /tianyi\.live|cdn\.makaron\.app|xingqing|base-buffer-contract|\/home\/openclaw/);
  assert.match(read("TOOLS.md"), /## 公网链接：需要主人自己的 Vercel 或 Cloudflare 账号/);
  for (const rel of ["skills/html-poster-design/SKILL.md", "skills/html-executive-pitch-deck-iteration/SKILL.md", "skills/meshy-3d-agent/SKILL.md"])
    assert.match(read(rel), /这项需要你补 Vercel 或 Cloudflare 账号/, rel);
});

test("temporary previews: one script, closed automatically, said to be temporary, never for private material; portal is not a link for the owner", () => {
  const read = (rel) => fs.readFileSync(path.join(PAYLOAD, rel), "utf8");
  const tools = read("TOOLS.md");
  assert.match(tools, /scripts\/temp-preview\.py start/);
  assert.match(tools, /默认 24 小时后自动关掉/);
  assert.match(tools, /含客户资料、内部资料或任何私密内容的页面，不能用临时隧道/);
  assert.match(tools, /`portal` 工具不是给主人的链接/);
  assert.ok(fs.existsSync(path.join(PAYLOAD, "scripts/temp-preview.py")));
  assert.match(read("skills/night-shift-operator/SKILL.md"), /不能用临时预览链接/);
  assert.match(read(".gitignore"), /^\.v\/previews\.json$/m);
  for (const rel of lib.walk(PAYLOAD)) {
    if (!/\.md$/.test(rel)) continue;
    assert.doesNotMatch(read(rel), /通过 ?Portal|Portal 生成/, rel);
  }
});

function renderedWorkspace() {
  const out = path.join(tmp("py"), "ws");
  build(out, { values: { WORKSPACE: out, AGENT_ID: "test-v", STATE_DIR: path.join(out, ".state"), TIMEZONE: "Asia/Shanghai" } });
  return out;
}
const py = (ws, script, args, env = {}) => spawnSync("python3", [path.join(ws, "scripts", script), ...args], { cwd: ws, encoding: "utf8", env: { ...process.env, ...env } });

test("heartbeat-assistant: one story per day, quiet hours, and the owner's 'handled' are respected", () => {
  const ws = renderedWorkspace();
  const at = (t) => ({ HEARTBEAT_NOW: t });
  assert.equal(py(ws, "heartbeat-assistant.py", ["context"], at("2026-11-27T14:30:00+08:00")).status, 0);
  const note = path.join(ws, "n.txt");
  fs.writeFileSync(note, "合同下周一到期，续约要点我整理好了。\n");
  assert.equal(py(ws, "heartbeat-assistant.py", ["record", "--story", "contract-renewal", "--title", "合同续约", "--text-file", note], at("2026-11-27T14:30:00+08:00")).status, 0);
  assert.equal(py(ws, "heartbeat-assistant.py", ["check", "--story", "contract-renewal"], at("2026-11-27T20:30:00+08:00")).status, 3, "same story within 24 h");
  assert.equal(py(ws, "heartbeat-assistant.py", ["check", "--story", "other-matter"], at("2026-11-27T20:30:00+08:00")).status, 0);
  assert.equal(py(ws, "heartbeat-assistant.py", ["check", "--story", "other-matter"], at("2026-11-28T02:30:00+08:00")).status, 3, "default quiet hours");
  assert.equal(py(ws, "heartbeat-assistant.py", ["feedback", "--story", "contract-renewal", "--kind", "handled", "--quote", "这个我在办"], at("2026-11-28T09:00:00+08:00")).status, 0);
  assert.equal(py(ws, "heartbeat-assistant.py", ["check", "--story", "contract-renewal"], at("2026-11-30T14:30:00+08:00")).status, 3, "owner said handled");
  // A frequency of off stops every push.
  const user = path.join(ws, "USER.md");
  fs.writeFileSync(user, fs.readFileSync(user, "utf8").replace(/(\*\*主动触达频率\*\*：)[^\n]*/, "$1off"));
  assert.equal(py(ws, "heartbeat-assistant.py", ["check", "--story", "fresh-thing"], at("2026-12-01T14:30:00+08:00")).status, 3);
});

test("v-schedule owner: records one owner and refuses a second", () => {
  const ws = renderedWorkspace();
  assert.equal(py(ws, "v-schedule.py", ["owner"]).status, 1);
  assert.equal(py(ws, "v-schedule.py", ["owner", "--set", "ou_aaaaaaaaaaaaaaaa"]).status, 0);
  assert.equal(py(ws, "v-schedule.py", ["owner", "--set", "ou_aaaaaaaaaaaaaaaa"]).status, 0, "same owner again is fine");
  assert.equal(py(ws, "v-schedule.py", ["owner", "--set", "ou_bbbbbbbbbbbbbbbb"]).status, 2);
  assert.equal(py(ws, "v-schedule.py", ["owner", "--set", "not-an-id"]).status, 2);
  assert.equal((fs.statSync(path.join(ws, "onboarding/owner.json")).mode & 0o777), 0o600);
});

test("update policy: every payload file is system, sectioned or the owner's; the system ones stay managed; sections are well formed", () => {
  const pol = JSON.parse(fs.readFileSync(path.join(WS, "update-policy.json"), "utf8"));
  assert.equal(pol.schema, "v-distro-workspace-policy/1");
  const re = (g) => new RegExp("^" + g.split("**").map((s) => s.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")).join(".*") + "$");
  const any = (list, rel) => list.some((g) => re(g).test(rel));
  const managed = (rel) => (any(pol.system, rel) || pol.sections.includes(rel)) && !any(pol.owner, rel);
  for (const rel of lib.walk(PAYLOAD)) {
    if (rel.endsWith(".gitkeep")) continue;
    assert.ok(any(pol.system, rel) || pol.sections.includes(rel) || any(pol.owner, rel), `unclassified: ${rel}`);
  }
  for (const rel of ["memory/SCHEMA.md", "memory/projects/_TEMPLATE/TODO.md", "scripts/feishu-docs.py", "skills/computer-use/SKILL.md",
                     "schedules.json", "AGENTS.md", "TOOLS.md", "artifacts/memory-graph/vendor/force-graph.min.js"])
    assert.ok(managed(rel), `should be managed: ${rel}`);
  for (const rel of ["USER.md", "IDENTITY.md", "MEMORY.md", "memory/index.md", "memory/projects/acme/main.md", "onboarding/owner.json"])
    assert.ok(!managed(rel), `must never be overwritten: ${rel}`);
  for (const f of pol.sections) {
    const text = fs.readFileSync(path.join(PAYLOAD, f), "utf8");
    const begins = [...text.matchAll(/<!-- v-distro:begin ([a-z0-9-]+) -->/g)].map((m) => m[1]);
    const ends = [...text.matchAll(/<!-- v-distro:end ([a-z0-9-]+) -->/g)].map((m) => m[1]);
    assert.deepEqual(begins, ends, f);
    assert.equal(new Set(begins).size, begins.length, `${f}: section ids are unique`);
    const outside = text.replace(/<!-- v-distro:begin ([a-z0-9-]+) -->[\s\S]*?<!-- v-distro:end \1 -->/g, "");
    assert.doesNotMatch(outside, /v-distro:(begin|end)/, `${f}: no nested or stray markers`);
    assert.match(outside, /^## /m, `${f}: an owner area after the system sections`);
  }
  assert.match(fs.readFileSync(path.join(PAYLOAD, "AGENTS.md"), "utf8"), /系统文件不要直接改/);
});

test("cross-session: the receiver writes its result once in the final reply; the requester says it is checking before an empty wait", () => {
  const agents = fs.readFileSync(path.join(PAYLOAD, "AGENTS.md"), "utf8");
  assert.match(agents, /完整结果写在最终回复里，只写这一次/);
  assert.match(agents, /不要再用 `message` 工具把同样的结果另发一遍/);
  assert.match(agents, /最终回复不能是 NO_REPLY/);
  assert.match(agents, /我核对一下再报给你/);
  assert.match(fs.readFileSync(path.join(PAYLOAD, "skills/feishu-task-room-router/SKILL.md"), "utf8"), /结果只写在你的最终回复里/);
});

test("comments and messages that would show as the owner are never sent as the owner; doc comment replies go out as the final reply", () => {
  const tools = fs.readFileSync(path.join(PAYLOAD, "TOOLS.md"), "utf8");
  assert.match(tools, /会显示成主人在说话的，不用主人身份发/);
  assert.match(tools, /把回复直接写成你的最终回复/);
  assert.match(tools, /更不能 `--as user`/);
  assert.match(fs.readFileSync(path.join(PAYLOAD, "AGENTS.md"), "utf8"), /不超过 160 字节/);
  for (const rel of lib.walk(path.join(PAYLOAD, "skills"))) {
    if (!rel.endsWith("SKILL.md")) continue;
    const m = fs.readFileSync(path.join(PAYLOAD, "skills", rel), "utf8").match(/^description:\s*"?(.*?)"?\s*$/m);
    if (m) assert.ok(Buffer.byteLength(m[1]) <= 1024, `${rel}: description is ${Buffer.byteLength(m[1])} bytes`);
  }
});

test("VSync: the broker client ships, says when it has no identity, and the skill's receiving side covers any installed V", () => {
  const s = fs.readFileSync(path.join(PAYLOAD, "skills/vsync/SKILL.md"), "utf8");
  assert.match(s, /## On an installed V \(receiving side\)/);
  assert.match(s, /NEXUS_VSYNC_URL/);
  assert.match(s, /mirror-vsync\.py whoami/);
  assert.doesNotMatch(s, /keeps lark-cli read-only/);
  const r = spawnSync("python3", [path.join(PAYLOAD, "scripts/mirror-vsync.py"), "whoami"], { encoding: "utf8",
    env: { ...process.env, NEXUS_VSYNC_URL: "", NEXUS_VSYNC_AGENT: "", NEXUS_VSYNC_TOKEN: "" } });
  assert.equal(r.status, 3, r.stderr);
});
