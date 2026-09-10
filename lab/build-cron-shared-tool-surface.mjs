// Extend the approved shared-Cron behavior to the real native tool-visibility gate.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const target='openclaw/dist/agent-tools-djVuP1H1.js',sha=b=>createHash('sha256').update(b).digest('hex');
const r=JSON.parse(execFileSync('ssh',['-C','-F','/Users/tianyicai/v-upgrade-private/20260904/ssh-config','-o','ControlPath=none','-o','ConnectTimeout=15','vlab91','sudo /opt/vlab/node-v22.23.1-linux-x64/bin/node /srv/vlab-production-mirror/labs/shared-workflow/tool/server.mjs'],{input:JSON.stringify({command:'read-code',target}),encoding:'utf8',timeout:120000,maxBuffer:8*1024**2}));
assert.equal(r.current.release,'three-fixes-20260910-v1');const before=Buffer.from(r.content,'base64').toString();assert.equal(sha(before),r.sha256);
const original='\tconst ownerOnlyCoreToolDenylist = options?.senderIsOwner === false ? GATEWAY_OWNER_ONLY_CORE_TOOLS.filter((toolName) => toolName !== "automations" || !cronCreatorAuthorityResolver) : [];';
assert.equal(before.split(original).length,2);
const replacement='\tconst sharedCronPrincipal = cronManagementPrincipalFromTurn({ ...options, sandboxed: Boolean(sandbox) });\n\tconst sharedCronManagementToolAvailable = Boolean(sharedCronPrincipal && readCronManagementPolicy()?.agents[executionAgentId]?.enabled === true);\n\tconst ownerOnlyCoreToolDenylist = options?.senderIsOwner === false ? GATEWAY_OWNER_ONLY_CORE_TOOLS.filter((toolName) => toolName !== "automations" || !(cronCreatorAuthorityResolver || sharedCronManagementToolAvailable)) : [];';
const imports='import { cronManagementPrincipalFromTurn, readCronManagementPolicy } from "./versa-cron-shared-management-v1.mjs";\n';
const after=imports+before.replace(original,replacement),source='lab/release-files/cron-shared-tool-surface.js';
fs.writeFileSync('lab/fixtures/cron-shared-tool-surface-before.js',before);fs.writeFileSync(source,after);
fs.writeFileSync('lab/cron-shared-tool-surface-plan.json',JSON.stringify({baseRelease:r.current.release,files:[{source,target,before:r.sha256}]},null,2)+'\n');
console.log(JSON.stringify({target,before:r.sha256,after:sha(after),source}));
