// Installed beside the native runtime modules. Only the authenticated dispatcher
// supplies actor; browser RPC parameters never select this surface or identity.
import {t as resolveGatewayScopedTools} from './tool-resolution-Con11qMn.js';
import {actorToolContext} from './v-feishu-voice-actor.mjs';

export function resolveActorTools({cfg,actor,sessionId,clientCaps,disablePluginTools=false}) {
  const context=actorToolContext(actor);
  return resolveGatewayScopedTools({cfg,sessionKey:actor.sessionKey,agentId:actor.agentId,sessionId,
    ...context,messageProvider:context.messageChannel,clientCaps,disablePluginTools,
    conversationReadOrigin:'delegated',allowGatewaySubagentBinding:true,allowMediaInvokeCommands:true,
    // Reuse native channel/sender/owner/sandbox policies. HTTP's transport deny
    // list is not a capability policy for authenticated Feishu conversations.
    surface:'loopback',mediatedToolNames:['read','write','edit','apply_patch','exec','process']});
}
