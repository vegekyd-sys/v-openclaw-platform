// Workboard is optional in Worker plugin registries. Native dispatch grants only
// heartbeat/complete/block; the owning plugin must also exist in that registry.
// This transformer is used on private candidate configs. Applying it to a shared
// runtime still requires that runtime's normal lease and release procedure.
export function enableNativeWorkboardTools(config) {
  const next = structuredClone(config);
  next.plugins ??= {};
  if (Array.isArray(next.plugins.allow)) next.plugins.allow = [...new Set([...next.plugins.allow, 'workboard'])];
  next.plugins.entries ??= {};
  next.plugins.entries.workboard = {...next.plugins.entries.workboard, enabled: true};
  return next;
}
