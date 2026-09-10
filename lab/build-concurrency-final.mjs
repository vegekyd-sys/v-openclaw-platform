// Retire the temporary live CPU hook and use Node's error-safe metric-only sink.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = {baseRelease: null, files: []};
function replace(s, a, b) {assert.equal(s.split(a).length, 2); return s.replace(a, b);}
for (const target of ['production-worker/index.mjs', 'production-worker/worker-pool.mjs', 'production-worker/worker.mjs', 'openclaw/dist/chat-send-handler-DBjXcn_1.js']) {
  const r = JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--target', target], {encoding: 'utf8', maxBuffer: 5 * 1024 ** 2, timeout: 120000}));
  plan.baseRelease ??= r.current.release; assert.equal(plan.baseRelease, r.current.release);
  let s = Buffer.from(r.content, 'base64').toString(); assert.equal(createHash('sha256').update(s).digest('hex'), r.sha256);
  let source;
  if (target.startsWith('production-worker/')) {
    s = 'import {Console as FirsttextMetricConsole} from "node:console";\nconst ocFirsttextMetricConsole = new FirsttextMetricConsole({stdout: process.stdout, stderr: process.stderr, ignoreErrors: true});\n' + s;
    s = replace(s, "    process.stderr.write('[firsttext-worker-phases] ' + JSON.stringify(row) + '\\n');", "    ocFirsttextMetricConsole.error('[firsttext-worker-phases] ' + JSON.stringify(row));");
    source = 'lab/release-files/production-worker-' + path.basename(target);
  } else {
    s = replace(s, 'import {withConcurrencyProfile} from "./gateway-concurrency-profiler.mjs";\n', '');
    s = replace(s, '\treturn await withConcurrencyProfile(options.params, () => handleChatSendWithOptions(options, onAdmissionOwned, externalAuthorityAdmission));', '\tawait handleChatSendWithOptions(options, onAdmissionOwned, externalAuthorityAdmission);');
    assert.equal(createHash('sha256').update(s).digest('hex'), '99c82a810e112f097ab75a0129d80cf3d6305c7c77867504a20307a4cab9b311', 'Restore the exact original handler');
    source = 'lab/release-files/chat-send-handler-DBjXcn_1.js';
  }
  fs.writeFileSync(path.join(root, source), s);
  plan.files.push({source, target, before: r.sha256});
  console.log(JSON.stringify({target, before: r.sha256, after: createHash('sha256').update(s).digest('hex')}));
}
fs.writeFileSync(path.join(root, 'lab/concurrency-final-plan.json'), JSON.stringify(plan, null, 2) + '\n');
