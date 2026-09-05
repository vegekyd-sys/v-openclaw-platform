#!/usr/bin/env node
// Generates a private, channel-free QA instance on the lab host only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [source, root] = process.argv.slice(2);
if (!source || !root?.startsWith('/srv/vlab-control-ui-qa-')) throw new Error('Expected source config and isolated /srv/vlab-control-ui-qa-* root');
const sourceConfig = JSON.parse(fs.readFileSync(source, 'utf8'));
if (!sourceConfig.models?.providers?.deepseek) throw new Error('DeepSeek lab provider missing');
const dirs = ['state', 'workspace', 'home', 'codex'];
for (const dir of dirs) fs.mkdirSync(path.join(root, dir), { recursive: true, mode: 0o700 });
const target = path.join(root, 'state/openclaw.json');
if (fs.existsSync(target)) throw new Error('Refusing to overwrite existing QA config');
const provider = structuredClone(sourceConfig.models.providers.deepseek);
// The source lab may route this provider through its Worker plugin. This QA
// instance intentionally tests the native Control UI transport, without plugins.
delete provider.agentRuntime;
if (typeof provider.apiKey !== 'string' || provider.apiKey.includes('${')) throw new Error('Resolve lab provider SecretRef locally before generating profile');
const config = {
  models: { providers: { deepseek: provider } },
  agents: { defaults: { workspace: path.join(root, 'workspace'), model: { primary: 'deepseek/deepseek-v4-pro' } }, list: [{ id: 'control-ui-qa', name: 'Control UI QA' }] },
  cron: { enabled: false },
  channels: {},
  gateway: { mode: 'local', bind: 'loopback', port: 25993, auth: { mode: 'token', token: crypto.randomBytes(32).toString('hex') }, trustedProxies: ['127.0.0.1/32'], controlUi: { basePath: '/control-ui-qa', allowedOrigins: ['http://127.0.0.1:25993', 'http://127.0.0.1:25994', 'https://openclaw.tianyi.live'] } },
};
fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n', {mode:0o600,flag:'wx'});
fs.writeFileSync(path.join(root,'workspace/AGENTS.md'), 'This is an isolated Control UI QA agent. Respond only to explicit QA prompts. Never change configuration, start background work, contact people, or access other workspaces.\n', {mode:0o600,flag:'wx'});
console.log(JSON.stringify({root, port:25993, agent:'control-ui-qa', channels:0, cron:false, secretsPrinted:false}));
