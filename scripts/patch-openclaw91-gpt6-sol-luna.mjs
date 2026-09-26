// Backport of upstream 4ae133a994f "feat(openai): support GPT-6 Sol and Luna"
// (#155967, in v2026.9.6, absent from v2026.9.5) onto the 2026.9.1 runtime.
//
// A git cherry-pick is not available: 19 of that commit's 20 files conflict on
// v2026.9.1 and production is not built from git. But the change is small and
// we have the precedent -- gpt-6-astra reached 9.1 the same way, via
// scripts/patch-openclaw91-astra.mjs, whose markers are still live in the
// bundles. Upstream generalises a single ASTRA constant into a three-model
// list; this does the same edit at the same two anchors.
//
// Metadata is taken verbatim from v2026.9.6 extensions/openai/openclaw.plugin.json,
// with one deliberate reduction: 9.6 gives both models a "none" reasoning
// effort, which the 9.1 thinking policy does not know, so "off" maps to "low"
// exactly as the astra patch does.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const MARKER = 'v91-gpt6-sol-luna-v1';
const EFFORTS = '["low", "medium", "high", "xhigh", "max"]';

const MODELS = [
  { id: 'gpt-6-sol', name: 'GPT-6 Sol', cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna', cost: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 } },
];

export function patchContract(source) {
  if (source.includes(`// ${MARKER}`)) return source;
  const replace = (a, b) => {
    assert.equal(source.split(a).length, 2, `Unexpected anchor: ${a}`);
    source = source.replace(a, b);
  };
  const dual = 'const OPENAI_DUAL_ROUTE_MODEL_IDS = [';
  replace(dual, `${dual}\n\t// ${MARKER}\n${MODELS.map((m) => `\t"${m.id}",`).join('\n')}`);
  const efforts = 'const OPENAI_CODEX_REASONING_EFFORTS_BY_MODEL = /* @__PURE__ */ new Map([';
  replace(efforts, `${efforts}\n\t// ${MARKER}\n${MODELS.map((m) => `\t["${m.id}", ${EFFORTS}],`).join('\n')}`);
  return source;
}

export function patchSubscriptionProvider(source) {
  if (source.includes(`// ${MARKER}`)) return source;
  const anchor = '\tconst synthBaseUrl = ctx.providerConfig?.baseUrl ?? OPENAI_CODEX_BASE_URL;';
  assert.equal(source.split(anchor).length, 2, 'Subscription model resolver drifted');
  // the astra backport must already be in place; these models sit beside it
  assert(source.includes('vlab-astra-subscription-model-v1'), 'astra backport missing');
  const rows = MODELS.map((m) => `
\tif (lower === "${m.id}") return normalizeModelCompat({
\t\tid: trimmedModelId, name: "${m.name}", provider: PROVIDER_ID,
\t\tapi: "openai-chatgpt-responses", baseUrl: synthBaseUrl,
\t\treasoning: true, input: ["text", "image"],
\t\tcontextWindow: 1050000, contextTokens: 272000, maxTokens: 128000,
\t\tcost: {input: ${m.cost.input}, output: ${m.cost.output}, cacheRead: ${m.cost.cacheRead}, cacheWrite: ${m.cost.cacheWrite}},
\t\tthinkingLevelMap: {off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max"},
\t\tcompat: {supportsTemperature: false, supportsReasoningEffort: true,
\t\t\tsupportedReasoningEfforts: ${EFFORTS}, codeMode: "preferred"}
\t});`).join('');
  return source.replace(anchor, `${anchor}\n\t// ${MARKER}${rows}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, core, backup] = process.argv.slice(2);
  assert(['apply', 'rollback', 'dry-run'].includes(action), 'action must be apply|rollback|dry-run');
  assert(core && backup, 'usage: <apply|rollback|dry-run> <coreDir> <backupDir>');
  const dist = path.join(core, 'dist');
  const pick = (re) => {
    const hits = fs.readdirSync(dist).filter((f) => re.test(f));
    assert.equal(hits.length, 1, `expected exactly one bundle for ${re}, got ${hits.length}`);
    return path.join(dist, hits[0]);
  };
  const targets = [pick(/^model-route-contract-[\w-]+\.js$/), pick(/^openai-chatgpt-provider-[\w-]+\.js$/)];
  const fns = [patchContract, patchSubscriptionProvider];
  const write = (f, s) => {
    const stat = fs.statSync(f), tmp = `${f}.gpt6.tmp`;
    fs.writeFileSync(tmp, s, { flag: 'wx', mode: stat.mode & 0o777 });
    fs.chownSync(tmp, stat.uid, stat.gid);
    fs.renameSync(tmp, f);
  };
  if (action === 'rollback') {
    const plan = JSON.parse(fs.readFileSync(path.join(backup, 'changes.json')));
    assert(plan.length > 0 && plan.every((x) => targets.includes(x.file)));
    for (const p of plan) assert.equal(fs.readFileSync(p.file, 'utf8'), p.after, 'Concurrent bundle change; rollback refused');
    for (const p of plan) write(p.file, p.before);
    console.log(JSON.stringify({ action, targets, backup }));
  } else {
    const plan = targets.map((f, i) => {
      const before = fs.readFileSync(f, 'utf8');
      return { file: f, before, after: fns[i](before) };
    });
    const changed = plan.filter((p) => p.before !== p.after);
    if (action === 'dry-run') {
      console.log(JSON.stringify({ action, changed: changed.map((p) => ({ file: p.file, delta: p.after.length - p.before.length })) }, null, 1));
    } else {
      assert(!fs.existsSync(backup), `backup dir already exists: ${backup}`);
      assert(changed.length > 0, 'nothing to do (already patched?)');
      fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(backup, 'changes.json'), JSON.stringify(plan), { mode: 0o600 });
      for (const p of changed) write(p.file, p.after);
      console.log(JSON.stringify({ action, targets, backup }));
    }
  }
}
