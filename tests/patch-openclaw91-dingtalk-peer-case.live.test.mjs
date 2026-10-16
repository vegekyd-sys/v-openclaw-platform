#!/usr/bin/env node
/**
 * Functional acceptance for the DingTalk peer-case patch. Needs a writable *isolated copy* of
 * the 2026.9.1 core tree (never the live runtime):
 *
 *   cp -a /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core /tmp/dt-patch-core
 *   DINGTALK_PATCH_CORE=/tmp/dt-patch-core node --test tests/patch-openclaw91-dingtalk-peer-case.live.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { patchDingtalkPeerCase } from '../scripts/patch-openclaw91-dingtalk-peer-case.mjs';

const run = promisify(execFile);
const PATCHER = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'scripts',
  'patch-openclaw91-dingtalk-peer-case.mjs',
);
const CORE = process.env.DINGTALK_PATCH_CORE;
const GROUP_ID = 'cidvcoS13FzQXFw5ZNRTUMU2Q==';
const FOLDED_GROUP_ID = 'cidvcos13fzqxfw5znrtumu2q==';

async function loadChunk(coreRoot, tag) {
  const file = path.join(coreRoot, 'dist', 'session-key-CRjxKW0X.js');
  return import(`${pathToFileURL(file).href}?${tag}`);
}

async function patcher(coreRoot, mode) {
  const { stdout } = await run(process.execPath, [PATCHER, coreRoot, mode]);
  return JSON.parse(stdout);
}

const groupKey = (mod) => mod.o({
  agentId: 'makaron',
  mainKey: 'main',
  channel: 'dingtalk-connector',
  accountId: '__default__',
  peerKind: 'group',
  peerId: GROUP_ID,
  dmScope: 'main',
  groupScope: 'per-group',
});

test('functional: dingtalk group session keys keep the exact openConversationId', { skip: !CORE && 'set DINGTALK_PATCH_CORE to an isolated core copy' }, async () => {
  const baseline = await loadChunk(CORE, 'baseline');
  const foldedKey = groupKey(baseline);
  assert.equal(
    foldedKey,
    `agent:makaron:dingtalk-connector:group:${FOLDED_GROUP_ID}`,
    'baseline reproduces the reported folding (this is the bug)',
  );

  const applied = await patcher(CORE, '--apply');
  assert.equal(applied.mode, '--apply');
  assert.equal(applied.report.length, 2, 'both the dist chunk and the worker bundle are patched');
  assert.ok(applied.report.every((entry) => entry.action === 'patched'));

  const patched = await loadChunk(CORE, 'patched');
  assert.equal(
    groupKey(patched),
    `agent:makaron:dingtalk-connector:group:${GROUP_ID}`,
    'patched key preserves case, so derived DingTalk targets are valid',
  );
  assert.equal(
    patched.o({ agentId: 'makaron', mainKey: 'main', channel: 'feishu', accountId: 'default', peerKind: 'group', peerId: 'OC_AbCdEf' , groupScope: 'per-group'}).endsWith('oc_abcdef'),
    true,
    'unrelated channels keep the previous lowercase folding',
  );
  assert.equal(
    patched.N(groupKey(patched)),
    false,
    'segment span keeps the permissive folded-alias fallback (no session split)',
  );
  assert.ok(patched.O(foldedKey)?.agentId === 'makaron', 'old folded session keys still parse');
  assert.equal(
    patched.D({ channel: 'dingtalk-connector', peerKind: 'group', peerId: GROUP_ID }),
    GROUP_ID,
  );

  const recheck = await patcher(CORE, '--check');
  assert.ok(recheck.report.every((entry) => entry.changed === false), 'second apply is a no-op');

  await patcher(CORE, '--rollback');
  const rolled = await loadChunk(CORE, 'rolled-back');
  assert.equal(groupKey(rolled), `agent:makaron:dingtalk-connector:group:${FOLDED_GROUP_ID}`);

  // rollback must not clobber a file that changed after the patch was applied
  await patcher(CORE, '--apply');
  const prettyFile = path.join(CORE, 'dist', 'session-key-CRjxKW0X.js');
  const patchedText = await readFile(prettyFile, 'utf8');
  await writeFile(prettyFile, `${patchedText}\n// drift-from-a-later-change\n`);
  const drifted = await patcher(CORE, '--rollback');
  assert.ok(
    drifted.report.some((entry) => entry.action === 'refused-drifted'),
    'rollback refuses when the patched file drifted',
  );
  await writeFile(prettyFile, await readFile(`${prettyFile}.v-dingtalk-peer-case-v1.bak`, 'utf8'));
  const settled = await patcher(CORE, '--rollback');
  assert.ok(
    settled.report.every((entry) => ['rolled-back', 'already-rolled-back'].includes(entry.action)),
    'rollback completes once the copy is back to the patched content',
  );
});
