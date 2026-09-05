import {readFileSync,readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';

// The native setup probe owns an in-memory transcript in its caller. This is
// control-plane inference, not a durable chat: moving it into agentCommand
// would invent a persisted session and lose that caller-owned transcript.
export function isGatewayOwnedInferenceProbe(p) {
  return p.sessionPersistence === 'detached' && p.modelRun === true &&
    p.disableTools === true && typeof p.sessionKey === 'string' &&
    /^agent:[^:]+:setup-inference:incognito-probe-setup-inference-/.test(p.sessionKey) &&
    typeof p.sessionManager?.getSessionTarget === 'function' &&
    !p.sessionManager.getSessionTarget();
}

export function createGatewayNativeProbe({agentRuntimePath,loadHarness}={}) {
  let native;
  const load=loadHarness??(async()=>{
    const dist=dirname(dirname(agentRuntimePath));
    const version=JSON.parse(readFileSync(join(dirname(dist),'package.json'))).version;
    if(version!=='2026.9.1')throw new Error('Native inference probe adapter needs version review');
    const modules=readdirSync(dist).filter(x=>/^builtin-openclaw-.*\.js$/.test(x));
    if(modules.length!==1)throw new Error('Native OpenClaw Harness is ambiguous');
    const file=join(dist,modules[0]),source=readFileSync(file,'utf8');
    const alias=source.match(/createOpenClawAgentHarness as ([\w$]+)/)?.[1];
    if(!alias)throw new Error('Native OpenClaw Harness export changed');
    return (await import(pathToFileURL(file).href))[alias]();
  });
  return async p=>{
    if(!isGatewayOwnedInferenceProbe(p))throw new Error('Not a caller-owned native inference probe');
    native??=load();
    // Preserve every process-local owner, callback, permission and cancellation
    // object by reference. Never retry a failed Worker run through this path.
    return (await native).runAttempt(p);
  };
}
