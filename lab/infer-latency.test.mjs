import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILES, MARKER, patchFile, sha256, unpatchFile } from './patch-infer-latency.mjs';

// infer-latency: `openclaw infer` on V (CLI files) and the model run's hidden session (Gateway files).
// See docs/infer-latency-20261117.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/infer-latency.plan.json'));
const released = Object.fromEntries(Object.keys(FILES).map((name) => [name, read(`lab/release-files/infer-latency/${name}`)]));

test('plan pins V bytes before and the release files after, for every file', () => {
  assert.deepEqual(plan.files.map((file) => file.target).toSorted(), Object.keys(FILES).map((name) => `openclaw/dist/${name}`).toSorted());
  for (const file of plan.files) {
    const name = file.target.replace('openclaw/dist/', '');
    assert.equal(file.source, `lab/release-files/infer-latency/${name}`);
    assert.equal(file.before, FILES[name].before, name);
    assert.equal(sha256(unpatchFile(name, released[name])), FILES[name].before, `${name}: V bytes`);
    assert.equal(sha256(released[name]), file.after, name);
    assert.equal(patchFile(name, unpatchFile(name, released[name])), released[name], name);
    assert.throws(() => patchFile(name, released[name]), /already patched/u, name);
    assert.ok(released[name].includes(MARKER), name);
  }
});

const guardExpression = (name, constName) => {
  const line = released[name].split('\n').find((l) => l.includes(`const ${constName} =`));
  return line.slice(line.indexOf('=') + 1).trim().replace(/;$/u, '');
};

test('infer and its capability alias no longer consider state migration', () => {
  const consider = new Function('params', 'commandName', 'subcommandName', 'isRestartController', `return ${guardExpression('config-guard--4cC6uJU.js', 'shouldConsiderStateMigration')};`);
  const run = (name, sub) => consider({ validateConfigOnly: false }, name, sub, false);
  assert.equal(run('infer', 'model'), false);
  assert.equal(run('capability', 'model'), false);
  for (const [name, sub] of [['message', undefined], ['agent', undefined], ['gateway', 'run'], ['gateway', undefined], ['models', 'list'], ['plugins', 'list'], ['unknown-command', undefined], [undefined, undefined]]) {
    assert.equal(run(name, sub), true, `${name} ${sub}`);
  }
  for (const [name, sub] of [['config', 'get'], ['health', undefined], ['logs', undefined], ['sessions', undefined], ['gateway', 'call'], ['update', 'status']]) {
    assert.equal(run(name, sub), false, `${name} ${sub}`);
  }
});

test('gateway-dispatched inference reads core-only config and bypasses the operator proxy', () => {
  const hasFlag = (argv, name) => argv.slice(2).includes(name);
  const isGateway = new Function('commandName', 'hasFlag', 'process', `return ${guardExpression('config-guard--4cC6uJU.js', 'isGatewayDispatchedInference')};`);
  assert.equal(isGateway('infer', hasFlag, { argv: ['node', 'openclaw', 'infer', 'model', 'run', '--gateway'] }), true);
  assert.equal(isGateway('capability', hasFlag, { argv: ['node', 'openclaw', 'capability', 'model', 'run', '--gateway'] }), true);
  assert.equal(isGateway('infer', hasFlag, { argv: ['node', 'openclaw', 'infer', 'model', 'run', '--local'] }), false);
  assert.equal(isGateway('agent', hasFlag, { argv: ['node', 'openclaw', 'agent', '--gateway'] }), false);
  assert.match(released['config-guard--4cC6uJU.js'], /commandName === "logs" \|\| isGatewayDispatchedInference \? \{\n\t\tobserve: false,\n\t\tpluginValidation: "core-only"/u);
  assert.match(released['config-guard--4cC6uJU.js'], /import \{ s as hasFlag \} from "\.\/argv-BGeU0eAz\.js";/u);
  const policy = released['command-path-policy-qUeic05b.js'];
  for (const root of ['infer', 'capability']) {
    assert.ok(policy.includes(`commandPath: ["${root}"],\n\t\tpolicy: { networkProxy: ({ argv }) => hasFlag(argv, "--gateway") ? "bypass" : "default" }`), root);
  }
});

test('a provider-scoped simple completion loads the provider owner only', () => {
  const planFile = released['runtime-plugin-load-plan-Bm46qisR.js'];
  assert.match(planFile, /if \(isProviderOnlyPluginSelection\(selections\)\) return \[\.\.\.selections\];/u);
  assert.match(planFile, /const memoryPluginIds = providerOnly \? \[\] :/u);
  assert.match(planFile, /const contextEnginePluginId = providerOnly \? void 0 :/u);
  assert.match(planFile, /if \(providerOnly \|\| !requiresAgentHarnessPluginSelection\(selection, config\)\) continue;/u);
  assert.match(released['model-fXXfAcf8.js'], /skipAgentDiscovery: true,\n\t\t\truntimePluginScope: "provider"/u);
  assert.equal(released['simple-completion-runtime-D9F09LT6.js'].split('...params.runtimePluginScope ? { pluginScope: params.runtimePluginScope } : {}').length - 1, 3, 'runtime selections and both metadata scopes');
  assert.match(released['prepared-model-runtime.facts-CEW6RO02.js'], /\(\{ provider, runtime, pluginScope \}\) => \(\{/u, 'workspace facts key keeps the scope');
});

test("the run's hidden session skips store maintenance and store-wide reference reads", () => {
  const effects = released['internal-session-effects-C8FWqbuL.js'];
  assert.match(effects, /\}, \{ skipMaintenance: true \}\);/u, 'creation');
  assert.match(effects, /await removeInternalSessionEffectsSession\(target, \{ runOwned: true \}\);/u, 'the run cleanup marks its removals');
  assert.match(effects, /\.\.\.options\.runOwned \? \{ runOwnedInternalSession: true \} : \{\}/u);
  const state = released['session-accessor.sqlite-lifecycle-state-CrB_K2kA.js'];
  assert.match(state, /removal\.runOwnedInternalSession === true && isInternalSessionEffectsKey\(sessionKey\)/u, 'only internal-effects keys');
  assert.match(state, /import \{ O as isInternalSessionEffectsKey \} from "\.\/session-accessor\.sqlite-entry-BlklNPKQ\.js";/u);
  assert.match(state, /const referencedSessionIds = options\.runOwnedInternalRemovalsOnly \? \/\* @__PURE__ \*\/ new Set\(\) : readReferencedSessionIds\(database, excludedSessionKeys\);/u);
  const accessor = released['session-accessor-K0XuW6ln.js'];
  assert.match(accessor, /beforeCount = countEntries \? readSessionEntryCount\(transactionDb\) : 0;/u);
  assert.match(accessor, /\{ runOwnedInternalRemovalsOnly: projected\.runOwnedInternalRemovalsOnly === true \}/u);
  assert.match(accessor, /const afterCount = committed\.countEntries \?/u);
});
