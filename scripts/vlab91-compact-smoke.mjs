import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
const root = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const { callGatewayFromCli } = await import(pathToFileURL(`${root}/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js`).href);
const call = (method, params) => callGatewayFromCli(method, { timeout: '600000', json: true }, params);
const suffix = Date.now().toString(36);
const key = `agent:makaron:explicit:vlab91-native-compact-${suffix}`;
const code = `V91-${randomBytes(8).toString('hex')}`;
const seedId = `vlab91-compact-seed-${suffix}`;
await call('chat.send', { sessionKey: key, agentId: 'makaron', deliver: false, timeoutMs: 300000, idempotencyKey: seedId,
  message: `VLab 独立验收，不处理任何业务，不调用工具、不写文件或记忆。请记住项目代号 ${code}，上线约束为先验收再部署、失败回滚。以下是无用重复日志，忽略即可。只回复 SEED_ACCEPTED。\n${'diagnostic padding '.repeat(5000)}` });
await call('agent.wait', { runId: seedId, timeoutMs: 300000 });
const before = await call('chat.history', { sessionKey: key, limit: 20 });
assert.equal(before.sessionInfo?.agentRuntime?.id, 'vlab-worker');
const started = Date.now();
const compact = await call('sessions.compact', { key, agentId: 'makaron' });
assert.equal(compact.ok, true);
assert.equal(compact.compacted, true);
assert.ok(compact.result?.tokensBefore > compact.result?.tokensAfter);
const compactMs = Date.now() - started;
const nextId = `vlab91-compact-continue-${suffix}`;
await call('chat.send', { sessionKey: key, agentId: 'makaron', deliver: false, timeoutMs: 300000, idempotencyKey: nextId,
  message: '不要调用工具、不写文件或记忆。请只输出此前我要求记住的完整项目代号，再简述此前的上线约束。不要猜测，不记得就明确说不记得。' });
await call('agent.wait', { runId: nextId, timeoutMs: 300000 });
const after = await call('chat.history', { sessionKey: key, limit: 20 });
const replies = after.messages.filter(m => m.role === 'assistant');
const last = replies.at(-1);
const text = typeof last?.content === 'string' ? last.content : (last?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n');
assert.ok(text.includes(code), 'Compaction lost the code (continuation did not restate it)');
assert.match(text, /验收/);
assert.match(text, /回滚/);
console.log(JSON.stringify({ ok: true, sessionKey: key, runtime: after.sessionInfo.agentRuntime.id, compactMs,
  tokensBefore: compact.result.tokensBefore, tokensAfter: compact.result.tokensAfter, blindRecall: true }));
