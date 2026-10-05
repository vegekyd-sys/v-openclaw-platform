const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string'};
export const TOOLS=[
 {type:'function',name:'read',description:'直接读取工作目录中的文件。文件名区分大小写，AGENTS.md 是指引文件；可用 offset/limit 分页。',parameters:object({path:str,offset:{type:'integer',minimum:1,maximum:100000},limit:{type:'integer',minimum:1,maximum:300}},['path'])},
 {type:'function',name:'exec',description:'直接运行 OpenClaw 原生执行工具。command 是完整命令，timeoutSeconds 是超时秒数。返回 running/sessionId 时用 process 跟进。外部写入需用户授权。',parameters:object({command:str,timeoutSeconds:{type:'integer',minimum:1,maximum:300}},['command'])},
 {type:'function',name:'process',description:'跟进本通电话发起的执行会话。poll 查询；用户明确取消时用 cancel_task。不可管理其他电话的进程。',parameters:object({action:{type:'string',enum:['poll','log']},sessionId:str,timeout:{type:'integer',minimum:1,maximum:5000}},['action','sessionId'])},
 {type:'function',name:'memory_search',description:'搜索天意的 V/OpenClaw 个人记忆。关于家庭、个人偏好、项目历史的问题先查实际记录。',parameters:object({query:str,maxResults:{type:'integer',minimum:1,maximum:8}},['query'])},
 {type:'function',name:'web_search',description:'通过 OpenClaw 搜索互联网，查询当前新闻、价格和公开资料。',parameters:object({query:str,count:{type:'integer',minimum:1,maximum:5}},['query'])},
 {type:'function',name:'web_fetch',description:'通过 OpenClaw 读取搜索结果的公开网页，核对原文。',parameters:object({url:str},['url'])},
 {type:'function',name:'feishu_calendar',description:'查询天意本人的飞书日程。默认查今天；不是微信日历。start/end 是上海时区 ISO 时间或 YYYY-MM-DD。只查询，不创建或修改。',parameters:object({start:str,end:str})},
 {type:'function',name:'current_time',description:'获取当前上海时间，用于解释今天、明天和周末。',parameters:object({})},
 {type:'function',name:'cancel_task',description:'用户明确取消当前后台任务时调用。普通插话、闲聊或补充条件不表示取消。只取消本次电话发起的任务。',parameters:object({})},
 {type:'function',name:'openclaw_tool',description:'直接执行 OpenClaw 工具，不调用另一个语言模型。可用工具和用法以本次会话提供的目录为准。飞书用 exec 执行 lark-cli --as user；外部写入遵守用户授权，禁止自行确认。arguments 是原工具参数的 JSON 字符串。',parameters:object({tool:str,arguments:str},['tool','arguments'])},
 {type:'function',name:'end_call',description:'用户明确表达结束本次通话时调用。先理解上下文，讨论挂断功能或取消一个任务不表示要结束电话。调用成功后简短告别。',parameters:object({})}
];
export function validateTool(name,args){
 const tool=TOOLS.find(t=>t.name===name);if(!tool)throw Error('不支持这个工具');
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('工具参数必须是对象');
 for(const key of Object.keys(args))if(!(key in tool.parameters.properties))throw Error('未知工具参数');
 for(const key of tool.parameters.required)if(!(key in args))throw Error('缺少工具参数');
 for(const [key,value] of Object.entries(args)){
  const spec=tool.parameters.properties[key];
  if(spec.type==='string'&&(typeof value!=='string'||!value.trim()||value.length>16000))throw Error('无效文字参数');
  if(spec.enum&&!spec.enum.includes(value))throw Error('不支持这个动作');
  if(spec.type==='integer'&&(!Number.isInteger(value)||value<spec.minimum||value>spec.maximum))throw Error('无效数字参数');
 }
 if(name==='web_fetch'){const u=new URL(args.url);if(u.protocol!=='https:'&&u.protocol!=='http:')throw Error('只读取网页');}
 if(name==='feishu_calendar')for(const value of Object.values(args))if(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))throw Error('无效日程日期');
 return args;
}
export function createToolExecutor({invoke,allowedTools,calendar}){return async(name,args,callId,signal)=>{
 validateTool(name,args);
 if(name==='current_time')return {timezone:'Asia/Shanghai',now:new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'})};
 if(name==='end_call')return {accepted:true,instruction:'简短告别，然后结束本次电话。'};
 if(name==='cancel_task')return {cancelRequested:true};
 if(name==='feishu_calendar') {
  if(calendar)return calendar(args);
  const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  const argv=['lark-cli','calendar','+agenda','--as','user','--format','json'];
  for(const key of ['start','end'])if(args[key])argv.push('--'+key,args[key]);
  return invoke('exec',{command:argv.map(quote).join(' '),yieldMs:10000,timeoutSeconds:90},callId,signal);
 }
 if(name==='openclaw_tool') {
  if(!allowedTools?.has(args.tool))throw Error('本会话没有这个 OpenClaw 工具');
  const nativeArgs=JSON.parse(args.arguments);
  if(!nativeArgs||typeof nativeArgs!=='object'||Array.isArray(nativeArgs))throw Error('原工具参数必须是对象');
  return invoke(args.tool,nativeArgs,callId,signal);
 }
 return invoke(name,args,callId,signal);
};}
/** Cache by provider call_id and reject conflicting replays before executing. */
export function createCallDispatcher(execute){const cache=new Map();return (item)=>{
 if(item.type!=='function_call'||!item.call_id||typeof item.arguments!=='string')throw Error('不是原生工具调用');
 const key=item.call_id,signature=JSON.stringify([item.name,item.arguments]);
 if(cache.has(key)){if(cache.get(key).signature!==signature)throw Error('工具调用身份冲突');return cache.get(key).promise;}
 const promise=Promise.resolve().then(()=>execute(item.name,JSON.parse(item.arguments),key));cache.set(key,{signature,promise});return promise;
};}
