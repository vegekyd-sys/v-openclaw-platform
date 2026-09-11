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

export function workerExecutionConfig(current, original, base) {
  const c = structuredClone(current);
  assert.equal(c.gateway.port, 24993, 'VLab only');
  assert.equal(original.gateway.port, 24993, 'VLab worker source only');
  const pluginId = 'vlab-agent-worker-isolation';
  const workerPath = base + '/runtime/production-worker';
  assert.equal(original.plugins.entries[pluginId].enabled, true);
  assert.deepEqual(c.plugins.entries[pluginId].config, original.plugins.entries[pluginId].config);
  assert.equal(c.plugins.entries[pluginId].enabled, false);
  assert(original.plugins.allow.includes(pluginId));
  assert(!c.plugins.allow.includes(pluginId));
  assert(original.plugins.load.paths.includes(workerPath));
  assert(!c.plugins.load.paths.includes(workerPath));
  c.plugins.entries[pluginId].enabled = true;
  const allowIndex = original.plugins.allow.indexOf(pluginId);
  c.plugins.allow.splice(Math.min(allowIndex, c.plugins.allow.length), 0, pluginId);
  const loadIndex = original.plugins.load.paths.indexOf(workerPath);
  c.plugins.load.paths.splice(Math.min(loadIndex, c.plugins.load.paths.length), 0, workerPath);
  const workerModels = Object.entries(original.agents.defaults.models)
    .filter(([, value]) => value.agentRuntime?.id === 'vlab-worker');
  assert(workerModels.length > 0, 'Worker source has no routed models');
  for (const [key] of workerModels) {
    assert.equal(c.agents.defaults.models[key]?.agentRuntime?.id, 'openclaw', `Unexpected current runtime for ${key}`);
    c.agents.defaults.models[key].agentRuntime.id = 'vlab-worker';
  }
  return c;
}
