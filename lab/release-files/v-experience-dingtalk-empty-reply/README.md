# v-experience-dingtalk-empty-reply — DingTalk: no placeholder after a tool-only reply

V 2026-10-15 20:30, DingTalk group `cid/oT7yihTu7YP/1xJo5vc4Q==`: the agent sent
its answer and an xlsx with the message tool and ended with an empty final
(`counts={"tool":0,"block":0,"final":0}`). The connector closed the AI card it
had created at the start of the turn with its group placeholder
「ℹ️ 暂未收到模型回复内容。…visibleReplies 需设为 "automatic"」 — above the real
answer, and pointing at a setting V already has.

Built from V's live bytes (= `v-experience-channels/dingtalk/dist`, checked
2026-10-15) by `apps/v-experience/dingtalk/patch.mjs` on the connector 0.8.26
originals:

- the channel's outbound (`sendText`, `sendMedia`, V's link and 「电脑」 cards)
  records each chat it delivered to (`noteChannelSend` in `v-experience.mjs`);
- an empty reply in a turn that already delivered to the same chat closes the
  pre-created card with 「✅ 已发送」 and sends nothing else (DingTalk has no
  API to recall an AI card); the card watchdog does the same;
- otherwise the connector's placeholder stays, and its visibleReplies text and
  log hint only appear when that setting is really missing (else the direct
  chat text 「好的 👌 有其他问题随时找我」).

`manifest.json` lists each file with V's current sha256 (`before`) and the new
one (`after`); `connection-DCvu-l09.mjs` is unchanged. The files live in the
connector's npm project on V
(`/home/openclaw/.openclaw/npm/projects/dingtalk-real-ai-dingtalk-connector-*/node_modules/@dingtalk-real-ai/dingtalk-connector/`),
outside the core capture; they take effect at the next Gateway start.

Evidence: `lab/candidate/dingtalk-tool-only.plan.json` (fake DingTalk open
platform, real model turn on the VLab Worker), before and after.
