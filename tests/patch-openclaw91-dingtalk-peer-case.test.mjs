#!/usr/bin/env node
/**
 * Acceptance tests for the DingTalk peer-case patch.
 *
 * Unit part (CI). The functional part is in
 * patch-openclaw91-dingtalk-peer-case.live.test.mjs and needs a writable *isolated copy* of
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
      'init_session_key_utils=__esmMin((()=>{init_string_coerce(),CASE_PRESERVING_PEERS=[{channel:`dingtalk-connector`,peerKinds:new Set([`group`,`channel`]),span:`segment`,unscoped:!0},{channel:`signal`,',
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
