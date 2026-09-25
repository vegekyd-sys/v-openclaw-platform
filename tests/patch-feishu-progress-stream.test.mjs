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

test("renders the plan as a work checklist", () => {
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
      "☑️ <font color='grey'>~~核对 SAP 官方实施方法~~</font>",
      "▶️ **升级讨论版为蓝图**　<font color='blue'>进行中</font>",
      "◻️ <font color='grey'>补示例流程</font>",
    ].join("\n"),
  );
});

test("step text cannot open card markup, emphasis or strikethrough", () => {
  const text = renderFeishuProgressMarkdown({
    steps: [{ step: "<at id=all></at> **boom** ~~x~~", status: "completed" }],
  });
  assert.doesNotMatch(text, /<at/);
  assert.doesNotMatch(text, /\*\*boom/);
  assert.equal(text, "☑️ <font color='grey'>~~&#60;at id=all&#62;&#60;/at&#62; &#42;&#42;boom&#42;&#42; &#126;&#126;x&#126;&#126;~~</font>");
});

test("the card's markdown note is never shown, so progress is not restated", () => {
  assert.equal(renderFeishuProgressMarkdown({ markdown: '<progress value="1" max="4"></progress>\n① 时间：00:35' }), "");
  assert.equal(
    renderFeishuProgressMarkdown({ markdown: "① 时间：00:35", steps: [{ step: "查时间", status: "in_progress" }] }),
    "▶️ **查时间**　<font color='blue'>进行中</font>",
  );
});

test("long plans fold the finished head and keep the live window", () => {
  const steps = Array.from({ length: 20 }, (_, index) => ({
    step: `s${index + 1}`,
    status: index < 15 ? "completed" : index === 15 ? "in_progress" : "pending",
  }));
  const lines = renderFeishuProgressMarkdown({ steps }).split("\n");
  assert.equal(lines[0], "☑️ <font color='grey'>已完成 9 步</font>");
  assert.ok(lines.includes("☑️ <font color='grey'>~~s15~~</font>"), "last finished step stays visible");
  assert.ok(lines.includes("▶️ **s16**　<font color='blue'>进行中</font>"));
  assert.ok(lines.includes("◻️ <font color='grey'>s20</font>"));
  assert.ok(lines.length <= 13);
});

test("an empty or cleared card renders nothing", () => {
  assert.equal(renderFeishuProgressMarkdown(null), "");
  assert.equal(renderFeishuProgressMarkdown({ steps: [], markdown: "  " }), "");
  assert.equal(renderFeishuProgressMarkdown({ markdown: "only a note" }), "");
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
  assert.deepEqual([...context.seen], ["▶️ **one**　<font color='blue'>进行中</font>", ""]);
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
  assert.match(first.source, /statusLine\);\n\t\tif \(vProgressText\) parts\.push\(parts\.length > 0 \? `\\n\\n---\\n\\n\$\{vProgressText\}` : vProgressText\);\n\t\treturn parts\.join/);
  assert.match(first.source, /progress-stream dispatcher=\$\{vProgressDispatcherId\}/);
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
