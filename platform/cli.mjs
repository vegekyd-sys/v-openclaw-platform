#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCatalog,auditCatalog,releaseCheck,upgradePlan,runOffline} from './core.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const [command,...args]=process.argv.slice(2);
const usage='Usage: node platform/cli.mjs audit | test [--report ABSOLUTE_NEW_FILE] | plan --openclaw EXACT_VERSION | release-check';
try{
  const catalog=loadCatalog(root);let result;
  if(command==='audit'&&args.length===0){result=auditCatalog(root,catalog);process.exitCode=result.catalogValid?0:1;}
  else if(command==='release-check'&&args.length===0){result=releaseCheck(root,catalog);process.exitCode=result.releaseReady?0:2;}
  else if(command==='plan'&&args.length===2&&args[0]==='--openclaw')result=upgradePlan(root,catalog,args[1]);
  else if(command==='test'&&(args.length===0||(args.length===2&&args[0]==='--report'))){
    let report;
    if(args.length){report=args[1];if(!path.isAbsolute(report)||fs.existsSync(report))throw Error('Report needs a new absolute file path');if(!fs.statSync(path.dirname(report)).isDirectory())throw Error('Report parent is not a directory');}
    result=await runOffline(root,catalog);
    if(report)fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    process.exitCode=result.passed?0:1;
  }else throw Error(usage);
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({error:error.message,releaseReady:false}));process.exitCode=1;}
