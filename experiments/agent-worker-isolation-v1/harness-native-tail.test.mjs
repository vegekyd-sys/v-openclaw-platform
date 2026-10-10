import assert from 'node:assert/strict';
import test from 'node:test';
import {buildHarnessAttemptResult, readNativeSessionMessages, readNativeTailEntries} from './harness-result.mjs';

const target = {agentId:'makaron', sessionKey:'agent:makaron:feishu:group:test', sessionId:'native-id'};

// A visible transcript served the way OpenClaw 9.1 serves it: anchors from the
// active-path index, pages after a validated cursor.
function pagedStore(messages, {generation = 'g1', pageSize = 1000, rejectCursor = false} = {}) {
  const entries = messages.map((message, position) => ({entryId:`e${position}`, seq:position + 1, message}));
  const calls = {anchors:[], pages:0, fullReads:0};
  return {
    calls,
    readTailAnchor: (scope, window) => {
      assert.deepEqual(scope, target);
      calls.anchors.push(window);
      const position = entries.length - 1 - window;
      return {generation, anchor: position >= 0 ? {eventSeq:1000 + position, messagePosition:position} : null};
    },
    readTailPage: async ({cursor, maxMessages, ...scope}) => {
      assert.deepEqual(scope, {...target, maxBytes:64 * 1024 * 1024});
      calls.pages += 1;
      let start = 0;
      if (cursor !== undefined) {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (rejectCursor || parsed.generation !== generation || parsed.version !== 1 || parsed.sessionId !== target.sessionId
          || parsed.agentId !== target.agentId || parsed.lastEventSeq !== 1000 + parsed.lastMessagePosition) {
          return {kind:'reset', reason:'anchor_moved', cursor:'x'};
        }
        start = parsed.lastMessagePosition + 1;
      }
      const page = entries.slice(start, start + maxMessages);
      const last = start + page.length - 1;
      return {kind:'page', entries:page, hasMore:last < entries.length - 1,
        cursor:Buffer.from(JSON.stringify({agentId:target.agentId, generation, sessionId:target.sessionId,
          lastEventSeq:1000 + last, lastMessagePosition:last, version:1})).toString('base64url')};
    },
    readVisibleEntries: async () => { calls.fullReads += 1; return entries; },
  };
}
const history = (n, startTime = 1000) => Array.from({length:n}, (_, i) => ({
  role:i % 3 === 0 ? 'user' : i % 3 === 1 ? 'assistant' : 'toolResult', timestamp:startTime + i, content:`m${i}`,
}));

test('a long session is read from a bounded tail that still covers the attempt', async () => {
  const messages = history(20_000);
  const store = pagedStore(messages);
  const entries = await readNativeTailEntries(target, {...store, minTimestamp:1000 + 19_950});
  assert.deepEqual(store.calls.anchors, [128]);
  assert.equal(entries.length, 128);
  assert.deepEqual(entries.map(e => e.message), messages.slice(-128));
});

test('the window grows until it reaches past the start of a long attempt', async () => {
  const messages = history(20_000);
  const store = pagedStore(messages, {pageSize:1000});
  const startedAt = 1000 + 20_000 - 1500; // the attempt appended 1500 messages
  const entries = await readNativeTailEntries(target, {...store, minTimestamp:startedAt});
  assert.deepEqual(store.calls.anchors, [128, 512, 2048]);
  assert.deepEqual(entries.map(e => e.message), messages.slice(-2048));
  const inAttempt = entries.filter(e => e.message.timestamp >= startedAt);
  assert.equal(inAttempt.length, 1500);
});

test('without a start time the tail must include a user turn', async () => {
  const messages = [...history(10), ...Array.from({length:300}, (_, i) => ({role:'toolResult', timestamp:5000 + i, content:'x'}))];
  const store = pagedStore(messages);
  const entries = await readNativeTailEntries(target, store);
  assert.deepEqual(store.calls.anchors, [128, 512]);
  assert.equal(entries.length, messages.length); // window 512 exceeds the session: read from the start
  assert(entries.some(e => e.message.role === 'user'));
});

test('a short session is read from its start in one page', async () => {
  const messages = history(40);
  const store = pagedStore(messages);
  const entries = await readNativeTailEntries(target, {...store, minTimestamp:1030});
  assert.deepEqual(store.calls.anchors, [128]);
  assert.deepEqual(entries.map(e => e.message), messages);
});

test('a refused cursor or missing generation falls back to the full visible read', async () => {
  const messages = history(1000);
  for (const store of [pagedStore(messages, {rejectCursor:true}), {...pagedStore(messages), readTailAnchor:() => ({generation:undefined, anchor:null})}]) {
    const {readVisibleEntries, ...tail} = store;
    assert.equal(await readNativeTailEntries(target, {...tail, minTimestamp:1990}), undefined);
  }
});

test('an attempt longer than the window cap is not served from a tail', async () => {
  const messages = history(20_000);
  const store = pagedStore(messages);
  assert.equal(await readNativeTailEntries(target, {...store, minTimestamp:1000, tailMaxMessages:2048}), undefined);
});

test('the attempt result built from the tail equals the one built from the full read', async () => {
  const spawn = (time, runId) => ({role:'toolResult', timestamp:time, toolName:'sessions_spawn',
    content:[{type:'text', text:JSON.stringify({status:'accepted', runId, childSessionKey:`agent:makaron:subagent:${runId}`})}]});
  const old = history(5000);
  const turn = [{role:'user', timestamp:9000, content:'new task'}, spawn(9001, 'current'),
    {role:'assistant', timestamp:9002, content:[{type:'toolCall', id:'c1', name:'exec', arguments:'{}'}]},
    {role:'toolResult', timestamp:9003, toolName:'exec', content:'ok'},
    {role:'assistant', timestamp:9004, content:[{type:'text', text:'完成。'}], stopReason:'stop'}];
  const messages = [...old, spawn(1500, 'historical'), ...turn];
  const store = pagedStore(messages);
  const {readVisibleEntries, ...tail} = store;
  const agentResult = {payloads:[{text:'完成。'}], meta:{agentMeta:{sessionId:'native-id'}}};
  const full = await buildHarnessAttemptResult(agentResult, {transcriptTarget:target, attemptStartedAt:9000, readVisibleEntries});
  const fromTail = await buildHarnessAttemptResult(agentResult, {transcriptTarget:target, attemptStartedAt:9000, ...tail});
  assert.equal(store.calls.fullReads, 1);
  const {messagesSnapshot:a, lastAssistantTextMessageIndex:ai, ...restFull} = full;
  const {messagesSnapshot:b, lastAssistantTextMessageIndex:bi, ...restTail} = fromTail;
  assert.deepEqual(restTail, restFull);
  assert.deepEqual(b, messages.slice(-128));
  assert.deepEqual(b[bi], a[ai]);
});

test('readNativeSessionMessages keeps an injected full reader (tests, legacy callers)', async () => {
  const store = pagedStore(history(10));
  const messages = await readNativeSessionMessages(target, {readVisibleEntries:store.readVisibleEntries});
  assert.equal(messages.length, 10);
  assert.equal(store.calls.pages, 0);
});
