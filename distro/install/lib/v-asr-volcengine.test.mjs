// The voice-message transcriber sends V's Flash ASR request and prints only the text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transcribe, buildRequest, ENDPOINT, RESOURCE_ID } from './v-asr-volcengine.mjs';

const audio = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v-asr-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = path.join(dir, 'voice.ogg');
  fs.writeFileSync(f, Buffer.from('OggS fake audio'));
  return f;
};
const reply = (status, body, message = '') => ({ status: 200, headers: new Headers({ 'x-api-status-code': status, 'x-api-message': message }), text: async () => JSON.stringify(body) });

test('request matches V: endpoint, resource id, key header, base64 audio with its format', async (t) => {
  const f = audio(t);
  let seen;
  const text = await transcribe(f, { apiKey: 'k-test', fetchImpl: async (url, init) => { seen = { url, init }; return reply('20000000', { result: { text: ' 你好 V ' } }); } });
  assert.equal(text, '你好 V');
  assert.equal(seen.url, ENDPOINT);
  assert.equal(seen.init.headers['X-Api-Key'], 'k-test');
  assert.equal(seen.init.headers['X-Api-Resource-Id'], RESOURCE_ID);
  const body = JSON.parse(seen.init.body);
  assert.equal(body.audio.format, 'ogg');
  assert.equal(Buffer.from(body.audio.data, 'base64').toString(), 'OggS fake audio');
  assert.equal(body.request.model_name, 'bigmodel');
  assert.deepEqual(buildRequest('x', Buffer.from('')).audio.format, 'mp3');
});

test('failures are errors, and the key never appears in them', async (t) => {
  const f = audio(t);
  await assert.rejects(transcribe(f, { apiKey: '' }), /VOLCENGINE_API_KEY is not set/);
  await assert.rejects(transcribe(f, { apiKey: 'k-secret-1', fetchImpl: async () => reply('45000010', {}, 'invalid key') }),
    (e) => /status 45000010/.test(e.message) && !e.message.includes('k-secret-1'));
  await assert.rejects(transcribe(f, { apiKey: 'k', fetchImpl: async () => reply('20000000', { result: { text: '' } }) }), /empty transcript/);
});
