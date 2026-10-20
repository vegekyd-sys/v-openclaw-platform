# 跨会话派活走飞书原生推送（2026-10-20，VLab candidate）

## 方向

Tianyi 2026-10-20：不要自建「A ⇄ B」卡片，两边都用飞书原生推送（卡片、文字、图片都行），就像对方群里有人发了一条消息、V 在自己的群里回复。

## 改了什么

原生 `sessions_send` 让对方那一轮和发起方被唤醒那一轮都跑在内部频道上（`deliver: false`、`sourceReplyDeliveryMode: "message_tool_only"`、`channel: INTERNAL_MESSAGE_CHANNEL`），所以两个飞书聊天里都看不到。

dist 补丁 `lab/release-files/sessions-send-reply-once/`（标记升到 `v-sessions-send-reply-once-v2`）在原来回移 9.5/9.8 的基础上多改两处：

| 位置 | 改成 |
|---|---|
| `sessions_send` 发给对方那一轮的 `sendParams` | `deliver: true`、`bestEffortDeliver: true`、`sourceReplyDeliveryMode: "automatic"`，去掉内部频道，投递目标按对方会话自己的飞书地址（"last"）解析 |
| `runAgentStep` 的 Gateway 调用 | 新增 `deliver` 参数；为 true 时同上。只有发起方的唤醒那一轮和"投递失败"提示那一轮传 true，其他 agent step 保持上游行为 |

补丁从 V 2026-10-20 的现网字节生成（`release/captured/v2026.9.1-db91.6-subagent-index-20261020/`，这个文件自 10/04 以来没变过）。v-session-relay 插件**没有加载**。

## 结果

candidate 私有 Gateway + worker 池（deepseek-flash），飞书 loopback webhook，出站是真的。结果由 owner 身份用 `lark-cli im +chat-messages-list` 读回两个聊天比对，不靠日志。

| 场景 | 「VLab 发布验收 B」群（对方） | owner 私聊（发起方） |
|---|---|---|
| 当场等（NT12834B-I） | 出现对方的回复「NT12834B-I 标题：v2.3 正式上线」 | 发起方本轮的回复 |
| 不等，对方跑 75 秒（NTBA1C5D-A） | 出现对方的结果「NTBA1C5D-A：… 02:19:35 PM」 | 先「已交给它。」；75 秒后**唤醒那一轮**把结果发出来（日志：`run=sessions-send-result:… channel=feishu to=ou_…`） |
| 对方发图片（NT12834B-M） | 文字 + 一张 image 消息 + 结尾说明，三条都在群里 | 发起方本轮的回复 |
| **对照组：不打补丁**，当场等（NTC8739C-I） | 只有准备那句「就绪」，**对方的回复没有出现**（会话里有，飞书里没有） | 发起方本轮的回复 |

结论：只改投递参数，对方那一轮和唤醒那一轮就走飞书原生出站，文字和图片都能到各自的聊天，不需要自建卡片。

## 观察到但还没处理的

1. **对方群里看不到"是谁要的、要什么"**：群里只出现对方 V 的回答，请求本身没有出现。要"飞书承载这个 session 的全部内容"，需要在对方那一轮开始前把请求作为一条原生消息发到对方群（例如「来自 Tianyi 私聊：…」）。
2. **不是流式卡片**：走的是最终出站（V 配置 `renderMode: auto` 下是 post 消息），没有平时回复那种流式卡片和工作清单。9.1 的流式卡片只在飞书入站链路里，要做就得让飞书插件暴露"按会话合成一条入站"的入口。
3. **发起方会自己等**：第一次异步场景里，发起方 V 没听"不要等"，自己用 `sleep` 等完再查对方历史、自己发了结论；唤醒那一轮随后就没话可说。第二次把要求说死才走了唤醒路径。这是行为问题，要写进 V 的 AGENTS.md（见 `v-bot-fleet-feasibility` 记忆 10/14 的条款草稿）。
4. 发起方想替对方往群里发图时被拦（`Delegated feishu:read requires the exact current conversation`），无害，对方自己发了。

## 还没验证

- vcodex / vds / vcc 三种 runtime 下的投递（这次只有 worker + deepseek-flash）。
- 对方正忙时插入当前轮（steered）的可见性；Gateway 重启后补回信（原插件的账本能力，这次没加载插件）。
- 三个 Task Room 群：建群、各自开工、互相传话、一个 coordinator 收齐（目标 3–5）。

## 复现

```sh
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner session-relay-native --plan "$PWD/lab/candidate/session-relay-native.plan.json"          # 三个场景
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner session-relay-native --plan "$PWD/lab/candidate/session-relay-native-async.plan.json"    # 只跑异步
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner session-relay-native --plan "$PWD/lab/candidate/session-relay-native-control.plan.json"  # 对照组
lark-cli im +chat-messages-list --chat-id oc_5afced473a29eb6f5fed3ba9966aa9ff --order asc --start "<开始时间>"   # 读回群
```
