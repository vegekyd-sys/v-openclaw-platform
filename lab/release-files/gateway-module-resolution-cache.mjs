import {join} from 'node:path';
import {installNativeModuleResolutionCache} from './native-module-resolution-cache.mjs';

// Install before the Gateway CLI lazily imports the reply/agent graph. This is
// the same bounded resolver used by Workers, not an Agent warmup or policy cache.
let installed;
export function installGatewayModuleResolutionCache({distDir, env=process.env}={}) {
  if (env.OPENCLAW_GATEWAY_RESOLVE_CACHE === '0') {
    installed?.cache.close?.();
    installed=undefined;
    return {status:()=>({enabled:false})};
  }
  if (typeof distDir !== 'string') return {status:()=>({enabled:false})};
  if (installed?.distDir === distDir) return installed.cache;
  installed?.cache.close?.();
  const cache=installNativeModuleResolutionCache({
    agentRuntimePath:join(distDir,'plugin-sdk/agent-runtime.js'), env,
  });
  installed={distDir,cache};
  return cache;
}
