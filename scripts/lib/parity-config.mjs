// Advisory config comparison for scripts/vlab-v-parity.mjs (2026-10-06).
//
// Byte parity says nothing about config: VLab reported ALIGNED while its
// Gateway and Worker configs had MCP voice-memory enabled and V had it off, so
// every VLab Worker turn paid an MCP connect V never does (skewing 首字).
//
// Only a small allowlist of behavior switches is extracted, as names and
// booleans; nothing else of the config (env, command args, URLs, tokens) is
// kept, returned or printed:
//
//   mcp.servers.<name>.enabled       which servers exist, and whether each is on
//   plugins.entries.<id>.enabled     which plugin entries exist, and whether each is on
//
// `enabled` left unset counts as on, as OpenClaw reads it (`enabled !== false`).
// Differences are advisory: they never decide ALIGNED / AHEAD / DIVERGED,
// because channels, credentials and providers are meant to differ
// (AGENTS.md); they are reported so a measurement on VLab can be read with them.
//
// Two kinds of difference are not worth reading as drift:
//   - An MCP server that is absent on one side and off on the other: neither
//     host starts it, so it is not reported at all.
//   - A channel plugin entry: VLab keeps its own channels (2026-10-06, Tianyi:
//     「频道是vlab自己有一份」). These are reported as kind 'config-expected'
//     so they stay visible without reading as drift.

// Channel plugin entries VLab and V may each have on their own.
export const EXPECTED_CHANNEL_PLUGINS = new Set(['telegram', 'openclaw-plugin-xiaoai-cloud']);

const SECTIONS = [
  ['mcp', (cfg) => cfg?.mcp?.servers, 'mcp.servers'],
  ['plugins', (cfg) => cfg?.plugins?.entries, 'plugins.entries'],
];

// cfg: a parsed openclaw.json, or null when the host has no such file.
// Returns { mcp: { name: boolean }, plugins: { id: boolean } } or null.
export function configSwitches(cfg) {
  if (cfg == null) return null;
  const out = {};
  for (const [key, pick] of SECTIONS) {
    const section = pick(cfg);
    const switches = {};
    if (section && typeof section === 'object' && !Array.isArray(section)) {
      for (const name of Object.keys(section).sort()) {
        const entry = section[name];
        switches[name] = !(entry && typeof entry === 'object' && entry.enabled === false);
      }
    }
    out[key] = switches;
  }
  return out;
}

// v, vlab: { gateway: switches | null, worker: switches | null }, each from
// configSwitches(). Returns findings in the shape evaluateParity() uses, all
// advisory: { target, component: 'config', kind, v, vlab, advisory } where kind
// is 'config-differs' or 'config-expected' and v / vlab are 'true' | 'false' | 'absent'.
export function compareConfigSwitches({ v, vlab }) {
  const findings = [];
  let compared = 0;
  for (const role of ['gateway', 'worker']) {
    const a = v?.[role] ?? null;
    const b = vlab?.[role] ?? null;
    if (a == null && b == null) continue;
    if (a == null || b == null) {
      compared += 1;
      findings.push(finding(`${role}: config file`, a == null ? 'absent' : 'present', b == null ? 'absent' : 'present'));
      continue;
    }
    for (const [key, , path] of SECTIONS) {
      const names = [...new Set([...Object.keys(a[key] ?? {}), ...Object.keys(b[key] ?? {})])].sort();
      for (const name of names) {
        compared += 1;
        const va = show(a[key]?.[name]);
        const vb = show(b[key]?.[name]);
        if (va === vb) continue;
        if (key === 'mcp' && va !== 'true' && vb !== 'true') continue;
        const kind = key === 'plugins' && EXPECTED_CHANNEL_PLUGINS.has(name) ? 'config-expected' : 'config-differs';
        findings.push(finding(`${role}: ${path}.${name}.enabled`, va, vb, kind));
      }
    }
  }
  return { compared, findings };
}

function show(value) {
  return value === undefined ? 'absent' : value ? 'true' : 'false';
}

function finding(target, v, vlab, kind = 'config-differs') {
  return { target, component: 'config', kind, v, vlab, advisory: true };
}
