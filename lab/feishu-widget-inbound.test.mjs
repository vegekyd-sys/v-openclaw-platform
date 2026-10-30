import assert from 'node:assert/strict';
import test from 'node:test';
import { MARKER, patchFeishuMonitor } from './patch-feishu-widget-inbound.mjs';

const anchor = '	const { cfg, accountId, channelRuntime, runtime, chatHistories, fireAndForget, abortSignal } = context;\n';

test('registers one inbound per account, through handleFeishuMessage', async () => {
  const source = `const botOpenIds=new Map([["default","ou_bot"]]);const calls=[];async function handleFeishuMessage(p){calls.push(p);}
function registerEventHandlers(eventDispatcher, context) {
${anchor}}
registerEventHandlers(null,{cfg:{c:1},accountId:"default",channelRuntime:{},runtime:{}});
globalThis.__calls=calls;`;
  const patched = patchFeishuMonitor(source);
  assert(patched.includes(MARKER));
  new Function(patched)();
  const inbound = globalThis[Symbol.for('v.feishu.synthetic-inbound')].get('default');
  await inbound({ openId: 'ou_person', chatId: 'oc_g', chatType: 'group', text: '选 A', replyToMessageId: 'om_echo' });
  const [call] = globalThis.__calls;
  assert.equal(call.accountId, 'default');
  assert.equal(call.botOpenId, 'ou_bot');
  assert.equal(call.event.sender.sender_id.open_id, 'ou_person');
  assert.equal(call.event.message.chat_id, 'oc_g');
  assert.equal(JSON.parse(call.event.message.content).text, '选 A');
  assert.equal(call.event.message.reply_target_message_id, 'om_echo');
  assert.match(call.event.message.message_id, /^card-action-v-widget-/u);
  assert.equal(call.event.message.mentions[0].id.open_id, 'ou_bot');
});

test('refuses unknown monitors and double patching', () => {
  assert.throws(() => patchFeishuMonitor('nothing here'), /Expected exactly one/u);
  assert.throws(() => patchFeishuMonitor(patchFeishuMonitor(anchor)), /already patched/u);
});
