import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

import {
  isFeishuProgressCardToolName,
  renderFeishuProgressMarkdown,
} from "../lab/release-files/feishu-progress-stream/feishu-progress-stream-render.mjs";
import {
  CORE_PRELUDE,
  FEISHU_GLUE,
  FEISHU_MARKER,
  inlineRenderModule,
  patchFeishuProgressStream,
  patchProgressCardCore,
} from "../lab/release-files/feishu-progress-stream/patch-feishu-progress-stream.mjs";

const PRODUCTION_MONITOR = new URL(
  "../release/captured/v2026.9.1-db91.6-media-relay-20260925.feishu/dist/dist/monitor.account-WFdlCDhR.js",
  import.meta.url,
);

// The two anchors of the upstream 2026.9.1 `progress-card-CciYmFS8.js`.
const CORE_FIXTURE = `import fs from "node:fs";
//#region src/session-cards/progress-card-store.ts
function store() {}
//#endregion
function createProgressCardHandlers(store) {
	return {
		"progressCard.put": ({ params, respond, context }) => {
			const sessionKey = params.sessionKey;
			try {
				const result = store.put(sessionKey, { ...params, expectedRevision: params.expectedRevision });
				if (params.expectedRevision === void 0 || result.card === null) context.broadcast("progressCard.changed", {
					sessionKey,
					revision: result.card?.revision ?? null
				});
				respond(true, result, void 0);
			} catch (error) {
				respond(false, void 0, String(error));
			}
		}
	};
}
`;

test("renders a plan as a checklist with a done count", () => {
  const text = renderFeishuProgressMarkdown({
    steps: [
      { step: "核对 SAP 官方实施方法", status: "completed" },
      { step: "升级讨论版为蓝图", status: "in_progress" },
      { step: "补示例流程", status: "pending" },
    ],
  });
  assert.equal(
    text,
    [
      "**📋 进度 1/3**",
      "✅ <font color='grey'>核对 SAP 官方实施方法</font>",
      "🔄 **升级讨论版为蓝图**",
      "⬜ <font color='grey'>补示例流程</font>",
    ].join("\n"),
  );
});

test("step text cannot open card markup or emphasis", () => {
  const text = renderFeishuProgressMarkdown({
    steps: [{ step: "<at id=all></at> **boom** ~~x~~", status: "pending" }],
  });
  assert.doesNotMatch(text, /<at/);
  assert.doesNotMatch(text, /\*\*boom/);
  assert.match(text, /&#60;at id=all&#62;/);
});

test("note keeps markdown, draws the progress bar and strips other tags", () => {
  const text = renderFeishuProgressMarkdown({
    markdown: '<progress aria-label="CI · 4/6" value="4" max="6"></progress>\n**构建中** <font color="red">x</font><at id=all></at>',
  });
  assert.equal(text, "**📋 进度**\n▰▰▰▰▰▰▰▱▱▱ CI · 4/6\n**构建中** x");
});

test("long plans fold the finished head and keep the live window", () => {
  const steps = Array.from({ length: 20 }, (_, index) => ({
    step: `s${index + 1}`,
    status: index < 15 ? "completed" : index === 15 ? "in_progress" : "pending",
  }));
  const lines = renderFeishuProgressMarkdown({ steps }).split("\n");
  assert.equal(lines[0], "**📋 进度 15/20**");
  assert.equal(lines[1], "✅ <font color='grey'>已完成 9 步</font>");
  assert.ok(lines.includes("✅ <font color='grey'>s15</font>"), "last finished step stays visible");
  assert.ok(lines.includes("🔄 **s16**"));
  assert.ok(lines.includes("⬜ <font color='grey'>s20</font>"));
  assert.ok(lines.length <= 14);
});

test("an empty or cleared card renders nothing", () => {
  assert.equal(renderFeishuProgressMarkdown(null), "");
  assert.equal(renderFeishuProgressMarkdown({ steps: [], markdown: "  " }), "");
  assert.equal(renderFeishuProgressMarkdown({ markdown: "<br>" }), "");
});

test("progress-card tool names match across runtimes", () => {
  for (const name of ["progress_card", "mcp__openclaw__progress_card", "openclaw.progress_card", "Progress_Card"]) {
    assert.equal(isFeishuProgressCardToolName(name), true, name);
  }
  for (const name of ["progress_cards", "exec", "update_plan", undefined]) {
    assert.equal(isFeishuProgressCardToolName(name), false, String(name));
  }
});

test("core patch notifies listeners next to the broadcast, and is idempotent", () => {
  const first = patchProgressCardCore(CORE_FIXTURE);
  assert.equal(first.changed, true);
  assert.equal(patchProgressCardCore(first.source).changed, false);

  const events = [];
  const context = vm.createContext({ globalThis: undefined, Symbol, Set, Promise, events });
  context.globalThis = context;
  const body = first.source.replace(/^import .*\n/m, "").replace(/\/\/#(end)?region.*\n/g, "");
  vm.runInContext(`${body}
globalThis[Symbol.for("openclaw.v.progressCardChangedListeners")].add((event) => events.push(event));
const handlers = createProgressCardHandlers({ put: (sessionKey) => ({ card: { sessionKey, revision: 3, steps: [] } }) });
const broadcasts = [];
handlers["progressCard.put"]({ params: { sessionKey: "agent:makaron:feishu:direct:ou_x" }, respond() {}, context: { broadcast: (...args) => broadcasts.push(args) } });
handlers["progressCard.put"]({ params: { sessionKey: "k", expectedRevision: 2 }, respond() {}, context: { broadcast: (...args) => broadcasts.push(args) } });
globalThis.broadcasts = broadcasts;`, context);
  assert.equal(context.broadcasts.length, 1);
  assert.equal(events.length, 1, "a refused clear is not announced, same as the broadcast");
  assert.equal(events[0].sessionKey, "agent:makaron:feishu:direct:ou_x");
  assert.equal(events[0].card.revision, 3);
});

test("feishu glue receives the core's events for its own session only", () => {
  const context = vm.createContext({ Symbol, Set, Map, Promise });
  context.globalThis = context;
  vm.runInContext(`${CORE_PRELUDE}${inlineRenderModule()}${FEISHU_GLUE}
globalThis.seen = [];
globalThis.unsubscribe = vProgressSubscribe("Agent:Makaron:feishu:direct:ou_A", (card) => seen.push(renderFeishuProgressMarkdown(card)));
vProgressCardNotifyChanged("agent:makaron:feishu:direct:ou_a", { steps: [{ step: "one", status: "in_progress" }] });
vProgressCardNotifyChanged("agent:makaron:feishu:direct:ou_b", { steps: [{ step: "other", status: "pending" }] });
vProgressCardNotifyChanged("agent:makaron:feishu:direct:ou_a", null);
globalThis.listenersWhileSubscribed = vProgressCardChangedListeners.size;
unsubscribe();
globalThis.listenersAfter = vProgressCardChangedListeners.size;
vProgressCardNotifyChanged("agent:makaron:feishu:direct:ou_a", { steps: [{ step: "late", status: "pending" }] });`, context);
  assert.deepEqual([...context.seen], ["**📋 进度 0/1**\n🔄 **one**", ""]);
  assert.equal(context.listenersWhileSubscribed, 1);
  assert.equal(context.listenersAfter, 0, "last unsubscribe detaches from the Gateway set");
});

test("patches the captured production Feishu monitor, idempotently and syntactically", () => {
  const original = readFileSync(PRODUCTION_MONITOR, "utf8");
  const first = patchFeishuProgressStream(original);
  assert.equal(first.changed, true);
  assert.ok(first.source.startsWith(`// ${FEISHU_MARKER}\n`));
  assert.equal(patchFeishuProgressStream(first.source).changed, false);

  assert.match(first.source, /if \(isFeishuProgressCardToolName\(payload\.name\)\) return false;/);
  assert.match(first.source, /vProgressAttach\(\);\n\t\t\tif \(previewStreamingEnabled && renderMode === "card"\)/);
  assert.match(first.source, /vProgressDetach\(\);\n\t\t\ttypingCallbacks\?\.onCleanup/);
  assert.match(first.source, /statusLine = "";\n\t\t\t\tvProgressText = "";\n\t\t\t\tconst text = buildCombinedStreamText/);

  const dir = mkdtempSync(join(tmpdir(), "feishu-progress-stream-"));
  try {
    const file = join(dir, "monitor.mjs");
    writeFileSync(file, first.source);
    execFileSync(process.execPath, ["--check", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses a bundle whose anchors moved", () => {
  const original = readFileSync(PRODUCTION_MONITOR, "utf8");
  assert.throws(
    () => patchFeishuProgressStream(original.replace(`\tlet statusLine = "";\n`, `\tlet statusLine = null;\n`)),
    /dispatcher-state: expected 1 match, found 0/,
  );
});
