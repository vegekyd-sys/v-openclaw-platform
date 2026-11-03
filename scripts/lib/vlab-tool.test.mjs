import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultVlabTool } from './vlab-tool.mjs';

const MAC = '/Users/tianyicai/vlab-dev/lab/vlab.mjs';

test('the Mac keeps using its dev checkout', () => {
  assert.equal(defaultVlabTool({ env: {}, exists: (p) => p === MAC, home: '/Users/tianyicai' }), MAC);
});

test('V uses the dev checkout in its own home', () => {
  assert.equal(defaultVlabTool({ env: {}, exists: () => false, home: '/home/openclaw' }), '/home/openclaw/src/vlab-dev/lab/vlab.mjs');
});

test('VLAB_TOOL wins on any machine', () => {
  assert.equal(defaultVlabTool({ env: { VLAB_TOOL: '/x/lab/vlab.mjs' }, exists: () => true, home: '/h' }), '/x/lab/vlab.mjs');
});
