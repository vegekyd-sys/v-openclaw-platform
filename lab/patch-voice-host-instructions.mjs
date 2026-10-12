import assert from 'node:assert/strict';
const once=(s,a,b)=>{assert.equal(s.split(a).length-1,1,'Voice host instruction anchor drifted');return s.replace(a,b);};
export function patchVoiceHostInstructionSchema(s){
 const a='const TalkClientCreateParamsSchema = closedObject({\n';
 return once(s,a,a+'\tvoiceInstructions: Type.Optional(Type.String({minLength:1,maxLength:24000})),\n');
}
export function patchVoiceHostInstructionTalk(s){
 const a='providerId: resolution.provider.id, model: launchOptions.model, transport, brain: "agent-consult", capabilities: providerCapabilities';
 const b=a+',\n\t\t\t\thostInstructions: resolveVoiceHostInstructions(params.voiceInstructions,{profile:{'+a+'},clientCaps:client?.connect?.caps})';
 return "import {resolveVoiceHostInstructions} from './voice-host-instructions.mjs';\n"+once(s,a,b);
}
