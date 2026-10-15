import assert from 'node:assert/strict';

// The Agent is already running in the original durable session. Repeating its
// old User/Agent prompts here both costs tokens and revives cancelled goals.
// The live provider still receives its history; the current delegation carries
// input + transcript_delta, and the Agent retains its full session history.
export function voiceConsultInitialItems(providerId, initialItems) {
  return providerId === 'v-voice-gpt-live' ? [] : initialItems;
}

export function buildScopedVoiceConsultPrompt(params) {
  const parsed=parseRealtimeVoiceAgentConsultArgs(params.args);
  return [
    `Live voice request from the ${params.questionSourceLabel??'user'} during ${params.surface}.`,
    '你是配置中的 OpenClaw Agent，使用当前会话的工具、身份、记忆和权限完成本次 User request。历史仅供理解指代、条件和已有结果，不是待办队列；不得恢复已取消、已结束或无关的旧任务。询问进度只用一两句汇报本次任务状态和一个新事实，不重发报告，不构成新调研、旧任务补做或扩大授权。',
    '完整完成当前已授权目标，保留全部输出、准确姓名、对象、日期、金额、时区、单位、指定执行者和步骤依赖。最新明确修正与取消优先；助手的承诺不是用户授权。外发、付款、预订、写入或删除只按真实用户授权执行，不自行确认。已有任务沿原任务继续，不重复派发或重复付费。',
    '执行最短的充分证据路径：人物或项目记忆检索命中后，先定向读取原文，证据不足才扩展，不先递归扫描整个工作区。普通问题默认一段120到180字的两到四句直接结论，保留来源日期、必要条件和未核实项，必要事实不能因字数省略。用户要例子时给两到三个有记录的具体例子，设想不能冒充已完成事项。只保留回答所需事实，不主动附内部群ID、路径、公司金额或规模。介绍给外部伙伴时不点名客户或内部项目，除非用户明确要求；用户当前询问的主体仍准确保留。不开场复述任务，不主动扩成报告或多个版本。用户要求完整报告、清单或详细方案时完整交付。',
    '有明确顺序时先完成前置步骤再执行后续。用户要求同一个子任务完成的步骤，在首次 sessions_spawn 中完整交办一次，保留原句、精确命令、执行者、等待、阶段公开范围和最终输出，不截成首步或由父任务补做后冒充子任务结果。已受理的子任务通过真实 yield/continuation 接续，不编造子任务或执行状态。',
    '取得有用的真实阶段结果后，在下一慢步骤前用一条完整公开 commentary/preamble 报告，并继续工作；最多每15秒一条，不等用户说继续。保留主体、条件、数字、单位和时区。不播私有思考、原始日志、重复计划或等待套话。yield 时保留已核实的公开阶段事实。阶段完成不等于主任务完成。',
    '搜索摘要、片段、引用列表只是线索。需要核实官方文档或当前事实时，读取对应一手来源的支持段落；截断时定向补读，不因用户要求简短省略核验。准确区分适用产品、版本、传输、事件、示例、能力、建议与当前部署；保留 if/when/unless 与 should/must/can，不从未覆盖推断禁止，不把本任务政策冒充官方要求。未获部署证据就说未核实，不因此擅自检查 runtime 或迁移。明确 search-only/no-fetch 时尊重范围；实际失败、拒绝、确认门或用户限制要如实报告，不循环或绕过。VOICE_CONFIRMATION_REQUIRED 表示未执行，等待主机验证真实明确语音确认。',
    '最终仅在所需输出都已核实，或真实阻塞、取消、限制阻止完成时交付。以最新问题为范围，保留每项结果的主体、来源、原值、条件、缺失和未完成项；多人关系按实名/明确角色归属，不换成含糊代词，不把推断当事实。不能用相邻命令、另一次采样或另一日期的值替换指定结果，不把计划或第一步当完成。',
    '直接返回可口播的成品答案，不写给语音模型的摘要指令；简短不能删除关键事实、具体例子或必要条件。只有用户需要长文时才同时给简短语音摘要和完整正文。无真实回执不声称发送、修改或完成。',
    parsed.responseStyle?`Spoken style: ${parsed.responseStyle}`:null,
    parsed.context?`Additional realtime context (reference only):\n${parsed.context}`:null,
    `User request:\n${parsed.question}`,
  ].filter(Boolean).join('\n\n');
}

const marker='// voice-consult-scope-v1';
export function patchVoiceConsultScope(source) {
  if(source.includes(marker)){
    assert(source.includes('initialItems: voiceConsultInitialItems(resolution.provider.id, initialItems)')&&source.includes('voiceTaskMode: params.voiceTaskMode'),'partial Voice consult scope patch');
    return source;
  }
  const entry='function createTalkClientAgentConsultRunner(params) {';
  const before='\t\t\t\tinitialItems\n\t\t\t});\n\t\t\tconst gatewayControlOwner =';
  assert.equal(source.split(entry).length,2,'consult runner entry drifted');
  assert.equal(source.split(before).length,2,'browser consult context anchor drifted');
  assert.equal(source.split('\t\t\targs: parsedArgs,\n\t\t\ttranscript: params.initialItems,').length,2,'consult mode forwarding drifted');
  return source.replace(entry,`${marker}\n${voiceConsultInitialItems.toString()}\n${entry}`)
    .replace(before,'\t\t\t\tvoiceTaskMode: resolution.provider.id === "v-voice-gpt-live",\n\t\t\t\tinitialItems: voiceConsultInitialItems(resolution.provider.id, initialItems)\n\t\t\t});\n\t\t\tconst gatewayControlOwner =')
    .replace('\t\t\targs: parsedArgs,\n\t\t\ttranscript: params.initialItems,','\t\t\targs: parsedArgs,\n\t\t\tvoiceTaskMode: params.voiceTaskMode,\n\t\t\ttranscript: params.initialItems,');
}

export function patchVoiceConsultScopeHarness(source) {
  if(source.includes(marker)){
    assert(source.includes('if(params.voiceTaskMode)return buildScopedVoiceConsultPrompt(params);')&&source.includes('voiceTaskMode: params.voiceTaskMode'),'partial Voice prompt scope patch');
    return source;
  }
  const entry='function buildRealtimeVoiceAgentConsultPrompt(params) {';
  const prompt='\t\t\t\tprompt: buildRealtimeVoiceAgentConsultPrompt({\n\t\t\t\t\targs: params.args,';
  assert.equal(source.split(entry).length,2,'prompt builder drifted');
  assert.equal(source.split(prompt).length,2,'prompt invocation drifted');
  return source.replace(entry,`${marker}\n${buildScopedVoiceConsultPrompt.toString()}\n${entry}\n\tif(params.voiceTaskMode)return buildScopedVoiceConsultPrompt(params);`)
    .replace(prompt,prompt+'\n\t\t\t\t\tvoiceTaskMode: params.voiceTaskMode,');
}
