// Installs the vapp channel (apps/v-experience/app/, copied to
// extensions/vapp by the plan) into a prepared candidate: plugin, channel
// config, binding and owner, in the Gateway config and the Worker's own copy
// (the Worker resolves message-tool targets itself).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {AGENT} from './bound-task-support.mjs';

export function installVapp(c, {userId = 'tianyi', name = '天懿'} = {}) {
  const pluginDir = path.join(process.env.VLAB_CANDIDATE_RUNTIME, 'extensions', 'vapp');
  assert(fs.existsSync(path.join(pluginDir, 'v-experience.mjs')), 'vapp plugin installed with v-experience.mjs');
  const add = config => {
    config.plugins.load.paths.push(pluginDir);
    config.plugins.entries.vapp = {enabled: true};
    if (Array.isArray(config.plugins.allow)) config.plugins.allow.push('vapp');
    config.channels = {...(config.channels ?? {}), vapp: {enabled: true, defaultUser: userId, users: {[userId]: {name, owner: true}}}};
    config.bindings = [...(config.bindings ?? []), {agentId: AGENT, match: {channel: 'vapp'}}];
    config.messages = {...config.messages, queue: {...config.messages?.queue, mode: 'steer'}}; // as on V
    config.commands = {...(config.commands ?? {}), ownerAllowFrom: [...(config.commands?.ownerAllowFrom ?? []), `vapp:${userId}`]};
  };
  const edit = (file, change) => {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    change(config);
    fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600});
    return config;
  };
  const config = edit(c.configPath, add);
  edit(config.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath, add);
}
