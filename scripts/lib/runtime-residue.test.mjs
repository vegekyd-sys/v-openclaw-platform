import test from 'node:test';
import assert from 'node:assert/strict';
import {isResidue} from './runtime-residue.mjs';

test('real OpenClaw files are not residue', () => {
  for (const p of [
    'dist/agent-tools.before-tool-call-g2OT63u5.js',
    'dist/agent-tools.before-tool-call.decision-is7VdQQC.js',
    'dist/agent-tools.before-tool-call.runtime.js',
    'dist/control-ui/assets/control-ui-boot-chat-DWTSrxxk-rtc-v5.js',
    'dist/control-ui/assets/about-page-Qq-k9L77.js.br',
    'dist/control-ui/assets/about-page-DaPcd-9T.css.gz',
    'dist/index.js.map',
    'openclaw.plugin.json',
  ]) assert.equal(isResidue(p), false, p);
});

test('patching leftovers are residue', () => {
  for (const p of [
    'dist/monitor.account-WFdlCDhR.js.vlab91-feishu-display-v2.bak',
    'dist/bash-tools-DiAfkLAC.js.pre-worker-exec-config-domain-openclaw81-v1',
    'dist/talk-DkFuKRod.js.bak-owner-terminal-20260922-134058',
    'dist/tasks-DNVtnKlS.js.predeploy-20260917-213003',
    'native-attempt-bridge.mjs.postturn-finalization-v1.bak',
    'openclaw.plugin.json.bak-feishu-visible-progress-runtimes-v3',
    'dist/builtin-openclaw-zQV8Wwjr.js.before-memory-readonly',
    'dist/model-fallback-attempt-C1x1isxV.js.oc64-session-races-v2.bak',
    'x.conf.staged',
  ]) assert.equal(isResidue(p), true, p);
});
