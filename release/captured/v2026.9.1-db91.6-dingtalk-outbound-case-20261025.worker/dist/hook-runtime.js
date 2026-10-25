// Fake SDK sibling for fake-agent-runtime.mjs tests only. Production resolves
// this name beside OpenClaw's real plugin-sdk/agent-runtime.js, not this file.
export function initializeGlobalHookRunner(registry) {
  if (!registry || typeof registry !== 'object') throw new Error('Missing fake prepared registry');
}
