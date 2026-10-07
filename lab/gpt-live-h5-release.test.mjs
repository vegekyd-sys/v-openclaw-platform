import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { H5_PATHS, digest, validateIdentity, fileIdentity, validateSharedProof, assertH5Baseline, assertRollbackIdentity, freezeSource, remoteSource } from './gpt-live-h5-release.mjs';

const identity = { target: 'v', commit: 'a'.repeat(40), release: 'live-h5-release', owner: 'gpt-live-owner' };
const files = H5_PATHS.map(name => ({ name, content: Buffer.from(name).toString('base64'), sha: digest(name) }));
const request = { ...identity, files, filesSha: digest(JSON.stringify(fileIdentity(files))) };
const proof = { schema: 'gpt-live-h5-accepted-v1', release: identity.release, sourceCommit: identity.commit,
  h5FilesSha: request.filesSha, artifactSha: 'b'.repeat(64), h5AcceptanceSha: 'c'.repeat(64),
  runtimeFiles: [{ target: 'openclaw/dist/talk.js', after: 'd'.repeat(64) }] };
const receipt = { schema: 'gpt-live-h5-installed-v1', ...identity, dir: '/opt/openclaw-gpt-live-h5/releases/' + identity.commit,
  filesSha: request.filesSha, unitSha: 'e'.repeat(64) };
const observed = { pointer: receipt.dir, unitSha: receipt.unitSha, pid: 42, processMatches: true, activeCall: false, creatingSession: false, listener: 'owned' };

test('canonical merge commit is allowed; short SHAs and unsafe identity are refused', () => {
  validateIdentity(identity);
  for (const patch of [{ commit: 'abcdef1' }, { target: 'production' }, { owner: '../other' }, { release: 'a\nUser=root' }])
    assert.throws(() => validateIdentity({ ...identity, ...patch }));
});
test('source freeze reads the complete set of committed files and refuses dirty or different HEAD before reading assets', () => {
  const calls = [];
  const git = (...args) => { calls.push(args); if (args[0] === 'status') return ''; if (args[0] === 'rev-parse') return identity.commit; return Buffer.from(args[1]); };
  const frozen = freezeSource('/unused', identity, git);
  assert.equal(frozen.files.length, H5_PATHS.length); assert.equal(calls.filter(call => call[0] === 'show').length, H5_PATHS.length);
  assert(calls.filter(call => call[0] === 'show').every(call => call[1].startsWith(identity.commit + ':')));
  assert.equal(calls.some(call => call.includes('branch')), false, 'An accepted dev merge needs no OPEN PR or branch allowlist');
  for (const mode of ['dirty', 'head']) {
    let reads = 0;
    assert.throws(() => freezeSource('/unused', identity, (...args) => {
      if (args[0] === 'status') return mode === 'dirty' ? ' M app.js' : '';
      if (args[0] === 'rev-parse') return 'f'.repeat(40);
      reads++; return '';
    }));
    assert.equal(reads, 0);
  }
});
test('file whitelist and committed content hashes reject missing, reordered, foreign and altered input', () => {
  assert.equal(fileIdentity(files).length, H5_PATHS.length);
  assert.throws(() => fileIdentity(files.slice(1)));
  assert.throws(() => fileIdentity([...files].reverse()));
  assert.throws(() => fileIdentity([{ ...files[0], name: 'lab/../../secret' }, ...files.slice(1)]));
  assert.throws(() => fileIdentity([{ ...files[0], content: Buffer.from('other').toString('base64') }, ...files.slice(1)]));
});
test('production proof binds shared acceptance, runtime artifact and H5 file set to exact release/commit', () => {
  validateSharedProof(proof, request);
  for (const patch of [{ sourceCommit: 'f'.repeat(40) }, { release: 'other' }, { h5FilesSha: 'f'.repeat(64) }, { artifactSha: null },
    { h5AcceptanceSha: null }, { runtimeFiles: [] }, { runtimeFiles: [{ target: 'openclaw/../../outside', after: 'd'.repeat(64) }] }])
    assert.throws(() => validateSharedProof({ ...proof, ...patch }, request));
});
test('rollback rejects foreign source, owner, pointer, changed unit, active calls and missing busy fields', () => {
  assertRollbackIdentity(receipt, request, observed);
  for (const patch of [{ activeCall: true }, { creatingSession: true }, { activeCall: undefined }, { creatingSession: undefined },
    { processMatches: false }, { pointer: '/opt/other' }, { unitSha: 'f'.repeat(64) }])
    assert.throws(() => assertRollbackIdentity(receipt, request, { ...observed, ...patch }));
  for (const patch of [{ owner: 'other' }, { commit: 'f'.repeat(40) }, { release: 'other' }, { filesSha: 'f'.repeat(64) }])
    assert.throws(() => assertRollbackIdentity({ ...receipt, ...patch }, request, observed));
});
test('dead owned H5 may roll back without a busy probe only if its port is also empty', () => {
  assertRollbackIdentity(receipt, request, { ...observed, pid: 0, processMatches: false, activeCall: undefined, creatingSession: undefined, listener: '' });
  assert.throws(() => assertRollbackIdentity(receipt, request, { ...observed, pid: 0, listener: 'foreign process' }));
});
test('collected expired VLab transient unit may clean its pointer; a missing production unit or foreign listener may not', () => {
  const labRequest = { ...request, target: 'vlab' }, labReceipt = { ...receipt, target: 'vlab' };
  const collected = { ...observed, pid: 0, listener: '', unitSha: null, unitMissingCollected: true };
  assertRollbackIdentity(labReceipt, labRequest, collected);
  assert.throws(() => assertRollbackIdentity(receipt, request, collected));
  assert.throws(() => assertRollbackIdentity(labReceipt, labRequest, { ...collected, listener: 'foreign' }));
  assert.throws(() => assertRollbackIdentity(labReceipt, labRequest, { ...collected, unitMissingCollected: false }));
});
test('generated remote installer is valid standalone JavaScript without executing a service', () => {
  execFileSync(process.execPath, ['--check', '--input-type=module'], { input: remoteSource(), stdio: ['pipe', 'pipe', 'pipe'] });
});
test('H5-only release requires its own lease and an accepted aligned baseline; its commit may differ', () => {
  const current={release:identity.release,sourceCommit:'f'.repeat(40),artifactSha:proof.artifactSha,accepted:true,v:{aligned:true}};
  const manifest={sourceCommit:current.sourceCommit,artifactSha:current.artifactSha};
  assertH5Baseline(current,manifest,{owner:identity.owner},request);
  for(const patch of [{accepted:false},{v:{aligned:false}},{release:'other'}])assert.throws(()=>assertH5Baseline({...current,...patch},manifest,{owner:identity.owner},request));
  assert.throws(()=>assertH5Baseline(current,manifest,{owner:'foreign'},request));
  assert.throws(()=>assertH5Baseline(current,{...manifest,artifactSha:'f'.repeat(64)},{owner:identity.owner},request));
  validateSharedProof({...proof,h5Only:true},{...request,h5Only:true});
  assert.throws(()=>validateSharedProof({...proof,h5Only:true},request));
});
