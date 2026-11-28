'use strict';
const POLICY=`自动返修边界（the owner 2026-11-17 已批准）：你不是替用户无限追求完美的创意总监。brief 是 V 的转述，不能冒充用户原话；V 自加的打印尺寸、字体、风格偏好、图层数等只作可选建议，不能触发自动续做。说明与实际不一致，优先更正说明，不为凑说明改变合格作品。已有可用成品默认 close；不确定或可选优化放 optionalSuggestion，不为可选优化 request_human 阻塞收卡。首版即时发送不变。只有未满足可核实的用户明确要求，或缺失交付物/文件不可用/必要合成未完成等客观使用缺陷，才继续。
每次自动续做必须给 reworkBasis：{kind:"user_requirement"|"usage_defect", defectType:"missing_deliverable"|"unusable_file"|"incomplete_composition"（仅usage_defect）, userQuote:"用户原话（仅user_requirement）", evidence:"实际产物的可观察缺陷与证据", impact:"影响用户完成什么任务"}。不是上述缺陷的分辨率升级、审美润色、介绍文字修正必须 close。证据不足不自动返工。`;
function applyReworkPolicy(raw,request,job={}){
 if(request.eventType!=='artifact_finality'||!['revise','retry','confirm'].includes(String(raw.decision).toLowerCase()))return raw;
 const b=raw.reworkBasis||{};
 const evidenced=typeof b.evidence==='string'&&b.evidence.trim()&&typeof b.impact==='string'&&b.impact.trim();
 const original=String(job.originalUserRequest||job.userRequest||'');
 const user=evidenced&&b.kind==='user_requirement'&&String(b.userQuote||'').trim().length>=4&&original.includes(String(b.userQuote).trim());
 const usage=evidenced&&b.kind==='usage_defect'&&['missing_deliverable','unusable_file','incomplete_composition'].includes(b.defectType);
 if(user||usage)return raw;
 return {...raw,decision:'close',passed:false,prompt:'',humanMessage:'',action:'',reworkSuppressed:true,optionalSuggestion:raw.optionalSuggestion||raw.reason||'',reason:'已有产物已发送；本次续做缺少可核实的用户要求或客观使用缺陷依据，不自动返工。可选优化与说明更正不触发重做。'};
}
module.exports={POLICY,applyReworkPolicy};
