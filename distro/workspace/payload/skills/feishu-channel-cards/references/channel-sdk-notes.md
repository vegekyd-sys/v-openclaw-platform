# Channel SDK Notes

## Use cases

Use Channel SDK for Feishu cards when the task needs:

- One card updated in place.
- Button callbacks that the Gateway routes back to the session (OpenClaw quick callback payloads).
- Realtime progress separate from final assistant text.
- Mobile-friendly customer-facing UX.

For simple text/file sends, prefer OpenClaw `message` tool.

## Target IDs

Use Channel SDK native target IDs, not OpenClaw message-tool prefixes:

- Group chat: `oc_*` → SDK infers `chat_id`.
- DM/open user: `ou_*` → SDK infers `open_id`.
- Do **not** pass `user:ou_*` to Channel SDK; it may be inferred as `user_id` and require extra employee-id scopes.
- Do **not** pass `chat:oc_*`; use bare `oc_*`.

## Outbound only: never open a WebSocket

Scripts use the Gateway's Feishu app credentials, and the Gateway already holds that app's event connection. Feishu delivers each event to **one** of the app's WebSocket connections, not to all of them. A script that opens its own connection takes a random share of the users' messages across every V chat, and those messages are lost: the script ignores them and Feishu does not redeliver. On 2026-10-09 a `live-card-state-runner.cjs` with a 6-hour timeout did this for 40 minutes.

Always create the channel with `transport: 'webhook'` (the template's `connect()` does this and refuses to run if a WSClient appears). Outbound `send` / `stream` / `updateCard` work over REST and need no connection. Never call `channel.on(...)`, `new WSClient(...)`, or `createLarkChannel` without `transport: 'webhook'` in V scripts.

## Connection lifecycle

One-shot scripts must still disconnect, and disconnect should have a timeout fallback:

```js
async function disconnect(channel) {
  try {
    await Promise.race([
      channel.disconnect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('disconnect timeout')), 3000)),
    ]);
  } catch (e) {
    console.error('disconnect failed:', e.message);
  }
}
```

Prefer:

```js
await withChannel('oc_xxx', async ({channel, chatId}) => {
  await streamCard(channel, chatId, initialDsl, async ({update}) => {
    update({status:'1/5 准备', progress:10});
    // work...
    update({status:'完成', progress:100, done:true});
  });
});
```

Set a realistic `timeoutMs` for long runners and exit when the task finishes.

## Long tasks

For long-running card tasks:

- Run the card runner in an isolated sub-agent or background process when the work may take time.
- Keep the inbound Feishu session responsive.
- Send one initial card, then update that same card in place.
- Do not merely send a start card and a final card.
- Do not duplicate final card contents in ordinary chat text.
- Store run/job IDs so callbacks can be routed and deduplicated.

### Report-web pattern

Use card progress for:

1. scan / gather source material
2. draft page
3. local build
4. deploy
5. online verify
6. final links

The web page itself is the final static artifact; the card is the live control/status surface.

## Callback handling

Clicks reach the Gateway, not your script. For callback buttons, include stable OpenClaw quick callback payloads:

```js
{oc:'ocf1', k:'quick', a:'project.card.accept', q:'accept', jobId:'...'}
```

Handler should:

1. Validate `jobId` and action.
2. Acknowledge quickly.
3. Update the card or send a follow-up.
4. Avoid duplicate execution on repeated callbacks.
5. Keep callback side effects idempotent.

## Failure handling

If card send/update fails:

- Send a concise plain-text fallback with the same user-facing summary.
- Say the card failed.
- Do not expose secrets, raw Authorization headers, or private local paths.
- Log detailed errors locally, not in the card.

If the card succeeds:

- Suppress duplicate ordinary text summaries.
- In OpenClaw/Feishu direct sessions, use `NO_REPLY` as final assistant response when the card already delivered the result.

## Current local SDK pattern

Current workspace examples import SDK from OpenClaw's plugin npm directory:

```js
const {createLarkChannel, LoggerLevel, Domain} = require('@@STATE_DIR@@/npm/node_modules/@larksuiteoapi/node-sdk/lib/index.js');
```

Read app config from `@@STATE_DIR@@/openclaw.json`, usually under `channels.feishu.accounts.default`.

This path is environment-specific; if packaging for another machine, make SDK path configurable with `LARK_SDK_PATH`.
