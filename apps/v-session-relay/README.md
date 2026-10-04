# v-session-relay

让 Tianyi 在任何一个对话（私聊、群、Taskroom）里叫 V 把一件事交给另一个对话去做，做完的结果自动回到原来的对话，原来那个 V 被唤醒接着干。机制与 Claude Code 的跨会话消息、Grok Bot 的 bot 交接一样：传的是 session，不是另起 agent。两边在飞书里各有一张收起的对话卡片，点开就是两个 V 的来回。

```
A 对话（Tianyi 说话） ── session_relay_send ──► 账本 queued
                                               │ Gateway 派送服务
B 的 V 跑一轮（deliver: false），回复回到账本      │ 等这一轮跑完（不限 30 秒）
A 的 V 被唤醒（deliver: false）                    │
  ├─ 又传话给 B（回答它的追问）→ 下一轮，同一条线程   │
  └─ 不再传话 → 它这轮说的话发到 A 的聊天里          ┘
两边聊天里各有一张「A ⇄ B · 状态 · N 条」卡片，默认收起，随对话实时更新；点开看两个 V 的全部对话。
```

## 为什么不用原生 sessions_send

OpenClaw 2026.9.1 的 `sessions_send` 在不等待模式下只盯 30 秒，目标做得更久回复就丢；回传的来回轮次 `deliver:false`，飞书两边都看不见；最后的 announce 只发到目标频道。9.8 改成"回复只回一次"，但等待仍在进程内、重启就丢。这里改用插件运行时的 `subagent.run({sessionKey})` + `waitForRun`（desktop-handoff「页面交还唤醒 V」用的同一个接口），飞书展示由插件自己发卡片、改卡片。

## 规则

- **只有 owner 能发起**：身份取 Gateway 给工具的 `requesterSenderId`（claude-cli/Codex 回环用 `senderIsOwner`），owner 名单是插件配置 `owners`，没配就用 `commands.ownerAllowFrom`。模型参数里的身份一律不信。
- **执行方不能再转交**：一个对话正在处理别人转来的任务时，它的工具调用被拒，A→B→C 和 A↔B 来回都起不来。
- **回信唤醒的那一轮可以继续派**：属于同一条链，链上最多 `maxChain`（默认 8）次。
- **不丢回信**：每次传话是 `storeDir` 里的一个 JSON 文件，状态 queued → delivering → running → replying → done/failed。Gateway 重启后派送服务从文件接着做；`agent.wait` 不认识的旧 run 就读目标对话的最后一条回复；实在拿不到就告诉 A「重启打断了」，不会静默。
- **群名可以直接说**：`target` 可以是群名（在 V 所在的群里模糊匹配，多个匹配会让 V 先问）、`oc_` 群 id 或 session key；有 binding 的群按 binding 找 agent。

## 工具

- `session_relay_send {target, message}`：交出去，立即返回；V 回一句「已经让「X」去做了」后结束本轮。
- `session_relay_status`：本对话发出/收到的传话及状态。

## 配置

```json
{
  "storeDir": "/home/openclaw/.openclaw/v-session-relay",
  "owners": ["feishu:ou_…"],
  "ownerName": "Tianyi",
  "maxChain": 8
}
```

`storeDir` 必须是 Gateway 和 worker 都能读写的同一个目录。V 上 worker 读第二份配置（`memory: v-worker-config-second-file`），插件要在两份配置里都声明。

## 测试

```sh
cd apps/v-session-relay/plugin && node --test 'tests/*.test.mjs'
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner session-relay --plan "$PWD/lab/candidate/session-relay.plan.json"
```

候选测试是私有 Gateway + 真实 worker + DeepSeek，飞书走本机 webhook（不和共享 VLab 抢长连接），但发出去的卡片和回复是真的，会出现在 owner 的 VLab 私聊和「VLab 发布验收 B」群。

## 还没做

- 插话（steer）：目前目标在忙时排队，等它这一轮结束再处理。
- 对话视图网页（两边对话并排看）。
- 非飞书对话（Control UI 等）只走 session，不发卡片。
