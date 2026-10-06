import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function bootstrap(testCase){
 const env={...process.env,DIRECT_VOICE_AUTOMATED:'1',V_REALTIME_DIRECT_TOOLS:'1',DIRECT_VOICE_CASES:testCase};
 for(const key of ['VLAB_CANDIDATE_RUNTIME','OPENCLAW_STATE_DIR','OPENCLAW_CONFIG_PATH'])delete env[key];
 return spawnSync(process.execPath,['lab/gpt-live-h5-candidate.mjs'],{env,encoding:'utf8'});
}
test('unknown observer is rejected before disposable runtime startup',()=>{
 const result=bootstrap('not-a-real-case');assert.equal(result.status,1);
 assert.match(result.stderr,/Unknown direct voice observer case/);
 assert.doesNotMatch(result.stderr,/Disposable candidate environment required/);
});
test('controls-only observer passes case validation before runtime startup',()=>{
 const result=bootstrap('controls');assert.equal(result.status,1);
 assert.match(result.stderr,/Disposable candidate environment required/);
 assert.doesNotMatch(result.stderr,/Unknown direct voice observer case/);
});
