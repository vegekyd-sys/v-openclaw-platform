// Configuration half of the V Experience multi-channel release (docs/v-experience.md
// sections 12-17). The runtime half (core command-auth V3, Telegram/DingTalk/WeCom
// patches, secret-entry core) ships as ordinary release files; this file only
// computes configuration, as pure functions, for:
//
//   production V  commands.allowFrom gains telegram, dingtalk-connector and wecom = ["*"],
//                 so non-owners on those channels get /model for their own session and
//                 nothing else (core V3 rule). Owners and every other key stay as they are;
//                 no channel, binding or plugin changes.
//   shared VLab   VLab's own test robots on DingTalk, WeCom and Telegram, as in the live
//                 candidate (lab/candidate/live-experience.mjs): channels with credentials
//                 as ${ENV} references (values stay in VLab's secrets.env), plugins allowed
//                 and enabled, bindings to makaron, the same commands.allowFrom, Telegram
//                 restricted to Tianyi (who is also its owner). Never production robots.
//
// Rollback is not an inverse transform: activation keeps the exact previous file and a
// receipt, and --rollback restores those bytes (see activate.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const CHANNELS = ['telegram', 'dingtalk-connector', 'wecom'];
export const COMMAND_CHANNELS = ['feishu', ...CHANNELS];
export const V3_MARKER = 'V_MODEL_COMMAND_ONLY_V3';
export const V2_MARKER = 'FEISHU_MODEL_COMMAND_ONLY_V2';
export const TELEGRAM_OWNER = '5368086561';
export const VLAB_AGENT = 'makaron';
// Secret names in VLab's secrets.env (the same ones live-experience.mjs reads).
export const VLAB_SECRETS = {
  dingtalk: ['VLAB_DINGTALK_TEST_CLIENT_ID', 'VLAB_DINGTALK_TEST_CLIENT_SECRET'],
  wecom: ['VLAB_WECOM_TEST_BOT_ID', 'VLAB_WECOM_TEST_SECRET'],
  telegram: ['VLAB_TELEGRAM_TEST_BOT_TOKEN'],
};
// DingTalk question card template: DingTalk's public sample (docs/v-experience.md
// section 10) on VLab; on V the same sample imported into V's own app V-Makaron
// (card platform template 「V 提问卡」, published 2026-10-06). A template only
// works for the apps it is linked to, so VLab's test robot keeps the public one.
export const VLAB_DINGTALK_CARD_TEMPLATE = '9f86e003-e65e-4680-bf4b-8df5958d9f17.schema';
export const PRODUCTION_DINGTALK_CARD_TEMPLATE = '99da3d5c-c916-4b89-b900-ca08ca8b5cdb.schema';

const ref = (name) => `\${${name}}`;
const isRef = (v) => typeof v === 'string' && /^\$\{[A-Z0-9_]+\}$/.test(v);

// The command-auth chunk V3 must be in the runtime before allowFrom widens:
// with V2 (Feishu only), a DingTalk/WeCom non-owner admitted by allowFrom gets
// every non-owner command. `source` = contents of dist/command-auth-*.js.
export function assertCommandAuthV3(source) {
  assert(source.includes(V3_MARKER), 'core command-auth V3 is not installed (lab/release-files/feishu-model-switch-roles); ship it before this config');
  assert(!source.includes(V2_MARKER), 'command-auth carries both V2 and V3');
  for (const c of COMMAND_CHANNELS) assert(source.includes(JSON.stringify(c)), `command-auth V3 does not cover ${c}`);
}

// Production V.
export function productionConfig(input) {
  const cfg = structuredClone(input);
  const commands = cfg.commands ?? {};
  const allowFrom = commands.allowFrom ?? {};
  assert(allowFrom && typeof allowFrom === 'object' && !Array.isArray(allowFrom), 'commands.allowFrom must be an object');
  assert.deepEqual(allowFrom.feishu, ['*'], 'expected commands.allowFrom.feishu = ["*"] (V since 10-04); review before widening');
  for (const c of CHANNELS) {
    if (allowFrom[c] !== undefined) assert.deepEqual(allowFrom[c], ['*'], `commands.allowFrom.${c} is already set to something else; review`);
    assert(cfg.channels?.[c], `channels.${c} is not configured on V; nothing to authorize`);
  }
  const next = {...allowFrom};
  for (const c of CHANNELS) next[c] = ['*'];
  const changed = CHANNELS.some((c) => allowFrom[c] === undefined);
  cfg.commands = {...commands, allowFrom: next};
  return {config: cfg, changed};
}

// Shared VLab. `secrets` = names present in VLab's secrets.env (never values).
export function vlabConfig(input, {secrets}) {
  const cfg = structuredClone(input);
  const have = (names) => names.every((n) => secrets.includes(n));
  for (const [id, names] of Object.entries(VLAB_SECRETS)) assert(have(names), `VLab secrets.env lacks ${names.filter((n) => !secrets.includes(n)).join(', ')} (${id} test robot)`);
  assert.equal(cfg.gateway?.port, 24993, 'not the shared VLab Gateway config');
  for (const c of CHANNELS) {
    const existing = cfg.channels?.[c];
    // Refuse anything but our own previous result: a production credential must never land here.
    if (existing) assert(Object.entries(existing).every(([k, v]) => !/(secret|token|clientId|botId)$/i.test(k) || isRef(v)),
      `channels.${c} has a literal credential; refusing to touch it`);
  }
  cfg.channels = {
    ...(cfg.channels ?? {}),
    'dingtalk-connector': {
      enabled: true, clientId: ref(VLAB_SECRETS.dingtalk[0]), clientSecret: ref(VLAB_SECRETS.dingtalk[1]),
      dmPolicy: 'open', groupPolicy: 'open', allowFrom: ['*'], groupAllowFrom: ['*'], requireMention: true,
      groupReplyMode: 'aicard', typingIndicator: true, separateSessionByConversation: true, groupSessionScope: 'group',
    },
    wecom: {
      enabled: true, connectionMode: 'websocket', botId: ref(VLAB_SECRETS.wecom[0]), secret: ref(VLAB_SECRETS.wecom[1]),
      dmPolicy: 'open', groupPolicy: 'open', allowFrom: ['*'], groupAllowFrom: ['*'],
    },
    telegram: {
      enabled: true, botToken: ref(VLAB_SECRETS.telegram[0]), dmPolicy: 'allowlist', allowFrom: [TELEGRAM_OWNER], groupAllowFrom: [TELEGRAM_OWNER],
    },
  };
  const plugins = cfg.plugins ?? {};
  const entries = {...(plugins.entries ?? {})};
  const allow = Array.isArray(plugins.allow) ? [...plugins.allow] : plugins.allow;
  for (const id of ['dingtalk-connector', 'wecom-openclaw-plugin', 'telegram']) {
    entries[id] = {...(entries[id] ?? {}), enabled: true};
    if (Array.isArray(allow) && !allow.includes(id)) allow.push(id);
  }
  cfg.plugins = {...plugins, entries, ...(allow === undefined ? {} : {allow})};
  const bindings = [...(cfg.bindings ?? [])];
  for (const c of CHANNELS) {
    const mine = bindings.filter((b) => b?.match?.channel === c);
    assert(mine.every((b) => b.agentId === VLAB_AGENT), `bindings for ${c} point elsewhere; review`);
    if (!mine.length) bindings.push({agentId: VLAB_AGENT, match: {channel: c}});
  }
  cfg.bindings = bindings;
  const commands = cfg.commands ?? {};
  const allowFrom = {...(commands.allowFrom ?? {})};
  for (const c of COMMAND_CHANNELS) allowFrom[c] = ['*'];
  const owners = [...new Set([...(commands.ownerAllowFrom ?? []), `telegram:${TELEGRAM_OWNER}`])];
  cfg.commands = {...commands, allowFrom, ownerAllowFrom: owners};
  return {config: cfg, changed: JSON.stringify(cfg) !== JSON.stringify(input)};
}

// Systemd drop-ins this release adds to the shared VLab Gateway unit. secrets.env
// is already an EnvironmentFile of that unit; listed again only if it is not.
export function vlabDropins({environmentFiles, secretsFile}) {
  const out = {'97-v-experience-dingtalk-card.conf': `[Service]\nEnvironment=V_DINGTALK_QUESTION_CARD_TEMPLATE=${VLAB_DINGTALK_CARD_TEMPLATE}\n`};
  if (!environmentFiles.includes(secretsFile)) out['97-v-experience-secrets.conf'] = `[Service]\nEnvironmentFile=${secretsFile}\n`;
  return out;
}

// The drop-in V's Gateway unit gets: the question card template only.
export function productionDropins() {
  return {'97-v-experience-dingtalk-card.conf': `[Service]\nEnvironment=V_DINGTALK_QUESTION_CARD_TEMPLATE=${PRODUCTION_DINGTALK_CARD_TEMPLATE}\n`};
}

// Names (not values) defined in an env file.
export const envNames = (text) => text.split(/\r?\n/).map((l) => /^\s*(?:export\s+)?([A-Z0-9_]+)=/.exec(l)?.[1]).filter(Boolean);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [target, file, ...rest] = process.argv.slice(2);
  assert(['production', 'vlab'].includes(target) && file, 'usage: node config.mjs production|vlab /absolute/openclaw.json [--secrets /abs/secrets.env]');
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  const secrets = rest[0] === '--secrets' ? envNames(fs.readFileSync(rest[1], 'utf8')) : [];
  const {config, changed} = target === 'production' ? productionConfig(input) : vlabConfig(input, {secrets});
  // Plan only: paths and values without credentials (all credentials are ${ENV} references).
  console.log(JSON.stringify({file, target, changed, commands: config.commands?.allowFrom,
    channels: target === 'vlab' ? Object.keys(config.channels ?? {}) : undefined,
    bindings: target === 'vlab' ? config.bindings.filter((b) => CHANNELS.includes(b?.match?.channel)) : undefined}, null, 1));
}
