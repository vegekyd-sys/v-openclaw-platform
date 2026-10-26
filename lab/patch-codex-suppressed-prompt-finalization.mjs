const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Codex finalization anchor drift: '+a.slice(0,90));return s.replace(a,()=>b);};
export function patchSuppressedPromptContext(source){
 const marker='v-codex-suppressed-prompt-finalization-v1';if(source.includes(marker))throw Error('Already patched');
 source=once(source,
  '|| !requiredIds.includes(promptIdentity)) rejectEvidence();',
  '|| (!requiredIds.includes(promptIdentity) && !(params.suppressNextUserMessagePersistence === true && !params.settledMessages.slice(0, boundaryIndex + 1).some(message => message.role === "user")))) rejectEvidence();');
 source=once(source,'function rejectEvidence() {','function rejectEvidence(reason) {');
 source=once(source,'new Error("Codex settled-turn transcript does not match the settled turn")','new Error("Codex settled-turn transcript does not match the settled turn: " + reason)');
 const reasons=['settled-prefix','mirror-prefix','duplicate-history','history-order-or-content','missing-boundary'];
 for(const reason of reasons)source=source.replace('rejectEvidence();',`rejectEvidence("${reason}");`);
 source=once(source,'/** Yields only the settled prefix, but exhausts suffix identity checks before accepting it. */',`// A core-admitted announce prompt can predate native mirror annotation. Resolve
// it only by this turn's exact idempotency key and unchanged persisted content.
// This is a detached replay projection; never rewrite or duplicate the transcript.
function isPureReasoningMessage(message) {
 return message.role==="assistant" && Array.isArray(message.content) && message.content.length>0 && message.content.every(part=>part && (part.type==="thinking" || part.type==="reasoning"));
}
function verifiedPrePersistedPrompt(params) {
 const prompt=params.settledMessages[0];
 const identity=prompt && readMirrorIdentity(prompt);
 if(prompt?.role!=="user" || identity!==params.turnId+":prompt" || params.mirroredMessages.some(m=>readMirrorIdentity(m)===identity))return;
 const key=prompt.idempotencyKey;
 if(typeof key!=="string" || !key.trim())return;
 const found=(params.persistedUserMessages??[]).filter(m=>m.role==="user" && m.idempotencyKey===key);
 if(found.length!==1)return;
 const persisted=found[0];
 if(readMirrorIdentity(persisted) || persisted.__openclaw?.upstreamUserText!==undefined || JSON.stringify(persisted.content)!==JSON.stringify(prompt.content))return;
 return {key,prompt,persisted};
}
/** Yields only the settled prefix, but exhausts suffix identity checks before accepting it. */`);
 source=once(source,'function* verifiedSettledMessages(history, params) {',`function* verifiedSettledMessages(history, params) {
 // Reasoning is never replayed by projectAssistantMessage and is persisted at
 // turn end, after streamed tools. It cannot define public evidence ordering.
 params={...params,settledMessages:params.settledMessages.filter(m=>!isPureReasoningMessage(m)),mirroredMessages:params.mirroredMessages.filter(m=>!isPureReasoningMessage(m))};`);
 source=once(source,'\tconst mirrored = params.mirroredMessages;',
  '\tconst admittedPrompt = verifiedPrePersistedPrompt(params);\n\tconst mirrored = admittedPrompt ? [admittedPrompt.prompt, ...params.mirroredMessages] : params.mirroredMessages;');
 source=once(source,'\tfor (const message of history) {\n\t\tconst identity = readMirrorIdentity(message);',`\tlet admittedPromptSeen = false;
\tfor (const storedMessage of history) {
  if(isPureReasoningMessage(storedMessage))continue;
  let message = storedMessage;
  if(admittedPrompt && storedMessage.idempotencyKey===admittedPrompt.key){
   if(admittedPromptSeen || serializeCodexMirrorSourceEvidence(storedMessage)!==serializeCodexMirrorSourceEvidence(admittedPrompt.persisted))rejectEvidence("admitted-prompt-changed-or-duplicated");
   admittedPromptSeen=true;
   message=admittedPrompt.prompt;
  }
\t\tconst identity = readMirrorIdentity(message);`);
 source=once(source,'(messages) => new CodexSettledTurnContext(projectSettledCodexMessages(verifiedSettledMessages(messages, params)))',`(messages) => {
   try { return new CodexSettledTurnContext(projectSettledCodexMessages(verifiedSettledMessages(messages, params))); }
   catch (error) {
    embeddedAgentLog.warn("codex settled-turn evidence verification failed " + JSON.stringify({error: formatErrorMessage(error), turnId: params.turnId, suppressedPrompt: params.suppressNextUserMessagePersistence === true, settledCount: params.settledMessages.length, mirroredCount: params.mirroredMessages.length}));
    throw error;
   }
  }`);
 return '// '+marker+'\n'+source;
}
export function patchSuppressedPromptAttempt(source){
 const marker='v-codex-suppressed-prompt-attempt-v1';if(source.includes(marker))throw Error('Already patched');
 source=once(source,'const settledTurnFinalizationContext = result.assistantTexts.every(',
  'const settledTurnFinalizationContext = !toolState.yieldDetected && result.assistantTexts.every(');
 source=once(source,'\t\tsettledMessages: result.messagesSnapshot,\n\t\tturnId: activeTurnId',
  '\t\tsettledMessages: result.messagesSnapshot,\n\t\tpersistedUserMessages: mirrorOutcome.persistedUserMessages,\n\t\tsuppressNextUserMessagePersistence: params.suppressNextUserMessagePersistence === true,\n\t\tturnId: activeTurnId');
 return '// '+marker+'\n'+source;
}
export function patchPrePersistedPromptMirror(source){
 const marker='v-codex-prepersisted-prompt-evidence-v1';if(source.includes(marker))throw Error('Already patched');
 return '// '+marker+'\n'+once(source,'\t\t\tmirroredMessages\n\t\t};','\t\t\tmirroredMessages,\n\t\t\tpersistedUserMessages: mirrorResult.userMessagesPresent\n\t\t};');
}

export function patchSettledFinalizerRoute(source){
 source=once(source,'\tconst historyItems = finalizationContext.data;',`\tconst historyItems = finalizationContext.data;
 const deepSeek = attempt.provider === "deepseek";
 const runtimeModel = attempt.model?.params?.codexAppServerRuntimeModel;
 if (deepSeek && (typeof runtimeModel !== "string" || !/^deepseek[-\\w.]*$/.test(runtimeModel))) throw new Error("DeepSeek finalizer requires the original runtime model mapping");
 const baseUrl = attempt.config?.models?.providers?.deepseek?.baseUrl;
 if (deepSeek && (typeof baseUrl !== "string" || new URL(baseUrl).protocol !== "https:")) throw new Error("DeepSeek finalizer requires its configured HTTPS provider");`);
 source=once(source,'id: attempt.modelId','id: deepSeek ? runtimeModel : attempt.modelId');
 source=once(source,'modelProvider: "openai",',`modelProvider: deepSeek ? "deepseek" : "openai",
  ...(deepSeek ? {threadConfig: {"model_providers.deepseek": {name:"DeepSeek",base_url:baseUrl,wire_api:"responses",env_key:"DEEPSEEK_API_KEY"}}} : {}),`);
 return '// v-codex-settled-finalizer-route-v1\n'+source;
}
export function patchBoundedDeepSeekCatalog(source){
 source=once(source,'const appServer = resolveCodexAppServerRuntimeOptions({','let appServer = resolveCodexAppServerRuntimeOptions({');
 source=once(source,'\t\treturn await runBoundedCodexAppServerTurnInWorkspace(params, appServer, {',`  // Private CODEX_HOME intentionally contains no skills, hooks, or tools. Only
  // the already selected provider's model metadata is carried into it.
  if (params.modelProvider === "deepseek") {
   if (params.model.mode !== "required" || !/^deepseek[-\\w.]*$/.test(params.model.id)) throw new Error("Invalid DeepSeek bounded model");
   const catalog = JSON.parse(await fs.readFile(new URL("./v-deepseek-model-catalog.json", import.meta.url), "utf8"));
   const metadata = catalog.models.find(model => model.slug === "deepseek");
   if (!metadata) throw new Error("DeepSeek bounded model metadata unavailable");
   const catalogPath = path.join(workspace.dir,"model-catalog.json");
   await fs.writeFile(catalogPath,JSON.stringify({models:[{...metadata,slug:params.model.id,display_name:params.model.id}]}),{mode:0o600});
   appServer={...appServer,start:{...appServer.start,args:[...(appServer.start.args??[]),"-c","model_catalog_json="+JSON.stringify(catalogPath)]}};
  }
\t\treturn await runBoundedCodexAppServerTurnInWorkspace(params, appServer, {`);
 return '// v-codex-bounded-deepseek-catalog-v1\n'+source;
}
