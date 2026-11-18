import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { resolveHarnessMessageChannel } from './harness-channel.mjs';

test('9.1 messageProvider preserves trusted Feishu channel across IPC', () => {
  assert.equal(resolveHarnessMessageChannel({messageProvider:'feishu', provider:'deepseek'}), 'feishu');
});
test('legacy explicit channel takes native precedence', () => {
  assert.equal(resolveHarnessMessageChannel({messageChannel:'wecom', messageProvider:'feishu'}), 'wecom');
});
test('does not manufacture a channel from model provider or session key', () => {
  assert.equal(resolveHarnessMessageChannel({provider:'openai', sessionKey:'agent:a:feishu:direct:u'}), undefined);
});
test('all channel-bound IPC fields use the same normalized value', () => {
  const source=fs.readFileSync(new URL('./index.mjs', import.meta.url),'utf8');
  const attempt=source.slice(source.indexOf('async function dispatchNativeHarnessAttempt'),source.indexOf('nativeHarnessStats.workerAttempts += 1'));
  assert(attempt.includes('const messageChannel = resolveHarnessMessageChannel(params);'));
  assert(!attempt.includes('params.messageChannel'));
  assert(attempt.includes('replyChannel: messageChannel'));
  assert(attempt.includes('channel: messageChannel'));
});
