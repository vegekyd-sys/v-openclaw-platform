import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-remote-node-stable.mjs';
import { OUTPUT_DIR, PLAN } from './build-remote-node-stable.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const REMOTE = 'remote-CiV-Qx_e.js';
const read = () => fs.readFileSync(path.join(repo, OUTPUT_DIR, REMOTE), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('plan lists the patched file with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
});

test('release file carries the marker, parses, and refuses a second patch', () => {
  const out = read();
  assert(out.includes(MARKER));
  assert.throws(() => FILES[0].patch(out), /already patched/u);
  const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, REMOTE)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(sha(out), FILES[0].before);
});

// Run the patched module's own registry and eligibility code with its imports stubbed.
function loadRemote(env) {
  const src = read();
  const body = src.split('\n').filter((l) => !l.startsWith('import ') && !l.startsWith('export {')).join('\n');
  const bumps = [];
  const stubs = {
    normalizeOptionalString: (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
    normalizeLowercaseStringOrEmpty: (v) => (typeof v === 'string' ? v.toLowerCase() : ''),
    normalizeStringEntries: (v) => v,
    createSubsystemLogger: () => ({ info() {}, warn() {}, debug() {} }),
    listAgentWorkspaceDirs: () => [],
    bumpSkillsSnapshotVersion: (e) => bumps.push(e),
    removeRemoteNodeSkills: () => {},
    loadWorkspaceSkills: () => [],
    setRemoteSkillConnectionReconciler: () => {},
    recordRemoteSkillNodeInfo: () => {},
    updatePairedDeviceNodeSurfaceInTransaction: () => {},
    withPairedDeviceRecords: async () => ({}),
    resolveNodePairingGeneration: () => undefined,
    listNodePairing: async () => ({ paired: [] }),
  };
  const names = Object.keys(stubs);
  const fn = new Function(...names, 'process', `${body}\nreturn { recordRemoteNodeInfo, recordRemoteNodeBins, removeRemoteNodeInfo, getRemoteSkillEligibility };`);
  return { ...fn(...names.map((n) => stubs[n]), { env }), bumps };
}

const mac = (r, nodeId, displayName, bins) => {
  r.recordRemoteNodeInfo({ nodeId, connId: `c-${nodeId}`, pairingGeneration: 'g1', displayName, platform: 'macos', deviceFamily: 'Mac', commands: ['system.run', 'system.which'] });
  r.recordRemoteNodeBins(nodeId, bins, 'g1');
};

test('a laptop sleeping and reconnecting no longer changes the note or the bins', () => {
  const r = loadRemote({});
  mac(r, 'air', 'Tianyi Air Headless', []);
  mac(r, 'laptop', 'Tianyi Mac', ['ffmpeg']);
  mac(r, 'mba', 'MacBook Air (4)', []);
  const before = r.getRemoteSkillEligibility();
  assert.equal(before.note, 'Paired macOS nodes: MacBook Air (4), Tianyi Air Headless, Tianyi Mac. Run macOS-only skills via exec host=node on one of them; a node that is asleep or offline fails the call.');
  r.removeRemoteNodeInfo('laptop');
  assert.equal(r.getRemoteSkillEligibility().note, before.note, 'asleep');
  assert.equal(r.getRemoteSkillEligibility().hasBin('ffmpeg'), true, 'the last probe result stays while it sleeps');
  mac(r, 'laptop', 'Tianyi Mac', ['ffmpeg']);
  assert.equal(r.getRemoteSkillEligibility().note, before.note, 'reconnected last, same note');
  for (const id of ['air', 'laptop', 'mba']) r.removeRemoteNodeInfo(id);
  assert.equal(r.getRemoteSkillEligibility().note, before.note, 'every Mac offline');
});

test('a connected node reports its current probe; legacy projections are never remembered', () => {
  const r = loadRemote({});
  mac(r, 'laptop', 'Tianyi Mac', ['ffmpeg']);
  r.recordRemoteNodeBins('laptop', [], 'g1');
  assert.equal(r.getRemoteSkillEligibility().hasBin('ffmpeg'), false);
  const legacy = loadRemote({});
  legacy.recordRemoteNodeInfo({ nodeId: 'old', connId: 'c', displayName: 'Old', platform: 'darwin', commands: ['system.run'] });
  assert.match(legacy.getRemoteSkillEligibility().note, /Paired macOS nodes: Old\./u, 'a live node is shown as before');
  legacy.removeRemoteNodeInfo('old');
  assert.equal(legacy.getRemoteSkillEligibility(), undefined, 'but without a pairing generation it is not kept once it leaves');
});

test('OPENCLAW_REMOTE_NODE_STABLE_ELIGIBILITY=0 restores V\'s live-connection note byte for byte', () => {
  const r = loadRemote({ OPENCLAW_REMOTE_NODE_STABLE_ELIGIBILITY: '0' });
  mac(r, 'air', 'Tianyi Air Headless', []);
  mac(r, 'laptop', 'Tianyi Mac', []);
  assert.equal(r.getRemoteSkillEligibility().note, 'Remote macOS node available (Tianyi Air Headless, Tianyi Mac). Run macOS-only skills via exec host=node on that node.');
  r.removeRemoteNodeInfo('laptop');
  mac(r, 'laptop', 'Tianyi Mac', []);
  r.removeRemoteNodeInfo('air');
  mac(r, 'air', 'Tianyi Air Headless', []);
  assert.equal(r.getRemoteSkillEligibility().note, 'Remote macOS node available (Tianyi Mac, Tianyi Air Headless). Run macOS-only skills via exec host=node on that node.', 'the reorder this patch removes');
  r.removeRemoteNodeInfo('laptop');
  r.removeRemoteNodeInfo('air');
  assert.equal(r.getRemoteSkillEligibility(), undefined);
});
