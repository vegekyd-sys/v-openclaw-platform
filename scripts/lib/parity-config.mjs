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
//   plugins.entries.<id>.config.<path>.enabled
//                                    a few named switches inside a plugin's config
//                                    (PLUGIN_CONFIG_SWITCHES), reported only when set
//                                    to a boolean
//   channels.feishu.renderMode       the Feishu reply render mode, top level and the
//                                    distinct effective values across accounts, as
//                                    short lowercase words only
//
// `enabled` left unset counts as on, as OpenClaw reads it (`enabled !== false`),
// except inside plugin config, where only explicit booleans are kept.
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

// Switches inside plugin config that change what a Gateway or Worker does on a
// timer. memory-core dreaming: off on V, on in VLab (2026-10-06), and its
// cleanup blocked the VLab Gateway main thread for 2.9 s during r2 acceptance.
export const PLUGIN_CONFIG_SWITCHES = [['memory-core', ['dreaming']]];

// Channel settings that change when a reply card is created. Feishu renderMode
// "card" starts the streaming card at reply start; "auto" (the default) waits
// for the first status line or text, so a codex turn shows nothing until its
// first answer token. A VLab on "card" hides that wait (2026-10-07, #247).
// An account's own renderMode overrides the top level, as
// mergeFeishuAccountConfig does.
const RENDER_MODE_DEFAULT = 'auto';

function renderModeValue(value) {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' && /^[a-z]{1,16}$/.test(value) ? value : 'other';
}

function channelSettings(cfg) {
  const feishu = cfg?.channels?.feishu;
  if (!feishu || typeof feishu !== 'object') return {};
  const top = renderModeValue(feishu.renderMode);
  const out = { 'channels.feishu.renderMode': top ?? `${RENDER_MODE_DEFAULT} (unset)` };
  const accounts = feishu.accounts && typeof feishu.accounts === 'object' && !Array.isArray(feishu.accounts) ? Object.values(feishu.accounts) : [];
  if (accounts.length) {
    const effective = new Set(accounts.map((a) => renderModeValue(a && typeof a === 'object' ? a.renderMode : undefined) ?? top ?? RENDER_MODE_DEFAULT));
    out['channels.feishu.accounts.*.renderMode'] = [...effective].sort().join(',');
  }
  return out;
}

const SECTIONS = [
  ['mcp', (cfg) => cfg?.mcp?.servers, 'mcp.servers'],
  ['plugins', (cfg) => cfg?.plugins?.entries, 'plugins.entries'],
  ['pluginConfig', null, 'plugins.entries'],
  ['channels', null, null],
];

function pluginConfigSwitches(cfg) {
  const switches = {};
  for (const [id, keys] of PLUGIN_CONFIG_SWITCHES) {
    const value = keys.reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), cfg?.plugins?.entries?.[id]?.config)?.enabled;
    if (typeof value === 'boolean') switches[`${id}.config.${keys.join('.')}`] = value;
  }
  return switches;
}

// cfg: a parsed openclaw.json, or null when the host has no such file.
// Returns { mcp: { name: boolean }, plugins: { id: boolean }, pluginConfig: { path: boolean },
// channels: { path: string } } or null.
export function configSwitches(cfg) {
  if (cfg == null) return null;
  const out = {};
  for (const [key, pick] of SECTIONS) {
    if (key === 'pluginConfig') {
      out[key] = pluginConfigSwitches(cfg);
      continue;
    }
    if (key === 'channels') {
      out[key] = channelSettings(cfg);
      continue;
    }
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
// is 'config-differs' or 'config-expected' and v / vlab are 'true' | 'false' | 'absent'
// (channel settings: their short value, or 'absent').
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
        findings.push(finding(path ? `${role}: ${path}.${name}.enabled` : `${role}: ${name}`, va, vb, kind));
      }
    }
  }
  return { compared, findings };
}

function show(value) {
  if (typeof value === 'string') return value;
  return value === undefined ? 'absent' : value ? 'true' : 'false';
}

function finding(target, v, vlab, kind = 'config-differs') {
  return { target, component: 'config', kind, v, vlab, advisory: true };
}
