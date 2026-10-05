# v-session-relay

让任何一个对话（私聊、群、Taskroom）里的 V 把一件事交给另一个对话的 V，对方做完后结果回到原来的对话，原来那个 V 被唤醒接着干。机制与 Claude Code 的跨会话消息、Grok Bot 的 bot 交接一样：传的是 session，不是另起 agent。

**入口只有原生 `sessions_send`**，这里不加新工具。两层：

| 层 | 位置 | 做什么 | 升级到 9.8 后 |
|---|---|---|---|
| 行为 | dist 补丁 `lab/release-files/sessions-send-reply-once/`（标记 `v-sessions-send-reply-once-v1`） | 回移 9.5 + 9.8（上游 1b9e70e2685）：不等待的发送会一直等到对方那一轮结束（原来 30 秒就放弃、回信丢失）；回复只回一次，作为发起方的新一轮（run id `sessions-send-result:<对方 run>`）；去掉看不见的 5 轮来回和发到对方频道的 announce | 删掉，用官方的 |
| 可见与可靠 | 本插件 `plugin/` | 两边聊天各一张收起的对话卡片；发起方不再传话时把它的话发出来；账本落盘，重启后或对方正忙被插入（steered）时补回信 | 保留 |

```
A 的 V 调 sessions_send ──► 对方 B 跑一轮（原生）
   │ after_tool_call：插件记账本              │ before_prompt_build：插件告诉 B 是谁要的、缺信息就问
   │                                         ▼
   │                             B 这一轮结束，回复回到核心
   ▼                                         │
A 被唤醒（核心补丁，run id 可预测）◄───────────┘ before_prompt_build：插件告诉 A 对方在问就再 sessions_send，交了结果就收尾
   ├─ 又 sessions_send 给 B → 同一条线程的下一轮
   └─ 不再发 → 插件把 A 这一轮的话发到 A 的聊天里
两边聊天里各有一张「A ⇄ B · 状态 · N 条」卡片，默认收起、一行，实时更新；点开每条是「V · 群名 · 时间」。
```

对方很快答完时，原生工具会当场把回复作为工具结果交给 A（inline），A 在同一轮里接着说，插件只画卡片。

## 规则

- **谁都能发起，接收方的 V 自己判断**：不做工程上的权限限制。插件在对方那一轮里写明是谁（Gateway 给的 requester；owner 显示为 `ownerName`）在哪个对话要的，对方按自己的 redline 和本对话上下文决定做不做、能不能把内容带回去。
- **只防兜圈**：正在回答别人请求的那一轮不能再转给第三方（`before_tool_call` 拦下）；一条线程最多 `maxChain`（默认 8）次。
- **不丢回信**：每次 `sessions_send` 是 `storeDir` 里的一个 JSON 文件。Gateway 重启丢了核心的进程内等待时，follower 从文件接着等对方、读对方最后一条回复，并用同一个 run id 唤醒 A（不会跑两次）；对方正忙被插入当前轮（`targetDisposition: steered`，9.1 核心不跟踪）时同样由 follower 补上。

## 配置

```json
{
  "enabled": true,
  "hooks": { "allowConversationAccess": true },
  "config": {
    "storeDir": "/home/openclaw/.openclaw/v-session-relay",
    "owners": ["feishu:ou_…"],
    "ownerName": "Tianyi",
    "maxChain": 8,
    "agentNames": { "dealclaw": "小元" }
  }
}
```

`before_prompt_build` 属于对话类 hook，必须开 `hooks.allowConversationAccess`。`storeDir` 必须是 Gateway 和 worker 都能读写的同一个目录。V 上 worker 读第二份配置（`memory: v-worker-config-second-file`），插件要在两份配置里都声明。

## 测试

```sh
cd apps/v-session-relay/plugin && node --test 'tests/*.test.mjs'
node --test tests/sessions-send-reply-once.test.mjs
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner session-relay --plan "$PWD/lab/candidate/session-relay.plan.json"        # 来回对话
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner session-relay --plan "$PWD/lab/candidate/session-relay-async.plan.json"  # 对方做 75 秒
```

候选测试在私有运行时里对自己的 `sessions-spawn-tool` 字节打核心补丁，飞书走本机 webhook（不和共享 VLab 抢长连接），卡片和回复是真的，会出现在 owner 的 VLab 私聊和「VLab 发布验收 B」群。

## 还没做

- 对方"后台异步干活"（spawn+yield、夜班、生图）时，回信是它这一轮的话，不是最终产物。
- 只回文字，不带图片和文件。
- claude-cli / vcodex / vds 下的 hook 与唤醒未验证；Gateway 真重启下的补回信只在单元测试里模拟过。
- 9.8 上游仍开着的相关问题（#164732 等）回移时没有带进来，升级时要复核。
