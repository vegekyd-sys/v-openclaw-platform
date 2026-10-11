import {randomUUID} from 'node:crypto';

/** Internal Gateway admission; never accept a run instance supplied over RPC. */
export function createVoiceDirectExecAdmission({prepareAgentRunAdmission,createOperationalRunInstanceRef}) {
  return async function withVoiceDirectExecAdmission(params,execute) {
    if (!params.enabled) return execute();
    params.signal?.throwIfAborted();
    const runId=`voice-direct-tool-${randomUUID()}`;
    const prepared=prepareAgentRunAdmission({cfg:params.cfg,
      operationalRunInstance:createOperationalRunInstanceRef(runId),
      facts:{runId,agentId:params.agentId,
        ingress:{kind:'gateway-client',boundary:'voice-direct-tool',state:'present'}}});
    const close=()=>prepared.close();
    params.signal?.addEventListener('abort',close,{once:true});
    try {
      const context=await prepared.admit('embedded');
      params.signal?.throwIfAborted();
      return await execute({runId,operationalRunInstance:context.operationalRunInstance});
    } finally {
      params.signal?.removeEventListener('abort',close);
      close();
    }
  };
}

export function voiceDirectExecAdmissionRuntimeSource() {
  return `// v-voice-direct-exec-admission-v1\nimport {randomUUID} from 'node:crypto';\n`
    + `import {prepareAgentRunAdmission,createOperationalRunInstanceRef} from './admitted-run-context-BkVijzZS.js';\n`
    + createVoiceDirectExecAdmission.toString()
    + `\nexport const withVoiceDirectExecAdmission=createVoiceDirectExecAdmission({prepareAgentRunAdmission,createOperationalRunInstanceRef});\n`;
}
