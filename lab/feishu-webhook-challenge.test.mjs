import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {authenticatedWebhookChallenge,patchWebhookChallenge} from './patch-feishu-webhook-challenge.mjs';
const key=createHash('sha256').update('fixture-encrypt-key').digest();
const encrypt=value=>{const iv=randomBytes(16),c=createCipheriv('aes-256-cbc',key,iv);return {encrypt:Buffer.concat([iv,c.update(JSON.stringify(value)),c.final()]).toString('base64')};};
const options={verificationToken:'fixture-token',decrypt:value=>{const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-cbc',key,b.subarray(0,16));return Buffer.concat([d.update(b.subarray(16)),d.final()]).toString();},safeEqual:(a,b)=>Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b))};
test('unsigned registration handshake requires encrypted challenge and correct token',()=>{
 assert.deepEqual(authenticatedWebhookChallenge(encrypt({type:'url_verification',challenge:'proof',token:'fixture-token'}),options),{challenge:'proof'});
 for(const value of [{type:'url_verification',challenge:'proof',token:'wrong'},{type:'url_verification',challenge:'proof'},{type:'event_callback',challenge:'proof',token:'fixture-token'},{type:'url_verification',challenge:{},token:'fixture-token'}]) assert.equal(authenticatedWebhookChallenge(encrypt(value),options),null);
 assert.equal(authenticatedWebhookChallenge({type:'url_verification',challenge:'proof',token:'fixture-token'},options),null);
 assert.equal(authenticatedWebhookChallenge({encrypt:'malformed'},options),null);
 assert.equal(authenticatedWebhookChallenge(encrypt({type:'url_verification',challenge:'proof',token:'fixture-token'}),{...options,verificationToken:''}),null);
});
test('patch is idempotent and fails on runtime drift',()=>{
 const input='\t\t\t\t\trespondText(res, 401, "Invalid signature");';
 const patched=patchWebhookChallenge(input);
 assert.equal(patchWebhookChallenge(patched),patched);
 assert.ok(patched.endsWith(input));
 assert.throws(()=>patchWebhookChallenge('changed'));
});
