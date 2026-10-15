#!/usr/bin/env node
/**
 * Acceptance tests for the DingTalk peer-case patch.
 *
 * Unit part always runs. The functional part needs a writable *isolated copy* of
 * the 2026.9.1 core tree (never the live runtime):
 *
 *   cp -a /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core /tmp/dt-patch-core
 *   DINGTALK_PATCH_CORE=/tmp/dt-patch-core node --test tests/patch-openclaw91-dingtalk-peer-case.test.mjs
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

const PRETTY_FIXTURE = `const CASE_PRESERVING_PEERS = [{
\tchannel: "signal",
\tpeerKinds: /* @__PURE__ */ new Set(["group"]),
\tspan: "segment",
\tunscoped: true
}, {
\tchannel: "matrix",
\tpeerKinds: /* @__PURE__ */ new Set(["channel", "group"]),
\tspan: "tail",
\tunscoped: true
}];\n`;
const MIN_FIXTURE =
  'init_session_key_utils=__esmMin((()=>{init_string_coerce(),CASE_PRESERVING_PEERS=[{channel:`signal`,peerKinds:new Set([`group`]),span:`segment`,unscoped:!0},{channel:`matrix`,peerKinds:new Set([`channel`,`group`]),span:`tail`,unscoped:!0}],CASE_PRESERVING_PEER_PATTERNS=X;' + '}));\n';

test('unit: pretty bundle gains a segment-span descriptor for dingtalk-connector', () => {
  const { changed, source } = patchDingtalkPeerCase(PRETTY_FIXTURE, 'pretty');
  assert.equal(changed, true);
  assert.match(source, /channel: "dingtalk-connector"/);
  assert.match(source, /span: "segment"/);
  assert.match(source, /channel: "signal"/, 'existing descriptors stay');
  assert.match(source, /channel: "matrix"/, 'existing descriptors stay');
  assert.equal(patchDingtalkPeerCase(source, 'pretty').changed, false, 'apply is idempotent');
});

test('unit: minified worker bundle gains the same descriptor', () => {
  const { changed, source } = patchDingtalkPeerCase(MIN_FIXTURE, 'min');
  assert.equal(changed, true);
  assert.ok(
    source.startsWith(
      'init_session_key_utils=__esmMin((()=>{init_string_coerce(),CASE_PRESERVING_PEERS=[{channel:`dingtalk-connector`,peerKinds:new Set([`group`]),span:`segment`,unscoped:!0},{channel:`signal`,',
    ),
    'dingtalk-connector descriptor is prepended and existing entries stay',
  );
  assert.equal(patchDingtalkPeerCase(source, 'min').changed, false, 'apply is idempotent');
});

test('unit: a missing or ambiguous anchor fails loudly instead of patching nothing', () => {
  assert.throws(() => patchDingtalkPeerCase('const unrelated = 1;\n', 'pretty'), /anchor not found/);
  assert.throws(
    () => patchDingtalkPeerCase(`${PRETTY_FIXTURE}${PRETTY_FIXTURE}`, 'pretty'),
    /anchor not unique/,
  );
  assert.throws(
    () => patchDingtalkPeerCase('/* v-dingtalk-peer-case-v1 */\nconst other = 1;\n', 'pretty'),
    /partial or drifted/,
  );
});

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
