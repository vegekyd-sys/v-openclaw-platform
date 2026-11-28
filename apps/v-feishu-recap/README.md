# V 回顾（飞书群 Recap）

群顶部的置顶横条上有一个蓝色链接，点一下打开这个群的回顾页：一句话现状、需要你、进展、V 接下来、风险、时间线。桌面端在聊天右侧的侧边栏打开，手机端全屏。

这是一个独立进程，不进 Gateway。

- **读**：只读打开 agent 库，取该群会话最后 80 条、最多 160 KB。超过 32 KB 的行只看大小，不读内容。Gateway 主线程没有任何开销。
- **喂给模型的内容**：人和 V 说的话、V 调用的工具名。不含推理过程和工具输出。
- **生成**：有人打开页面时才生成，会话没有新消息就用缓存；`deepseek-v4-flash`，关闭推理，全局最多 2 个并发，同一群只跑一个。
- **身份**：飞书 OAuth（PKCE，不申请任何 scope），每次请求都用机器人令牌核对查看者在不在这个群。查不到成员名单一律拒绝。
- **飞书**：只用 HTTP API，不开长连接，所以不会和 Gateway 抢事件。

## 运行

需要环境变量 `RECAP_OPENCLAW_CONFIG`、`RECAP_AGENT_DB`、`RECAP_CACHE_FILE`、`RECAP_ORIGIN`、`RECAP_PORT`，以及配置里 `apiKey` 引用的 `DEEPSEEK_API_KEY`。登录回调 `<RECAP_ORIGIN>/recap/callback` 要先登记到飞书应用的「安全设置 → 重定向 URL」。

```sh
node server.mjs
node scripts/pin.mjs put oc_xxx      # 发入口消息并置顶，会替换群里现有的置顶
node scripts/pin.mjs remove oc_xxx   # 取消置顶
npm test
```

## 飞书置顶的实测（2026-10-31，V-Lab）

- 置顶富文本（post）消息时，里面的链接在横条上可以直接点。链接用 applink `mode=sidebar-semi`，桌面端在侧边栏打开。
- 置顶卡片消息要先跳到卡片再点按钮，多一步，所以不用。
- `PUT /im/v1/messages/:id` 后横条立刻更新，但消息会标「已编辑」，文字长了链接会被挤成省略号。所以入口文字固定。
- 一个群只有一个置顶位，`put_top_notice` 会直接替换人工置顶。私聊也能置顶；撤回被置顶的消息会一起移除置顶。
- 入口消息本身留在消息流里一条，另外有一条「V - Lab 置顶了内容」的系统提示。
