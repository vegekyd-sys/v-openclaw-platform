// Run on VLab after fetching both repository branches from GitHub.
// Uses the unchanged official Candidate runner; no shared deployment writes.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildRequest} from './client.mjs';
import {run} from './runner.mjs';

const root = path.resolve(process.argv[2]);
const voice = path.resolve(process.argv[3]);
const output = path.resolve(process.argv[4]);
const archive = 'tmp/voice-control-split/voice-source.tgz';
fs.mkdirSync(path.dirname(path.join(root, archive)), {recursive:true});
execFileSync('git', ['-C',voice,'archive','--format=tar.gz','-o',path.join(root,archive),'HEAD']);
const plan = JSON.parse(fs.readFileSync(path.join(root,'lab/voice-native-turn-control.plan.json')));
Object.assign(plan, {
  support:['lab/candidate/voice-native-control-start.mjs','lab/candidate/voice-native-control-probe.mjs',archive],
  command:[process.execPath,'lab/candidate/voice-native-control-start.mjs',archive],
  databases:[],timeoutSeconds:1800,
});
const req = buildRequest(root,plan,'01a0fb0e-739d-7681-9238-faa2c1912c6c');
req.sourceCommit = execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
req.branch = execFileSync('git',['-C',root,'branch','--show-current'],{encoding:'utf8'}).trim();
req.dirty = Boolean(execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim());
req.runnerSha256 = createHash('sha256').update(fs.readFileSync(new URL('./runner.mjs',import.meta.url))).digest('hex');
const result = await run(req);
fs.writeFileSync(output,JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
console.log(JSON.stringify({id:result.id,ok:result.ok,sharedUnchanged:result.sharedUnchanged,receipt:output}));
