import assert from 'node:assert/strict';
export function restoreMemoryToolPolicy(config) {
  const c=structuredClone(config);
  assert.equal(c.gateway.port,24993,'VLab only');
  assert(c.plugins?.enabled!==false,'Do not override disabled plugins');
  assert(!c.plugins?.deny?.includes('memory-core'),'Do not override explicit deny');
  assert(c.plugins?.entries?.['memory-core']?.enabled!==false,'Do not override disabled Memory');
  assert(!c.plugins?.slots?.memory||c.plugins.slots.memory==='memory-core','Do not override another Memory owner');
  assert(Array.isArray(c.plugins.allow)&&c.plugins.allow.length>0,'Expected restrictive allowlist');
  if(!c.plugins.allow.includes('memory-core'))c.plugins.allow.push('memory-core');
  return c;
}
