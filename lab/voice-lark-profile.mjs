/** Prepare an isolated Voice CLI workspace from the already-authorized personal app. */
export async function prepareVoiceLarkProfile({sourceFile,configRoot,gatewayConfig,environment,uid,gid,execute}) {
  const fs=await import('node:fs'),path=await import('node:path');
  const {spawnSync}=await import('node:child_process');
  const require=(condition,message)=>{if(!condition)throw Error(message);};
  require(path.isAbsolute(sourceFile)&&path.isAbsolute(configRoot),'Absolute private CLI paths required');
  const sourceStat=fs.lstatSync(sourceFile);
  require(sourceStat.isFile()&&!sourceStat.isSymbolicLink()&&(sourceStat.mode&0o077)===0,'Personal CLI source must be private');
  const original=fs.readFileSync(sourceFile),config=JSON.parse(original),apps=Object.values(config.apps??{});
  require(apps.length===1,'Voice needs one unambiguous existing personal CLI app');
  const app=apps[0];
  require(app.defaultAs==='user'&&app.strictMode==='off','Do not expand a bot-only or restricted CLI identity');
  const feishu=gatewayConfig.channels?.feishu;
  require([feishu,...Object.values(feishu?.accounts??{})].some(a=>a?.appId===app.appId),'Personal CLI app differs from Gateway Feishu app');
  require(!fs.existsSync(configRoot),'Do not replace an existing Voice CLI workspace');
  // CONFIG_DIR is a workspace root; lark-cli adds /openclaw itself.
  const profile=path.join(configRoot,'openclaw'),file=path.join(profile,'config.json');
  for(const dir of [configRoot,profile]){fs.mkdirSync(dir,{mode:0o700});fs.chownSync(dir,uid,gid);fs.chmodSync(dir,0o700);}
  fs.writeFileSync(file,original,{mode:0o600,flag:'wx'});fs.chownSync(file,uid,gid);
  const env={...environment,LARKSUITE_CLI_CONFIG_DIR:configRoot,
    LARKSUITE_CLI_DATA_DIR:environment.LARKSUITE_CLI_DATA_DIR||path.join(environment.HOME,'.local/share')};
  const call=execute??((args)=>spawnSync('lark-cli',args,{uid,gid,env,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024}));
  const bind=call(['config','bind','--source','openclaw','--app-id',app.appId,'--identity','user-default'],{env,file});
  require(bind.status===0,'Voice Feishu workspace binding failed; existing profile retained');
  const bound=JSON.parse(fs.readFileSync(file)),boundApps=Object.values(bound.apps??{});
  require(boundApps.length===1&&boundApps[0].appId===app.appId&&boundApps[0].defaultAs==='user'&&boundApps[0].strictMode==='off','CLI binding changed the app or identity policy');
  // CLI bind resets its user list even for the same app. Retain the old user
  // records and their existing encrypted token store; never create new grants.
  boundApps[0].users=app.users;
  fs.writeFileSync(file,JSON.stringify(bound,null,2)+'\n',{mode:0o600});fs.chmodSync(file,0o600);
  require(fs.readFileSync(sourceFile).equals(original),'Existing personal CLI profile changed concurrently');
  const who=call(['whoami'],{env,file});let identity;
  try{identity=JSON.parse(who.stdout);}catch{}
  require(who.status===0&&identity?.identity==='user'&&identity.available===true&&identity.appId===app.appId,'Existing Voice Feishu user token is not ready');
  return {configRoot,environment:{LARKSUITE_CLI_CONFIG_DIR:configRoot,LARKSUITE_CLI_DATA_DIR:env.LARKSUITE_CLI_DATA_DIR},sameApp:true,existingUserTokenReady:true};
}
