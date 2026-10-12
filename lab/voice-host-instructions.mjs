import {isGptLiveCallProfile} from './gpt-live-call-lifecycle.mjs';

export function resolveVoiceHostInstructions(value,{profile,clientCaps}={}) {
 if(value===undefined)return undefined;
 if(!isGptLiveCallProfile(profile)||!Array.isArray(clientCaps)||!clientCaps.includes('voice-direct-tools'))throw Error('Voice instructions require the authenticated native Voice host');
 if(typeof value!=='string'||!value.trim()||value.length>24000||Buffer.byteLength(value,'utf8')>64000)throw Error('Invalid Voice host instructions');
 return value;
}

export function createVoiceHostInstructionsRuntimeSource(){return "import {isGptLiveCallProfile} from './gpt-live-call-lifecycle.mjs';\n"+'export '+resolveVoiceHostInstructions.toString()+'\n';}
