import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyToDist, BROKER_FILE, MARKER, patchSupervisor } from './patch-spawn-broker.mjs';

const SUPERVISOR = `import { spawn } from "node:child_process";
import crypto, { randomUUID } from "node:crypto";
async function createServiceChildRelayAdapter(params) {
		const child = spawn(process.execPath, resolveRuntimeWorkerArgv(workerUrl), {
			stdio,
			detached: useWindowsJobAnchor,
			windowsHide: true,
			env: process.env
		});
		retainedChildren.set(generation, child);
}
async function createChildAdapter(params) {
		const spawned = spawn(command, args, {});
}
`;

test('the relay spawn goes through the broker with the original spawn as fallback, once', () => {
  const out = patchSupervisor(SUPERVISOR);
  assert.ok(out.includes(`import { spawnViaBroker } from "./${BROKER_FILE}"; // ${MARKER}`));
  assert.ok(out.includes('const child = (useWindowsJobAnchor ? null : await spawnViaBroker(process.execPath, resolveRuntimeWorkerArgv(workerUrl), {'));
  assert.ok(out.includes('})) ?? spawn(process.execPath, resolveRuntimeWorkerArgv(workerUrl), {\n\t\t\tstdio,\n\t\t\tdetached: useWindowsJobAnchor,'));
  assert.ok(out.includes('const spawned = spawn(command, args, {});'), 'other spawns are untouched');
  assert.throws(() => patchSupervisor(out), /already/);
  assert.throws(() => patchSupervisor(SUPERVISOR.replace('windowsHide: true,', '')), /not found/);
});

test('applyToDist copies the helper and patches the supervisor chunk in place', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v-spawn-broker-'));
  try {
    fs.writeFileSync(path.join(dir, 'supervisor-ABC.js'), SUPERVISOR);
    fs.writeFileSync(path.join(dir, 'supervisor-other.js'), 'export {};\n');
    assert.equal(applyToDist(dir).patched, true);
    assert.equal(applyToDist(dir).patched, false);
    assert.ok(fs.readFileSync(path.join(dir, 'supervisor-ABC.js'), 'utf8').includes(MARKER));
    assert.ok(fs.readFileSync(path.join(dir, BROKER_FILE), 'utf8').includes(MARKER));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
