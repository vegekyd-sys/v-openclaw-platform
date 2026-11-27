import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Service-child relays spawned by a small helper process instead of the Gateway (see
// lab/spawn-broker/v-spawn-broker.mjs for the why and the protocol).
//
// V CPU profile 2026-11-19 14:33-14:34 CST (60 s, 27 Night Shift /vds cards, 60 chat messages per
// 30 min): the Gateway main thread was busy 39.4 s; child_process.spawn alone took 4.45 s, 3.8 s of
// it in createServiceChildRelayAdapter (69 relay spawns, P50 54.6 ms each). Each one forks a process
// with 6.1 GB of anonymous memory (VmPTE 139 MB). VLab: 15 ms per GB of caller memory, ~1 ms from
// a small helper.
//
// The patch: supervisor-*.js gets one import and its relay spawn becomes
//   (useWindowsJobAnchor ? null : await spawnViaBroker(...)) ?? spawn(...unchanged...)
// spawnViaBroker returns null whenever the call cannot or should not be brokered (a secret-input fd
// in stdio, Windows, OPENCLAW_V_SPAWN_BROKER=0, helper failure), so the original path stays the
// fallback for every case.

export const MARKER = 'v-spawn-broker-v1';
export const BROKER_FILE = 'v-spawn-broker.mjs';
const BROKER_SOURCE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'spawn-broker', BROKER_FILE);

const IMPORT_ANCHOR = 'import { spawn } from "node:child_process";\n';
const SPAWN_CALL = `		const child = spawn(process.execPath, resolveRuntimeWorkerArgv(workerUrl), {
			stdio,
			detached: useWindowsJobAnchor,
			windowsHide: true,
			env: process.env
		});
		retainedChildren.set(generation, child);`;

export function patchSupervisor(source) {
  assert(!source.includes(MARKER), 'supervisor already carries the spawn broker');
  assert.equal(source.split(IMPORT_ANCHOR).length, 2, 'child_process import anchor not found exactly once');
  assert.equal(source.split(SPAWN_CALL).length, 2, 'service child relay spawn not found exactly once');
  return source
    .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}import { spawnViaBroker } from "./${BROKER_FILE}"; // ${MARKER}\n`)
    .replace(SPAWN_CALL, SPAWN_CALL.replace('const child = spawn(', `// ${MARKER}: fork from a small helper, not from the Gateway
		const child = (useWindowsJobAnchor ? null : await spawnViaBroker(process.execPath, resolveRuntimeWorkerArgv(workerUrl), {
			stdio,
			env: process.env
		})) ?? spawn(`));
}

// usage: node lab/patch-spawn-broker.mjs <dist dir> [more dist dirs...]
// copies the helper into each dist root and patches the supervisor chunk that spawns relays
export function applyToDist(dir) {
  const name = fs.readdirSync(dir).find((f) => /^supervisor-.*\.js$/.test(f) && fs.readFileSync(path.join(dir, f), 'utf8').includes('async function createServiceChildRelayAdapter('));
  assert(name, `no supervisor chunk with createServiceChildRelayAdapter in ${dir}`);
  const file = path.join(dir, name);
  const source = fs.readFileSync(file, 'utf8');
  fs.copyFileSync(BROKER_SOURCE_PATH, path.join(dir, BROKER_FILE));
  if (source.includes(MARKER)) return { file, patched: false };
  fs.writeFileSync(file, patchSupervisor(source));
  return { file, patched: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2);
  assert(dirs.length, 'usage: patch-spawn-broker.mjs <dist dir>...');
  for (const dir of dirs) {
    const r = applyToDist(dir);
    console.log(`${r.patched ? 'patched' : 'already patched'} ${r.file}`);
  }
}
