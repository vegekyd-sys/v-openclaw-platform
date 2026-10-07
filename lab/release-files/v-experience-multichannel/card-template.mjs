// Installs (or removes) V's DingTalk question card template drop-in on the
// production Gateway unit. It never restarts: the Gateway reads the variable at
// its next start, and until then DingTalk questions keep the in-card links.
//
//   sudo <node> card-template.mjs            # write the drop-in, daemon-reload
//   sudo <node> card-template.mjs --remove   # delete it, daemon-reload
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {productionDropins} from './config.mjs';

const remove = process.argv.includes('--remove');
assert.equal(os.hostname(), 'VM-8-2-ubuntu', 'production V only');
assert.equal(process.getuid(), 0, 'run as root');
const dir = '/etc/systemd/system/openclaw-gateway.service.d';
const results = [];
for (const [name, body] of Object.entries(productionDropins())) {
  const file = path.join(dir, name);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (remove) {
    if (current === null) { results.push({file, action: 'absent'}); continue; }
    assert.equal(current, body, `${file} differs from what this script writes; inspect it by hand`);
    fs.unlinkSync(file);
    results.push({file, action: 'removed'});
  } else {
    if (current === body) { results.push({file, action: 'unchanged'}); continue; }
    assert.equal(current, null, `${file} exists with other content; inspect it by hand`);
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(file, body, {mode: 0o644, flag: 'wx'});
    results.push({file, action: 'written'});
  }
}
execFileSync('systemctl', ['daemon-reload']);
console.log(JSON.stringify({remove, results, effective: 'at the next openclaw-gateway start; this script did not restart it'}));
