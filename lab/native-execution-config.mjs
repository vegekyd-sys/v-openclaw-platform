import assert from 'node:assert/strict';
export function nativeExecutionConfig(original, base) {
  const c = structuredClone(original);
  assert.equal(c.gateway.port, 24993, 'VLab only');
  assert.equal(c.plugins.entries['vlab-agent-worker-isolation'].enabled, true);
  c.plugins.entries['vlab-agent-worker-isolation'].enabled = false;
  c.plugins.allow = c.plugins.allow.filter(x => x !== 'vlab-agent-worker-isolation');
  c.plugins.load.paths = c.plugins.load.paths.filter(x => x !== base + '/runtime/production-worker');
  for (const v of Object.values(c.agents.defaults.models)) {
    if (v.agentRuntime?.id === 'vlab-worker') v.agentRuntime.id = 'openclaw';
  }
  return c;
}
