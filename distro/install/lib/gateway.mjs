// Talk to the installed Gateway over its own RPC client (the same one
// platform/lab-probe.mjs uses): health, and a real model -> tool -> final
// reply check whose session stays behind so an update can prove it survived.

import fs from 'node:fs';
import path from 'node:path';

export async function connect({ releaseDir, port, token, timeoutMs = 20000 }) {
  const runtime = path.join(releaseDir, 'core/dist/plugin-sdk/gateway-runtime.js');
  const { GatewayClient } = await import(runtime);
  let client;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { client?.stop(); reject(new Error('gateway connect deadline')); }, timeoutMs);
    client = new GatewayClient({
      url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: 'cli', mode: 'cli',
      scopes: ['operator.read', 'operator.write', 'operator.admin'],
      onHelloOk: () => { clearTimeout(timer); resolve(); },
      onConnectError: (e) => { clearTimeout(timer); client.stop(); reject(e); },
    });
    client.start();
  });
  return {
    call: (method, params = {}, ms = 45000) => client.request(method, params, { timeoutMs: ms }),
    stop: () => client.stop(),
  };
}

/** Poll until the Gateway answers health; returns { health, workers, elapsedMs }. */
export async function waitHealthy(opts, { deadlineMs = 300000, log = () => {} } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < deadlineMs) {
    try {
      const gw = await connect({ ...opts, timeoutMs: 10000 });
      try {
        const health = await gw.call('health', {}, 20000);
        let workers = null;
        try { workers = await gw.call('vlab.workers.status', {}, 20000); } catch (e) { workers = { error: String(e.message ?? e) }; }
        return { health, workers, elapsedMs: Date.now() - start };
      } finally { gw.stop(); }
    } catch (e) {
      last = e;
      log(`gateway not ready yet: ${String(e.message ?? e).slice(0, 160)}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error(`gateway not healthy after ${deadlineMs} ms: ${last?.message ?? last}`);
}

const text = (m) => (typeof m.content === 'string' ? m.content : JSON.stringify((m.content ?? []).filter((c) => c.type === 'text')));

/** Earlier passed probes must still have their tool result and final reply. */
export async function checkHistory(gw, agentId, evidenceDir) {
  const results = [];
  if (!fs.existsSync(evidenceDir)) return results;
  for (const file of fs.readdirSync(evidenceDir).filter((f) => f.endsWith('.json')).sort()) {
    const prior = JSON.parse(fs.readFileSync(path.join(evidenceDir, file), 'utf8'));
    if (!prior.passed) continue;
    const h = await gw.call('chat.history', { agentId, sessionKey: prior.key, limit: 20 });
    const messages = h.messages ?? [];
    const toolOk = messages.some((x) => x.role === 'toolResult' && text(x).includes(prior.toolMarker));
    const finalOk = messages.some((x) => x.role === 'assistant' && text(x).includes(prior.finalMarker));
    results.push({ key: prior.key, version: prior.version, toolOk, finalOk });
  }
  return results;
}

/**
 * One real turn: the model must call exec, see the tool output and reply with a
 * marker. The session is a dedicated probe session, never the owner's chat.
 */
export async function probe(gw, { agentId, version, evidenceDir, model, deadlineMs = 300000 }) {
  const stamp = Date.now();
  const id = `vdistro-probe-${stamp}`;
  const key = `agent:${agentId}:explicit:${id}`;
  const toolMarker = `VDISTRO_${stamp}_TOOL`;
  const finalMarker = `VDISTRO_${stamp}_DONE`;
  const record = { key, version, toolMarker, finalMarker, startedAt: new Date(stamp).toISOString(), passed: false };
  let runId;
  let terminal;
  try {
    if (model) await gw.call('sessions.patch', { key, agentId, model, label: id });
    const accepted = await gw.call('chat.send', {
      agentId, sessionKey: key, idempotencyKey: id, deliver: false, thinking: 'low', timeoutMs: deadlineMs,
      message: `这是安装验收。不要读写任何文件、记忆或配置，不联网，不发消息，不委派。只调用一次 exec 执行 printf '${toolMarker}\\n'，核对工具真实输出后，最终只回复 ${finalMarker}。失败请如实说明。`,
    });
    runId = accepted.runId ?? id;
    const until = Date.now() + deadlineMs;
    while (Date.now() < until) {
      const wait = await gw.call('agent.wait', { runId, timeoutMs: 1 });
      if (!['running', 'timeout'].includes(wait.status)) { terminal = wait.status; break; }
      await new Promise((r) => setTimeout(r, 3000));
    }
    const h = await gw.call('chat.history', { agentId, sessionKey: key, limit: 20 });
    const messages = h.messages ?? [];
    const assistants = messages.filter((x) => x.role === 'assistant');
    Object.assign(record, {
      runId, terminal, elapsedMs: Date.now() - stamp,
      runtime: h.sessionInfo?.agentRuntime?.id ?? null,
      models: [...new Set(assistants.map((x) => x.model).filter(Boolean))],
      toolCalls: assistants.flatMap((x) => (Array.isArray(x.content) ? x.content.filter((c) => c.type === 'toolCall').map((c) => c.name) : [])),
      toolResult: messages.some((x) => x.role === 'toolResult' && text(x).includes(toolMarker)),
      finalReply: assistants.some((x) => text(x).includes(finalMarker)),
      errors: messages.filter((x) => x.isError || x.stopReason === 'error').map((x) => text(x).slice(0, 300)),
    });
    record.passed = terminal === 'ok' && record.toolResult && record.finalReply && record.errors.length === 0;
  } catch (e) {
    record.error = String(e.message ?? e).slice(0, 500);
    if (runId && !terminal) { try { await gw.call('chat.abort', { sessionKey: key, runId }); } catch {} }
  }
  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, `${stamp}.json`), `${JSON.stringify(record, null, 2)}\n`);
  }
  return record;
}
