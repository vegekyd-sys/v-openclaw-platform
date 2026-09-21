import assert from "node:assert/strict";

export const MANAGED_ROOM_CLIENT_CLASS = `class VolcRtcManagedRoomTransport{constructor(e,t){this.session=e,this.ctx=t,this.delegate=null,this.closed=!1}async start(){this.closed=!1;this.ctx.input?.stop?.();let{VolcengineRtcManagedRoomClient:e}=await import("./volcengine-rtc-managed-room-client.js");if(this.closed)return"cancelled";return this.delegate=new e(this.session,this.ctx),await this.delegate.start()}activate(){this.delegate?.activate()}stop(){this.closed=!0,this.delegate?.stop()}}`;

export const TRANSPORT_FACTORY_BEFORE =
  "function mP(e,t){let n=hP(e);if(n===`webrtc`)return new fP(e,t);if(n===`provider-websocket`)return new XN(e,t);if(n===`gateway-relay`)return new CN(e,t);let r=e.transport??`unknown`;throw Error(`Unsupported realtime Talk transport: ${r}`)}";

export const TRANSPORT_FACTORY_AFTER =
  `${MANAGED_ROOM_CLIENT_CLASS}function mP(e,t){let n=hP(e);` +
  "if(n===`webrtc`)return new fP(e,t);" +
  "if(n===`provider-websocket`)return new XN(e,t);" +
  "if(n===`gateway-relay`)return new CN(e,t);" +
  "if(n===`managed-room`)return new VolcRtcManagedRoomTransport(e,{...t,executeToolCall:async e=>{" +
  "if(e.name===`openclaw_agent_control`)return cN({ctx:t,callId:e.callId,args:e.args,signal:e.signal,submit:e.submit});" +
  "return uN({ctx:t,callId:e.callId,args:e.args,signal:e.signal,submit:e.submit})}});" +
  "let r=e.transport??`unknown`;throw Error(`Unsupported realtime Talk transport: ${r}`)}";

export const MANAGED_ROOM_REJECTION =
  "if(s===`managed-room`)throw Error(`Managed-room realtime Talk sessions are not available in this UI yet`);";

const count = (source, needle) => source.split(needle).length - 1;

export function patchVolcengineRtcManagedRoomUi(source) {
  assert.equal(typeof source, "string", "Control UI bundle must be text");
  const hasAfter = source.includes(TRANSPORT_FACTORY_AFTER);
  const hasRejection = source.includes(MANAGED_ROOM_REJECTION);
  if (hasAfter) {
    assert.equal(count(source, TRANSPORT_FACTORY_AFTER), 1, "managed-room UI patch is ambiguous");
    assert.equal(hasRejection, false, "managed-room UI patch is partial");
    assert.equal(count(source, TRANSPORT_FACTORY_BEFORE), 0, "old transport factory remains");
    return source;
  }
  assert.equal(count(source, TRANSPORT_FACTORY_BEFORE), 1, "transport factory anchor drifted");
  assert.equal(count(source, MANAGED_ROOM_REJECTION), 1, "managed-room rejection anchor drifted");
  return source
    .replace(TRANSPORT_FACTORY_BEFORE, TRANSPORT_FACTORY_AFTER)
    .replace(MANAGED_ROOM_REJECTION, "");
}
