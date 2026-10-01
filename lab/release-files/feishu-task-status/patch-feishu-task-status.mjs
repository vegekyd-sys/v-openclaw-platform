#!/usr/bin/env node
// Shows a session's running background work on its Feishu reply card.
//
// Before: subagents, background commands and media generation started from a
// Feishu conversation were invisible there. The reply that started them closes
// as soon as the agent says "started", and the work goes on for minutes with
// nothing on screen (2026-10-02, a Codex native subagent ran 3 minutes after
// its card closed).
//
// All of that work is already one thing in OpenClaw: a record in the task
// registry, owned by the session that started it, whatever the runtime. Like
// the progress-stream patch, this subscribes Feishu to that single lifecycle
// instead of to per-runtime callbacks:
//   core   `task-registry-activity-*.js`: a global bridge that lists a
//          session's active tasks from the registry's own session index, and
//          tells in-process listeners which sessions changed whenever the
//          registry notifies its (single-slot) Gateway observer.
//   core   `task-registry.store.sqlite-*.js`: the same session's unfinished
//          rows from SQLite, by the owner_key index. V worker processes keep
//          their own registry and only share the database, so their
//          subagents and background commands are never in the Gateway's
//          memory and raise no Gateway event; the Feishu side polls this.
//          A subagent a worker spawns is not a task at all: it exists only in
//          `subagent_runs` (completion owned by the Gateway's external task
//          bridge), so its unfinished runs are read from there too.
//   feishu `monitor.account-*.js`: each reply card, from start until its
//          session's work is done, shows one line under the footer:
//          "⏳ 后台 2 个任务进行中：子 agent 1、后台命令 1", then "☑️ 后台任务已结束".
//          The line keeps updating after the card closes. Only the newest card
//          of a session carries the live line; a new reply takes it over.
//
// Shape-gated and idempotent: every anchor must match exactly once or nothing
// is written. Each file alone is a no-op at runtime; ship them together.

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CORE_MARKER = "v-task-registry-bridge-v1";
export const STORE_MARKER = "v-task-registry-bridge-store-v1";
// A row another process left "running" without any event for this long is
// treated as abandoned (V had two such nightshift rows, 2 days old).
export const PERSISTED_STALE_MS = 6 * 60 * 60 * 1000;
export const FEISHU_MARKER = "v-feishu-task-status-v1";
export const BRIDGE_SYMBOL = "openclaw.v.taskRegistryBridge";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The render module, with `export` stripped so it can live inside the bundle. */
export function inlineRenderModule(source = readFileSync(join(HERE, "feishu-task-status-render.mjs"), "utf8")) {
  const body = source.replace(/^export (const|function|async function) /gm, "$1 ");
  if (/^\s*(import|export)\s/m.test(body)) {
    throw new Error("feishu-task-status-render.mjs must stay free of imports/exports to be inlined");
  }
  return body;
}

// Inserted where the registry's indexes and status helpers are all in scope.
export const CORE_PRELUDE = `// ${CORE_MARKER}
const vTaskRegistryBridge = globalThis[Symbol.for("${BRIDGE_SYMBOL}")] ??= { listeners: new Set() };
vTaskRegistryBridge.listActive = (sessionKey) => {
	const key = typeof sessionKey === "string" ? sessionKey.trim() : "";
	if (!key) return [];
	const active = [];
	for (const taskId of taskIdsByRelatedSessionKey.get(key) ?? []) {
		const task = tasks.get(taskId);
		if (!task || isTerminalTaskStatus(task.status)) continue;
		if (task.ownerKey !== key && task.requesterSessionKey !== key) continue;
		active.push({
			taskId: task.taskId,
			runtime: task.runtime,
			taskKind: task.taskKind,
			runId: task.runId,
			childSessionKey: task.childSessionKey,
			label: task.label,
			status: task.status,
			createdAt: task.createdAt
		});
	}
	// Work registered by other processes (V workers) only reaches this process
	// through the shared database. A task this registry knows is decided here.
	let persisted = [];
	try {
		persisted = typeof vTaskRegistryBridge.listActivePersisted === "function" ? vTaskRegistryBridge.listActivePersisted(key) : [];
	} catch {}
	const now = Date.now();
	for (const row of persisted) {
		if (!row?.taskId || tasks.has(row.taskId)) continue;
		if (now - (row.lastEventAt ?? row.createdAt ?? 0) > ${PERSISTED_STALE_MS}) continue;
		active.push(row);
	}
	let subagents = [];
	try {
		subagents = typeof vTaskRegistryBridge.listActiveSubagentsPersisted === "function" ? vTaskRegistryBridge.listActiveSubagentsPersisted(key) : [];
	} catch {}
	for (const run of subagents) {
		if (!run?.childSessionKey) continue;
		if (active.some((task) => task.childSessionKey === run.childSessionKey || (run.runId && task.runId === run.runId))) continue;
		const known = taskIdsByRelatedSessionKey.get(run.childSessionKey);
		if (known && [...known].some((id) => tasks.get(id)?.runtime === "subagent")) continue;
		active.push(run);
	}
	return active;
};
function vTaskRegistryBridgeNotify(event) {
	if (!event || vTaskRegistryBridge.listeners.size === 0) return;
	const record = event.task ?? event.previous;
	const sessionKeys = record ? [...new Set([record.ownerKey, record.requesterSessionKey].filter((key) => typeof key === "string" && key))] : [];
	const notice = { kind: event.kind, sessionKeys };
	for (const listener of vTaskRegistryBridge.listeners) queueMicrotask(() => {
		try {
			listener(notice);
		} catch {}
	});
}
`;

const CORE_SITES = [
  {
    id: "prelude",
    find: `//#region src/tasks/task-registry-activity.ts\n`,
    replace: `${CORE_PRELUDE}//#region src/tasks/task-registry-activity.ts\n`,
  },
  {
    // The Gateway owns the registry's only observer slot; the bridge rides
    // along with it instead of replacing it.
    id: "notify-with-observer",
    find: `function emitTaskRegistryObserverEvent(createEvent) {
	const observers = getTaskRegistryObservers();
	if (!observers?.onEvent) return;
	try {
		observers.onEvent(createEvent());
	} catch (error) {`,
    replace: `function emitTaskRegistryObserverEvent(createEvent) {
	const observers = getTaskRegistryObservers();
	if (!observers?.onEvent && vTaskRegistryBridge.listeners.size === 0) return;
	try {
		const event = createEvent();
		vTaskRegistryBridgeNotify(event);
		observers?.onEvent?.(event);
	} catch (error) {`,
  },
];

export const STORE_GLUE = `
// ${STORE_MARKER}
const vTaskRegistryBridgeStatements = new WeakMap();
const vTaskRegistryBridgeSubagentStatements = new WeakMap();
(globalThis[Symbol.for("${BRIDGE_SYMBOL}")] ??= { listeners: new Set() }).listActivePersisted = (ownerKey) => {
	const key = typeof ownerKey === "string" ? ownerKey.trim() : "";
	if (!key) return [];
	const { db } = openTaskRegistryDatabase();
	let statement = vTaskRegistryBridgeStatements.get(db);
	if (!statement) {
		statement = db.prepare(\`SELECT task_id, runtime, task_kind, child_session_key, label, status, created_at, last_event_at
       FROM task_runs
       WHERE owner_key = ? AND status NOT IN ('succeeded', 'failed', 'timed_out', 'cancelled', 'lost')\`);
		vTaskRegistryBridgeStatements.set(db, statement);
	}
	return statement.all(key).map((row) => ({
		taskId: row.task_id,
		runtime: row.runtime,
		taskKind: row.task_kind ?? void 0,
		childSessionKey: row.child_session_key ?? void 0,
		label: row.label ?? void 0,
		status: row.status,
		createdAt: row.created_at,
		lastEventAt: row.last_event_at ?? void 0
	}));
};
// Unfinished subagent runs this session requested, from the last day. A run
// past its own timeout by more than 10 minutes is treated as abandoned.
(globalThis[Symbol.for("${BRIDGE_SYMBOL}")]).listActiveSubagentsPersisted = (requesterKey) => {
	const key = typeof requesterKey === "string" ? requesterKey.trim() : "";
	if (!key) return [];
	const { db } = openTaskRegistryDatabase();
	let statement = vTaskRegistryBridgeSubagentStatements.get(db);
	if (!statement) {
		statement = db.prepare(\`SELECT run_id, child_session_key, created_at,
         json_extract(payload_json, '$.execution.status') AS execution_status,
         json_extract(payload_json, '$.execution.startedAt') AS started_at,
         json_extract(payload_json, '$.execution.endedAt') AS execution_ended_at,
         json_extract(payload_json, '$.endedAt') AS ended_at,
         json_extract(payload_json, '$.runTimeoutSeconds') AS timeout_seconds,
         json_extract(payload_json, '$.label') AS label
       FROM subagent_runs
       WHERE requester_session_key = ? AND created_at >= ?\`);
		vTaskRegistryBridgeSubagentStatements.set(db, statement);
	}
	const now = Date.now();
	return statement.all(key, now - 864e5).filter((row) => {
		if (row.execution_status === "terminal" || row.execution_ended_at || row.ended_at) return false;
		const timeoutMs = Number(row.timeout_seconds) > 0 ? Number(row.timeout_seconds) * 1e3 : ${PERSISTED_STALE_MS};
		return now - Number(row.started_at ?? row.created_at) <= timeoutMs + 6e5;
	}).map((row) => ({
		taskId: "subagent-run:" + row.run_id,
		runId: row.run_id,
		runtime: "subagent",
		childSessionKey: row.child_session_key,
		label: row.label ?? void 0,
		status: "running",
		createdAt: row.created_at
	}));
};
`;

// Module-scope glue at the end of the Feishu monitor bundle.
export const FEISHU_GLUE = `
const V_TASK_BRIDGE_KEY = Symbol.for("${BRIDGE_SYMBOL}");
const V_TASK_STATUS_DEBOUNCE_MS = 800;
// Worker-owned work raises no event in this process; a tracked card re-reads.
const V_TASK_STATUS_POLL_MS = 5e3;
const V_TASK_STATUS_MAX_CARD_AGE_MS = 24 * 60 * 60 * 1e3;
const vTaskStatusEntries = new Map();
let vTaskStatusListener = null;
function vTaskStatusKey(sessionKey) {
	return typeof sessionKey === "string" ? sessionKey.trim().toLowerCase() : "";
}
function vTaskStatusBridge() {
	const bridge = globalThis[V_TASK_BRIDGE_KEY];
	return bridge && typeof bridge.listActive === "function" && bridge.listeners instanceof Set ? bridge : null;
}
function vTaskStatusListen(bridge) {
	if (vTaskStatusListener) return;
	vTaskStatusListener = (notice) => {
		if (notice?.kind === "restored") {
			for (const entry of vTaskStatusEntries.values()) vTaskStatusSchedule(entry);
			return;
		}
		for (const sessionKey of notice?.sessionKeys ?? []) {
			const entry = vTaskStatusEntries.get(vTaskStatusKey(sessionKey));
			if (entry) vTaskStatusSchedule(entry);
		}
	};
	bridge.listeners.add(vTaskStatusListener);
}
function vTaskStatusDrop(entry) {
	if (entry.timer) clearTimeout(entry.timer);
	entry.timer = null;
	if (vTaskStatusEntries.get(entry.key) === entry) vTaskStatusEntries.delete(entry.key);
	if (vTaskStatusEntries.size === 0 && vTaskStatusListener) {
		vTaskStatusBridge()?.listeners.delete(vTaskStatusListener);
		vTaskStatusListener = null;
	}
}
function vTaskStatusSchedule(entry, delayMs = V_TASK_STATUS_DEBOUNCE_MS) {
	const dueAt = Date.now() + delayMs;
	if (entry.timer && entry.dueAt <= dueAt) return;
	if (entry.timer) clearTimeout(entry.timer);
	entry.dueAt = dueAt;
	entry.timer = setTimeout(() => vTaskStatusRefresh(entry), delayMs);
	entry.timer.unref?.();
}
async function vTaskStatusPutNote(session, state, note) {
	const apiBase = resolveApiBase(session.creds.domain);
	state.sequence += 1;
	const lines = note.split("\\n").map((line) => "<font color='grey'>" + line + "</font>").join("\\n");
	const { response, release } = await fetchWithSsrFGuard({
		url: apiBase + "/cardkit/v1/cards/" + state.cardId + "/elements/note",
		init: { method: "PUT", headers: {
			Authorization: "Bearer " + await getToken(session.creds, { fetchImpl: session.fetchImpl, lookupFn: session.lookupFn }),
			"Content-Type": "application/json", "User-Agent": getFeishuUserAgent()
		}, body: JSON.stringify({
			element: JSON.stringify({ tag: "markdown", element_id: "note", content: lines }),
			sequence: state.sequence,
			uuid: "task_" + state.cardId + "_" + state.sequence
		}) },
		fetchImpl: session.fetchImpl, lookupFn: session.lookupFn,
		policy: { allowedHostnames: resolveAllowedHostnames(session.creds.domain) },
		auditContext: "feishu.task-status.note", timeoutMs: session.creds.httpTimeoutMs ?? 3e4
	});
	try {
		await assertSuccessfulCardKitResponse(response, "feishu.task-status.note", "Update background task line");
	} finally {
		await release();
	}
}
// Writes share the card's sequence counter: while the card streams they join
// its write queue; once it closes they wait for the close and run in order.
function vTaskStatusEnqueue(card, write) {
	const session = card.session;
	if (session.state === card.state && !session.closed) {
		const task = session.queue.then(write);
		session.queue = task.catch(() => {});
		return task;
	}
	const task = (card.chain ?? Promise.resolve()).then(async () => {
		if (session.vTaskClosing) await session.vTaskClosing.catch(() => {});
		return write();
	});
	card.chain = task.catch(() => {});
	return task;
}
function vTaskStatusShow(entry, card, line) {
	card.line = line;
	const note = composeFeishuTaskStatusNote(card.baseNote, line);
	if (note === card.wantedNote) return;
	card.wantedNote = note;
	vTaskStatusEnqueue(card, async () => {
		if (card.session.vTaskDiscarded || card.wantedNote !== note || card.writtenNote === note) return;
		await vTaskStatusPutNote(card.session, card.state, note);
		card.writtenNote = note;
		entry.log?.("task-status card=" + card.state.cardId + " line=" + JSON.stringify(line));
	}).catch((error) => entry.log?.("task-status card=" + card.state.cardId + " write failed: " + String(error)));
}
function vTaskStatusRefresh(entry) {
	entry.timer = null;
	const card = entry.card;
	const bridge = vTaskStatusBridge();
	if (!card || !bridge || card.session.vTaskDiscarded || Date.now() - card.startedAt > V_TASK_STATUS_MAX_CARD_AGE_MS) {
		vTaskStatusDrop(entry);
		return;
	}
	let active = [];
	try {
		active = feishuBackgroundTasks(bridge.listActive(entry.sessionKey), entry.sessionKey);
	} catch (error) {
		entry.log?.("task-status list failed: " + String(error));
	}
	const line = renderFeishuTaskStatusLine(active, { shownActive: card.shownActive });
	if (active.length > 0) card.shownActive = true;
	card.lineActive = active.length > 0;
	vTaskStatusShow(entry, card, line);
	// A closed card with nothing running will not change again.
	if (card.session.closed && active.length === 0) vTaskStatusDrop(entry);
	else vTaskStatusSchedule(entry, V_TASK_STATUS_POLL_MS);
}
/** A reply card started for this session: it carries the line from now on. */
function vTaskStatusAttach(sessionKey, session, baseNote, log) {
	const bridge = vTaskStatusBridge();
	const key = vTaskStatusKey(sessionKey);
	const state = session?.state;
	if (!bridge || !key || !state?.cardId || !state.hasNote) return;
	let entry = vTaskStatusEntries.get(key);
	if (!entry) vTaskStatusEntries.set(key, entry = { key, sessionKey, card: null, timer: null, log });
	entry.log = log;
	const previous = entry.card;
	const note = baseNote ?? "";
	const card = { key, session, state, baseNote: note, wantedNote: note, writtenNote: note, line: "", lineActive: false, shownActive: false, startedAt: Date.now(), chain: null };
	session.vTaskStatusCard = card;
	entry.card = card;
	// One live line per session: the previous card goes back to its footer.
	if (previous && previous !== card && previous.lineActive) {
		previous.lineActive = false;
		vTaskStatusShow(entry, previous, "");
	}
	vTaskStatusListen(bridge);
	vTaskStatusSchedule(entry, 0);
}
/** The footer a closing card is finalized with; the line is re-applied after. */
function vTaskStatusFinalNote(session, finalNote) {
	const card = session?.vTaskStatusCard;
	if (!card) return finalNote;
	card.baseNote = finalNote ?? "";
	card.wantedNote = card.baseNote;
	card.writtenNote = card.baseNote;
	const entry = vTaskStatusEntries.get(card.key);
	if (entry?.card === card) vTaskStatusSchedule(entry, 0);
	return finalNote;
}
function installFeishuTaskStatus(Session) {
	const close = Session.prototype.closeWithResult;
	const discard = Session.prototype.discard;
	Session.prototype.closeWithResult = function (...args) {
		const pending = close.apply(this, args);
		this.vTaskClosing = pending;
		return pending;
	};
	Session.prototype.discard = function (...args) {
		this.vTaskDiscarded = true;
		return discard.apply(this, args);
	};
}
installFeishuTaskStatus(FeishuStreamingSession);
`;

const FEISHU_SITES = [
  {
    id: "attach-on-card-start",
    find: `\t\t\t\tstreamingStartBackoffUntilByAccount.delete(account.accountId);\n`,
    replace: `\t\t\t\tstreamingStartBackoffUntilByAccount.delete(account.accountId);\n\t\t\t\tvTaskStatusAttach(params.sessionKey, session, cardNote, (message) => params.runtime.log?.(\`feishu[\${account.accountId}] \${message}\`));\n`,
  },
  {
    id: "final-note",
    find: `closed = await streamingToClose.closeWithResult(text, { note: finalNote });`,
    replace: `closed = await streamingToClose.closeWithResult(text, { note: vTaskStatusFinalNote(streamingToClose, finalNote) });`,
  },
];

const sha = (text) => createHash("sha256").update(text).digest("hex");

function countOccurrences(haystack, needle) {
  let count = 0;
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) count += 1;
  return count;
}

function patchSites(source, sites, marker, label) {
  if (source.includes(marker)) return { changed: false, source };
  for (const site of sites) {
    const count = countOccurrences(source, site.find);
    if (count !== 1) throw new Error(`${label} site ${site.id}: expected 1 match, found ${count}`);
  }
  let patched = source;
  for (const site of sites) patched = patched.replace(site.find, () => site.replace);
  return { changed: true, source: patched };
}

export function patchTaskRegistryCore(source) {
  return patchSites(source, CORE_SITES, CORE_MARKER, "core task-registry-activity");
}

export function patchTaskRegistryStore(source) {
  if (source.includes(STORE_MARKER)) return { changed: false, source };
  for (const anchor of ["function openTaskRegistryDatabase() {", "const { db } = openTaskRegistryDatabase();"]) {
    if (!source.includes(anchor)) throw new Error(`core task-registry store: missing ${anchor}`);
  }
  return { changed: true, source: `${source}${STORE_GLUE}` };
}

export function patchFeishuTaskStatus(source, renderModule = inlineRenderModule()) {
  const result = patchSites(source, FEISHU_SITES, FEISHU_MARKER, "feishu monitor");
  if (!result.changed) return result;
  return { changed: true, source: `${result.source}\n// ${FEISHU_MARKER}\n${renderModule}${FEISHU_GLUE}` };
}

function findOne(dir, pattern, label) {
  const matches = readdirSync(dir).filter((name) => pattern.test(name));
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one file in ${dir}, found ${matches.length}`);
  return join(dir, matches[0]);
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const outIndex = args.indexOf("--out-dir");
  const outDir = outIndex === -1 ? undefined : args[outIndex + 1];
  const positional = args.filter((arg, index) => !arg.startsWith("--") && index !== outIndex + 1);
  const [coreDist, feishuDir] = positional;
  if (!coreDist || !feishuDir || (outIndex !== -1 && !outDir)) {
    console.error("usage: patch-feishu-task-status.mjs [--check | --out-dir <dir>] <openclaw dist> <@openclaw/feishu dir>");
    process.exit(2);
  }
  try {
    const corePath = findOne(coreDist, /^task-registry-activity-[A-Za-z0-9_-]+\.js$/, "core task-registry-activity");
    const coreOriginal = readFileSync(corePath, "utf8");
    const storePath = findOne(coreDist, /^task-registry\.store\.sqlite-[A-Za-z0-9_-]+\.js$/, "core task-registry store");
    const storeOriginal = readFileSync(storePath, "utf8");
    const feishuPath = findOne(join(feishuDir, "dist"), /^monitor\.account-[A-Za-z0-9_-]+\.js$/, "feishu monitor");
    const feishuOriginal = readFileSync(feishuPath, "utf8");
    // Plan both before writing either.
    const plans = [
      { id: "core-task-registry", path: corePath, original: coreOriginal, ...patchTaskRegistryCore(coreOriginal) },
      { id: "core-task-store", path: storePath, original: storeOriginal, ...patchTaskRegistryStore(storeOriginal) },
      { id: "feishu-monitor", path: feishuPath, original: feishuOriginal, ...patchFeishuTaskStatus(feishuOriginal) },
    ];
    if (outDir) mkdirSync(outDir, { recursive: true });
    const report = [];
    for (const plan of plans) {
      if (outDir) writeFileSync(join(outDir, basename(plan.path)), plan.source);
      else if (plan.changed && !check) {
        copyFileSync(plan.path, `${plan.path}.bak-${FEISHU_MARKER}-${Date.now()}`);
        writeFileSync(plan.path, plan.source);
      }
      report.push({ id: plan.id, file: basename(plan.path), changed: plan.changed, beforeSha: sha(plan.original), afterSha: sha(plan.source) });
    }
    console.log(JSON.stringify({ ok: true, check, outDir, coreMarker: CORE_MARKER, feishuMarker: FEISHU_MARKER, files: report }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, reason: error.message }));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
