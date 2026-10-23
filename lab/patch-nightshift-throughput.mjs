import { createHash } from 'node:crypto';

// nightshift-throughput (V 2026-10-22, 16-core / 61 GiB host): three changes for Night Shift
// card sessions, shipped together so the Gateway restarts once.
//
// 1. Worker pool above 16. The worker plugin's manifest schema caps maxWorkers at 16 and
//    warmSpareWorkers at 15; core's plugin loader skips a plugin whose config fails its schema,
//    so maxWorkers=24 would load no Worker pool at all. The caps rise to 32 / 31. The pool size
//    itself stays in openclaw.json (v-self-restart --set ...maxWorkers=24).
// 2. No memory flush on Workboard card sessions. runMemoryFlushIfNeeded served every caller
//    (the agent command's post-turn flush, the pre-reply flush, the deferred flush) for
//    `agent:<id>:subagent:workboard-<board>-<card>` sessions like a person's chat. On V
//    2026-10-12..22, 55-90% of the makaron agent's daily memory files were card runs' logs, and
//    the flush, holding only read/write tools, wrote "the previous run was fake" retractions of
//    real outputs. Card sessions now skip it the way incognito sessions do; chats are unchanged.
// 3. Card notes reach the agent whole. buildWorkerContext cut notes at 4,000 characters while
//    the board stores up to 12,000; Night Shift briefs are 4.4-11.5k and lost their safety,
//    paid-ledger and stop-report rules. The cap is now the board's own 12,000.
export const MARKER = 'v-nightshift-throughput-v1';
export const RELEASE_DIR = 'lab/release-files/nightshift-throughput';

export const FILES = {
  'runtime-api-1CCazqtv.js': {
    from: 'lab/release-files/gateway-fullread-hotpaths/runtime-api-1CCazqtv.js',
    target: 'openclaw/dist/runtime-api-1CCazqtv.js',
    before: '3300629f0920483989b4f214fc9e02fe849a48b3fc26335d4d03b93fc16b9e23',
    replacements: [[
      'if (card.notes) lines.push("", "## Notes", capText(card.notes, 4e3) ?? "");',
      `if (card.notes) lines.push("", "## Notes", capText(card.notes, 12e3) ?? ""); // ${MARKER}: the board's own notes limit`,
    ]],
  },
  'agent-runner-memory-7VF-zwNt.js': {
    from: 'lab/release-files/memory-flush-defer/agent-runner-memory-7VF-zwNt.js',
    target: 'openclaw/dist/agent-runner-memory-7VF-zwNt.js',
    before: '7d5eaa388e1c0399983236a22df0c7906e0cbb7a4fd8b74b755906176bd0142f',
    replacements: [[
      `	if (entry?.incognito === true || isIncognitoSessionKey(params.sessionKey)) return {
		sessionEntry: entry,
		outcome: "skipped"
	};
`,
      `	if (entry?.incognito === true || isIncognitoSessionKey(params.sessionKey)) return {
		sessionEntry: entry,
		outcome: "skipped"
	};
	// ${MARKER}: a Workboard card session reports in its card, not in the agent's memory.
	if (isWorkboardCardSessionKey(params.sessionKey)) return {
		sessionEntry: entry,
		outcome: "skipped",
		...params.memoryFlushDeferred === true ? { skipReason: "workboard-card" } : {}
	};
`,
    ], [
      'async function runMemoryFlushIfNeeded(params) {',
      `function isWorkboardCardSessionKey(sessionKey) {
	return /^agent:[^:]+:subagent:workboard-[^:]+$/u.test(String(sessionKey ?? "").trim().toLowerCase());
}
async function runMemoryFlushIfNeeded(params) {`,
    ]],
  },
  'openclaw.plugin.json': {
    from: 'lab/release-files/worker-memory-recycle/production-worker-openclaw.plugin.json',
    target: 'production-worker/openclaw.plugin.json',
    before: '1ec103e333e8f7562f14f81822ef853ccfd581e2c21f172da89243c3952644f6',
    replacements: [[
      `      "maxWorkers": {
        "type": "integer",
        "minimum": 1,
        "maximum": 16
      },`,
      `      "maxWorkers": {
        "type": "integer",
        "minimum": 1,
        "maximum": 32
      },`,
    ], [
      `      "warmSpareWorkers": {
        "type": "integer",
        "minimum": 0,
        "maximum": 15
      },`,
      `      "warmSpareWorkers": {
        "type": "integer",
        "minimum": 0,
        "maximum": 31
      },`,
    ]],
  },
};

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function patchFile(name, source) {
  const spec = FILES[name];
  if (!spec) throw new Error(`no patch for ${name}`);
  if (sha256(source) !== spec.before) throw new Error(`${name}: unexpected input ${sha256(source)}`);
  let out = source;
  for (const [from, to] of spec.replacements) {
    const count = out.split(from).length - 1;
    if (count !== 1) throw new Error(`${name}: expected one match, found ${count}: ${from.slice(0, 60)}`);
    out = out.replace(from, () => to);
  }
  return out;
}
