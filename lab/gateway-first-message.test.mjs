import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAX_PREWARM_AGENTS, REPLY_FIRST_MESSAGE_MODULES, patchGetReplyChunk, patchPostAttach, patchReplyFacade } from './patch-gateway-first-message.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const getReply = read('../release/captured/v2026.9.1-db91.6-workboard-incremental-sweep-20261006/dist/get-reply-CqW1y05D.js');
const facade = read('./fixtures/gateway-first-message/get-reply-from-config.runtime-CWdWv_c6.js');
const postAttach = read('./fixtures/gateway-first-message/server-startup-post-attach-BPE6Pv6n.js');
const released = (name) => read(`./release-files/gateway-first-message/${name}`);

test('release files are V\'s files with only the first-message change', () => {
  assert.equal(patchGetReplyChunk(getReply), released('get-reply-CqW1y05D.js'));
  assert.equal(patchReplyFacade(facade), released('get-reply-from-config.runtime-CWdWv_c6.js'));
  assert.equal(patchPostAttach(postAttach), released('server-startup-post-attach-BPE6Pv6n.js'));
  assert.throws(() => patchGetReplyChunk(released('get-reply-CqW1y05D.js')), /agent id import|get-reply exports/);
  assert.throws(() => patchReplyFacade(released('get-reply-from-config.runtime-CWdWv_c6.js')), /facade import/);
  assert.throws(() => patchPostAttach(released('server-startup-post-attach-BPE6Pv6n.js')), /dashboard prewarm item list/);
});

test('the prewarm calls ensureSkillSnapshot the way get-reply does, without anything to persist into', () => {
  const out = released('get-reply-CqW1y05D.js');
  // get-reply's own call: the same function, workspace, execution skills dir and config
  assert.match(getReply, /const \{ ensureSkillSnapshot \} = await loadSessionUpdatesRuntime\(\);\n\t\treturn await ensureSkillSnapshot\(\{/);
  assert.match(getReply, /executionSkillsDir: path\.join\(sessionEntry\?\.worktree\?\.canonicalWorkspaceDir \?\? context\.workspaceDir, "skills"\)/);
  assert.match(getReply, /const workspaceDirRawLocal = preparedWorkspaceDir \?\? resolveAgentWorkspaceDir\(cfg, agentId\) \?\? DEFAULT_AGENT_WORKSPACE_DIR;/);
  const body = out.slice(out.indexOf('async function prewarmReplyFirstMessage(params)'), out.indexOf('function loadEmbeddedAgentRuntime()'));
  assert(body.length > 0);
  assert.match(body, /resolveUserPath\(resolveAgentWorkspaceDir\(params\.cfg, agentId\) \?\? DEFAULT_AGENT_WORKSPACE_DIR\)/);
  assert.match(body, /executionSkillsDir: path\.join\(workspaceDir, "skills"\)/);
  assert.match(body, /isFirstTurnInSession: false/);
  const call = body.slice(body.indexOf('ensureSkillSnapshot({'), body.indexOf('});', body.indexOf('ensureSkillSnapshot({')));
  assert.doesNotMatch(call, /sessionStore|sessionEntryHandle|sessionEntry|storePath/);
  // names come from the chunk's own imports (plus resolveUserPath, the one the patch adds)
  for (const name of ['resolveAgentWorkspaceDir', 'DEFAULT_AGENT_WORKSPACE_DIR', 'normalizeAgentId']) assert.match(getReply, new RegExp(`^import \\{[^}]*\\b${name}\\b[^}]*\\} from `, 'm'), name);
  assert.match(out, /^import \{ c as resolveUserPath \} from "\.\/home-dir-BPhrG-aM\.js";$/m);
  assert.match(getReply, /^const groupsRuntimeLoader = createLazyImportLoader/m);
  assert.match(getReply, /^const sessionUpdatesRuntimeLoader = createLazyImportLoader/m);
});

test('ensureSkillSnapshot persists only through a session store or entry handle', () => {
  // the session-updates bytes V runs: both write paths need one of the two
  const updates = read('./fixtures/gateway-first-message/session-updates-DQXogl1j.js');
  const fn = updates.slice(updates.indexOf('async function ensureSkillSnapshot(params)'), updates.indexOf('async function incrementCompactionCount('));
  assert(fn.split('persistSessionEntryUpdate(').length - 1 === 2);
  assert.match(fn, /if \(isFirstTurnInSession && \(sessionEntryHandle \|\| sessionStore\) && sessionKey\) \{/);
  assert.match(fn, /if \(skillsSnapshot && \(sessionEntryHandle \|\| sessionStore\) && sessionKey && !isFirstTurnInSession/);
});

test('the module list is imported on its own and the agent list is bounded', () => {
  const out = released('get-reply-CqW1y05D.js');
  const body = out.slice(out.indexOf('async function prewarmReplyFirstMessage(params)'), out.indexOf('function loadEmbeddedAgentRuntime()'));
  assert.match(body, /Promise\.allSettled\(\[/);
  assert.deepEqual([...body.matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]), REPLY_FIRST_MESSAGE_MODULES);
  assert.match(body, new RegExp(`\\.slice\\(0, ${MAX_PREWARM_AGENTS}\\)`));
  assert.match(body, /catch \(error\) \{\n\t\t\tskillSnapshots\.push\(\{ agentId, ok: false/);
});

test('the item runs first in the existing post-ready prewarm list and can be turned off', () => {
  const out = released('server-startup-post-attach-BPE6Pv6n.js');
  assert.match(out, /const firstMessageItems = process\.env\.OPENCLAW_GATEWAY_FIRST_MESSAGE_PREWARM === "0" \? \[\] : \[\{\n\t\tname: "reply\.first-message",/);
  assert.match(out, /return \[\.\.\.firstMessageItems, \.\.\.agentIds\.map\(/);
  // the list is consumed by the idle-task scheduler that waits for no root work and logs failures
  assert.match(postAttach, /const items = params\.items \?\? dashboardDataPrewarmItems\(params\.cfgAtStart, params\.log\);/);
  assert.match(postAttach, /isBusy: \(\) => getActiveGatewayRootWorkCount\(\{ excludeCurrent: true \}\) > 0,/);
  assert.match(postAttach, /import \{ r as loadGetReplyFromConfigRuntime \} from "\.\/dispatch-from-config\.runtime\.js";/);
  assert.match(released('get-reply-from-config.runtime-CWdWv_c6.js'), /export \{ getReplyFromConfig, prewarmConfigDrivenReplyFirstMessage, prewarmConfigDrivenReplyRuntime \};/);
});

// Run the item and the get-reply prewarm against fakes.
function runPrewarm({ ensure, imports, agentIds }) {
  const out = released('get-reply-CqW1y05D.js');
  const src = out.slice(out.indexOf('async function prewarmReplyFirstMessage(params)'), out.indexOf('function loadEmbeddedAgentRuntime()')).replace(/import\(("[^"]+")\)/g, '__import($1)');
  const AsyncFunction = (async () => {}).constructor;
  const fn = new AsyncFunction('performance', 'path', 'sessionUpdatesRuntimeLoader', 'groupsRuntimeLoader', 'loadSessionUpdatesRuntime', 'normalizeAgentId', 'resolveUserPath', 'resolveAgentWorkspaceDir', 'DEFAULT_AGENT_WORKSPACE_DIR', '__import', 'params', `${src}\nreturn await prewarmReplyFirstMessage(params);`);
  return fn(performance, { join: (...p) => p.join('/') }, { load: async () => ({}) }, { load: async () => ({}) }, async () => ({ ensureSkillSnapshot: ensure }), (id) => id.toLowerCase(), (p) => p.replace('~', '/home'), (_cfg, id) => `~/ws-${id}`, '~/default', imports ?? (async () => ({})), { cfg: { c: 1 }, agentIds });
}

test('each agent gets ensureSkillSnapshot with get-reply\'s inputs and no store', async () => {
  const calls = [];
  const result = await runPrewarm({ agentIds: ['Makaron', 'makaron', 'dealclaw'], ensure: async (p) => { calls.push(p); return { skillsSnapshot: {} }; } });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { agentId: 'makaron', sessionKey: 'agent:makaron:feishu:group:gateway-prewarm', isFirstTurnInSession: false, workspaceDir: '/home/ws-makaron', executionSkillsDir: '/home/ws-makaron/skills', cfg: { c: 1 } });
  assert.equal(result.modules, `${REPLY_FIRST_MESSAGE_MODULES.length + 2}/${REPLY_FIRST_MESSAGE_MODULES.length + 2}`);
  assert.deepEqual(result.skillSnapshots.map((s) => [s.agentId, s.ok]), [['makaron', true], ['dealclaw', true]]);
});

test('a failing agent or module does not stop the others', async () => {
  const result = await runPrewarm({
    agentIds: ['a', 'b'],
    ensure: async (p) => { if (p.agentId === 'a') throw new Error('skills dir unreadable'); return { skillsSnapshot: {} }; },
    imports: async (m) => { if (m.includes('auth')) throw new Error('missing'); return {}; },
  });
  assert.deepEqual(result.skillSnapshots.map((s) => [s.agentId, s.ok]), [['a', false], ['b', true]]);
  assert.match(result.skillSnapshots[0].error, /skills dir unreadable/);
  assert.equal(result.modules, `${REPLY_FIRST_MESSAGE_MODULES.length + 1}/${REPLY_FIRST_MESSAGE_MODULES.length + 2}`);
});

test('more agents than the bound: only the first ones are prepared', async () => {
  const calls = [];
  await runPrewarm({ agentIds: Array.from({ length: MAX_PREWARM_AGENTS + 5 }, (_, i) => `agent${i}`), ensure: async (p) => { calls.push(p.agentId); return {}; } });
  assert.equal(calls.length, MAX_PREWARM_AGENTS);
});
