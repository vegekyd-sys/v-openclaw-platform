# v-experience-wecom-empty-reply — WeCom: 「✅ 已发送」 after a tool-only reply

The WeCom side of `v-experience-dingtalk-empty-reply` (V 2026-10-15). When the
agent sends its answer and a file with the message tool and the final is
empty, the plugin closed the reply stream with 「✅ 已收到」 (or, with the
stream already expired, sent 「✅ 已收到」 as a new message).

Built from V's live bytes (= `v-experience-channels/wecom/dist/src`, checked
2026-10-16) by `apps/v-experience/wecom/patch.mjs` on the plugin
2026.8.17-vlab.2 originals:

- the outbound (`sendText`, `sendMedia`, V's link and 「电脑」 cards) records
  each chat it delivered to (`noteChannelSend`, shared with DingTalk in
  `v-experience.mjs`);
- a reply with nothing of its own to show, in a turn that already delivered
  to the same chat, closes its stream with 「✅ 已发送」; without an open stream
  nothing is sent;
- every other case is unchanged (text, template card, media, 「✅ 已收到」 when
  nothing went out at all).

`manifest.json`: V's current sha256 (`before`) and the new one (`after`) for
`dist/src/{monitor,channel}.js` and `dist/src/v-experience.mjs` (the same file
as the DingTalk one). The plugin lives in
`/home/openclaw/.openclaw/extensions/wecom-openclaw-plugin/` on V, outside the
core capture; it takes effect at the next Gateway start.

Evidence: `lab/candidate/wecom-tool-only.plan.json` (fake WeCom robot socket,
real model turn on the VLab Worker), before and after.
