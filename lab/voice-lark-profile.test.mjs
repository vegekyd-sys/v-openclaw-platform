import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {prepareVoiceLarkProfile} from './voice-lark-profile.mjs';
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-cli-profile-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sourceFile=path.join(root,'personal.json'),app={appId:'same-app',appSecret:'fixture-private',defaultAs:'user',strictMode:'off',users:[{userOpenId:'existing-user',userName:'fixture'}]};
  fs.writeFileSync(sourceFile,JSON.stringify({apps:[app]}),{mode:0o600});
  const calls=[];
  const params={sourceFile,configRoot:path.join(root,'voice-only'),gatewayConfig:{channels:{feishu:{appId:'same-app'}}},environment:{HOME:root,LARKSUITE_CLI_DATA_DIR:path.join(root,'existing-data')},uid:process.getuid(),gid:process.getgid(),
    execute:(args,{env,file})=>{
      calls.push(args);
      if(args[0]==='config') {const bound={apps:[{...app,users:null}],binding:'native-fixture'};fs.writeFileSync(file,JSON.stringify(bound));return {status:0};}
      assert.deepEqual(JSON.parse(fs.readFileSync(file)).apps[0].users,app.users);
      assert.equal(env.LARKSUITE_CLI_DATA_DIR,path.join(root,'existing-data'));
      return {status:0,stdout:JSON.stringify({identity:'user',available:true,appId:'same-app'})};
    }};
  return {params,app,calls};
}
test('private Voice root uses native binding and preserves the same app/user token records without modifying the source',async t=>{
  const f=fixture(t),bytes=fs.readFileSync(f.params.sourceFile),result=await prepareVoiceLarkProfile(f.params);
  assert(result.existingUserTokenReady);assert(fs.readFileSync(f.params.sourceFile).equals(bytes));
  assert.equal(fs.statSync(result.configRoot).mode&0o777,0o700);
  assert.equal(fs.statSync(path.join(result.configRoot,'openclaw/config.json')).mode&0o777,0o600);
  assert.deepEqual(f.calls[0],['config','bind','--source','openclaw','--app-id','same-app','--identity','user-default']);
  assert.equal(result.environment.LARKSUITE_CLI_CONFIG_DIR,f.params.configRoot);
});
test('different app or bot-only source cannot gain user identity or overwrite another workspace',async t=>{
  for(const change of ['different','bot-only','exists']) {
    const f=fixture(t);
    if(change==='different')f.params.gatewayConfig.channels.feishu.appId='another-app';
    if(change==='bot-only')fs.writeFileSync(f.params.sourceFile,JSON.stringify({apps:[{...f.app,strictMode:'bot-only'}]}));
    if(change==='exists')fs.mkdirSync(f.params.configRoot);
    await assert.rejects(prepareVoiceLarkProfile(f.params));assert.equal(f.calls.length,0);
  }
});
test('CLI failure, app drift or missing token aborts preparation and leaves the source intact',async t=>{
  for(const mode of ['bind-error','changed-app','missing-token']) {
    const f=fixture(t),original=fs.readFileSync(f.params.sourceFile),execute=f.params.execute;
    f.params.execute=(args,ctx)=>{
      if(mode==='bind-error')return {status:1};
      const r=execute(args,ctx);
      if(mode==='changed-app'&&args[0]==='config')fs.writeFileSync(ctx.file,JSON.stringify({apps:[{...f.app,appId:'other'}]}));
      if(mode==='missing-token'&&args[0]==='whoami')return {status:0,stdout:JSON.stringify({identity:'user',available:false,appId:'same-app'})};
      return r;
    };
    await assert.rejects(prepareVoiceLarkProfile(f.params));assert(fs.readFileSync(f.params.sourceFile).equals(original));
  }
});
