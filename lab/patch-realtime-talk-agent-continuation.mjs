import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const CONTROL_UI_ASSET_PATH = "assets/control-ui-boot-chat-DWTSrxxk.js";
export const CONTROL_UI_ASSET_BEFORE = Object.freeze({
  sha256: "6f9b3d199a587cd8ed85117b2bb21c0e0665682ec7a38692a95a8897c3358e57",
  size: 785580,
});

export const AUDIO_BACKLOG_BEFORE =
  "if(this.pendingAudioAppends.size>=vN){this.failAudioAppend(`Realtime Talk audio input fell behind`);return}";
export const AUDIO_BACKLOG_AFTER = "if(this.pendingAudioAppends.size>=vN)return;";

export const CONSULT_WAIT_OPTIONS_BEFORE =
  "client:t.client,runId:i.runId,timeoutMs:12e4";
export const CONSULT_WAIT_OPTIONS_AFTER =
  "client:t.client,runId:i.runId,sessionKey:i.agentSessionKey,agentId:i.agentId,timeoutMs:12e4";

export const CONSULT_SETTLE_BEFORE =
  "e.client.request(`agent.wait`,{runId:e.runId,timeoutMs:e.timeoutMs}).then(e=>{if(i)return;let t=iN(e);if(t){u(t);return}e?.status!==`timeout`&&(o=window.setTimeout(()=>{l(`OpenClaw finished with no text.`)},fN))}).catch(e=>{u(e instanceof Error?e:Error(String(e)))})";
export const CONSULT_SETTLE_AFTER =
  "e.client.request(`agent.wait`,{runId:e.runId,timeoutMs:e.timeoutMs}).then(async t=>{if(i)return;let n=iN(t);if(n){u(n);return}if(t?.status===`timeout`)return;try{if(!e.sessionKey)throw Error(`missing session`);let t=await e.client.request(`chat.history`,{sessionKey:e.sessionKey,...e.agentId?{agentId:e.agentId}:{},limit:20}),n=Array.isArray(t?.messages)?t.messages:[],a=[...n].reverse().find(t=>t?.role===`assistant`&&t?.__openclaw?.runId===e.runId&&rN(t)),o=rN(a);if(o){l(o);return}}catch{}i||(o=window.setTimeout(()=>{u(Error(`OpenClaw agent consult finished without a confirmed text result`))},fN))}).catch(e=>{u(e instanceof Error?e:Error(String(e)))})";

const count = (source, needle) => source.split(needle).length - 1;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function replaceExactlyOnce(source, before, after, label) {
  if (source.includes(after)) {
    assert.equal(count(source, after), 1, `${label} patched anchor is ambiguous`);
    assert.equal(count(source, before), 0, `${label} is partially patched`);
    return source;
  }
  assert.equal(count(source, before), 1, `${label} anchor drifted`);
  return source.replace(before, after);
}

export function patchRealtimeTalkAgentContinuation(source) {
  assert.equal(typeof source, "string", "control UI bundle must be text");
  let patched = replaceExactlyOnce(
    source,
    AUDIO_BACKLOG_BEFORE,
    AUDIO_BACKLOG_AFTER,
    "audio backlog",
  );
  patched = replaceExactlyOnce(
    patched,
    CONSULT_WAIT_OPTIONS_BEFORE,
    CONSULT_WAIT_OPTIONS_AFTER,
    "agent consult wait options",
  );
  patched = replaceExactlyOnce(
    patched,
    CONSULT_SETTLE_BEFORE,
    CONSULT_SETTLE_AFTER,
    "agent consult history recovery",
  );
  return patched;
}

function hashManifestAssets(assets) {
  const hash = createHash("sha256");
  for (const asset of assets) {
    hash.update(asset.path);
    hash.update("\0");
    hash.update(String(asset.size));
    hash.update("\0");
    hash.update(asset.sha256);
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function patchControlUiAssetManifest(source, asset) {
  const manifest = JSON.parse(source);
  assert.equal(manifest.version, 1, "unsupported Control UI asset manifest");
  assert(Array.isArray(manifest.assets), "Control UI manifest assets are missing");
  assert.equal(
    manifest.generation,
    hashManifestAssets(manifest.assets),
    "Control UI manifest generation drifted",
  );
  const matches = manifest.assets.filter((entry) => entry.path === CONTROL_UI_ASSET_PATH);
  assert.equal(matches.length, 1, "Control UI bundle manifest entry drifted");
  assert.deepEqual(
    { sha256: matches[0].sha256, size: matches[0].size },
    CONTROL_UI_ASSET_BEFORE,
    "Control UI bundle manifest value drifted",
  );
  Object.assign(matches[0], asset);
  manifest.generation = hashManifestAssets(manifest.assets);
  return `${JSON.stringify(manifest)}\n`;
}

export function describeAsset(content) {
  return { sha256: sha256(content), size: Buffer.byteLength(content) };
}
