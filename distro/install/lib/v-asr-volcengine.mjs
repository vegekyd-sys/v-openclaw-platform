#!/usr/bin/env node
// Voice-message transcription for OpenClaw's media pipeline, the way V does it:
// a `tools.media.models` CLI entry calls Volcengine BigASR Flash ("录音文件识别极速版")
// with the audio inlined as base64 and prints only the transcript.
//
//   v-asr-volcengine <audio file>        stdout: transcript; exit 1 on any failure
//
// Needs VOLCENGINE_API_KEY (new console, single key, Flash ASR enabled). The key
// never reaches stdout or stderr. Same request as V's
// openclaw-inbound-volcano-asr.sh (ai-jian-koubo skill) without the skill.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash';
export const RESOURCE_ID = 'volc.bigasr.auc_turbo';
export const MAX_BYTES = 100 * 1024 * 1024;

export function buildRequest(file, data) {
  const ext = path.extname(file).slice(1).toLowerCase() || 'mp3';
  return {
    user: { uid: 'v-distro' },
    audio: { data: data.toString('base64'), format: ext },
    request: { model_name: 'bigmodel', enable_itn: true, enable_punc: false, enable_ddc: false, show_utterances: true, enable_speaker_info: false },
  };
}

export async function transcribe(file, { apiKey = process.env.VOLCENGINE_API_KEY, fetchImpl = fetch, timeoutMs = 55_000 } = {}) {
  if (!apiKey) throw new Error('VOLCENGINE_API_KEY is not set');
  const stat = fs.statSync(file);
  if (stat.size > MAX_BYTES) throw new Error(`audio is ${stat.size} bytes; Flash ASR takes at most ${MAX_BYTES}`);
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': RESOURCE_ID,
      'X-Api-Request-Id': crypto.randomUUID(),
      'X-Api-Sequence': '-1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildRequest(file, fs.readFileSync(file))),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const status = res.headers.get('x-api-status-code');
  const body = await res.text();
  if (status !== '20000000') throw new Error(`Flash ASR failed: http ${res.status}, status ${status ?? 'none'}, ${res.headers.get('x-api-message') ?? ''}`.trim());
  const text = JSON.parse(body)?.result?.text?.trim();
  if (!text) throw new Error('Flash ASR returned an empty transcript');
  return text;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { process.stderr.write('usage: v-asr-volcengine <audio file>\n'); process.exit(2); }
  transcribe(file).then((t) => process.stdout.write(`${t}\n`), (e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}
