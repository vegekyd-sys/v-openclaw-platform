import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [owner, label, wavesArg = '5'] = process.argv.slice(2), waves = Number(wavesArg);
assert(/^[\w-]+$/.test(owner)); assert(/^[a-z0-9-]+$/.test(label)); assert(Number.isInteger(waves) && waves >= 1 && waves <= 5);
const harness = fileURLToPath(new URL('./run-gateway-concurrency.mjs', import.meta.url));
const quantile = (values, fraction) => values.toSorted((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
for (let wave = 1; wave <= waves; wave++) for (const count of [1, 5, 10, 15]) {
  const batch = `${label}-c${count}-wave${wave}`;
  const child = spawn(process.execPath, [harness, owner, String(count), batch], {stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => {stdout += chunk;}); child.stderr.on('data', chunk => {stderr += chunk;});
  console.log(JSON.stringify({event: 'batch-start', label: batch, count}));
  const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', resolve);});
  const report = stdout.split('\n').filter(Boolean).map(line => {try {return JSON.parse(line);} catch {return {};}}).find(row => row.output);
  console.log(JSON.stringify({event: 'batch-end', label: batch, count, code, output: report?.output, failures: report?.rows.filter(row => !row.expectedBody || !row.terminalPersisted).length,
    runtimeErrors: report?.runtimeErrors, firstBodyP50: report ? quantile(report.rows.map(r => r.firstBody), .5) : undefined,
    firstBodyP95: report ? quantile(report.rows.map(r => r.firstBody), .95) : undefined}));
  assert.equal(code, 0, stderr.slice(-2000));
}
