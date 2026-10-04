# V Experience：把飞书体验带到所有渠道

2026-10-04 CST 起草。基线：生产 V 跑的 OpenClaw 2026.9.1（db91.6 + V 补丁）。
渠道顺序（Tianyi 10/04 定）：Telegram → 钉钉 → 企业微信 → Teams。
10/04 凌晨更新：Telegram 只用原生功能、开配置即可；主力是钉钉和企业微信。
基于 9.1 做，但新代码要能原样搬到以后的升级线。

## 1. 体验清单

飞书上的 11 项，按「缺了会怎样」分三类。

| # | 体验 | 类别 | 飞书实现位置 |
|---|---|---|---|
| A1 | Ask User：卡片内点选（1–3 题、多选、自定义回答），也可直接在聊天里打字回答 | 卡死类 | `lab/release-files/feishu-ask-user/`，monitor 补丁 v4 |
| A2 | 审批卡发 owner 私聊（批准 / 总是允许 / 拒绝，结果原地改写） | 卡死类 | `lab/release-files/feishu-dm-approvals/`，新增 `v-feishu-approvals.js` |
| A3 | 密钥录入卡（密码框，值不进聊天记录） | 卡死类 | `lab/release-files/feishu-secret-entry/`，含 core 补丁 |
| A4 | 「电脑」接管卡（实时截图 + 接管 / 我完成了 / 跳过） | 卡死类 | `apps/v-desktop-handoff/plugin/` |
| B1 | 过程流式输出：模型的工作说明逐句出现在回复里，工具状态行，正式回答开始后替换 | 可见性 | monitor 补丁 visible-progress 系列 + core `reply-prefix` |
| B2 | 进度清单：☑️ / ▶️ / ◻️ 工作清单在回复底部 | 可见性 | `lab/release-files/feishu-progress-stream/` |
| B3 | 后台任务行：`⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1` → `☑️ 后台任务已结束` | 可见性 | `lab/release-files/feishu-task-status/` |
| B4 | Runtime 页脚（回复末尾显示当前 harness） | 可见性 | core `reply-prefix` + monitor display 补丁 |
| C1 | 切换 Harness：`/model`、`/vcc`、`/vcodex`、`/vds`，非 owner 也可切自己的会话 | 控制 | core `command-auth` 补丁（写死 `providerId === "feishu"`） |
| C2 | 回复中插话（steer）：回复进行中发的消息注入当前回合 | 控制 | monitor steer 补丁，受 `VLAB_FEISHU_STEER_*` 环境变量控制 |
| C3 | 夜班完成通知、「需要你」 | 通知 | v-nightshift 仓库，不在本计划内 |

## 2. 能力矩阵

「原生」指 9.1 上游自带；「V」指 V 已在飞书上补齐；「—」指没有。
证据：Telegram / Teams / 飞书查的是 `~/openclaw-versa` 的 `v2026.9.1` tag；钉钉、企业微信查的是 V 上安装的插件
（`@dingtalk-real-ai/dingtalk-connector` 0.8.26、`@wecom/wecom-openclaw-plugin` 2026.8.17-vlab.2）。

| 体验 | 飞书 (V) | Telegram 9.1 | 钉钉 | 企业微信 | Teams 9.1 |
|---|---|---|---|---|---|
| 回复文字流式 | 原生 | 原生（编辑消息，V 上默认 progress 模式） | 有（AI 卡片，800 ms） | 有（流消息，**6 分钟后不能再改**） | 仅 1:1 |
| B1 过程流式 | V | 原生（共享 progress compositor：💬 说明、🧠 推理、工具行） | — | — | 仅 1:1 progress 模式 |
| B2 进度清单 | V（订阅 `progressCard.put`） | 原生（实测：worker 的 `progress_card` 经 `onPlanUpdate` 显示为 ▸/▢/✅） | — | — | 半原生（同 Telegram，仅 1:1） |
| B3 后台任务行 | V | — | — | — | — |
| B4 Runtime 页脚 | V | — | — | — | — |
| A1 Ask User | V（1–3 题、多选、自定义） | **实测卡死**：worker 的问题不显示选项，打字回答要等问题超时才被处理 | **实测卡死**：问题被丢弃 | **实测卡死**：问题不显示，回答排在等待的回合后面 | 只能打字回答 |
| A2 审批卡 | V | 原生（V 上 10/03 已关） | — | — | 原生（仅默认账号） |
| A3 密钥录入 | V | —（只发 Control UI 链接，V 没配 publicOrigin → 报错） | — | — | — |
| A4 接管卡 | V | 走插件的 `message send --presentation` 通用回退，待实测 | 同左 | 同左 | 同左 |
| C1 切换 Harness | V | `/model` 原生 + 模型选择按钮；Telegram 只放行 Tianyi，权限问题不存在 | 命令权限**写死为已授权** | 命令权限**写死为已授权** | 只能打字 |
| C2 插话 | V（状态待核实） | 待查 | 待查 | 待查 | 待查 |
| 按钮回调 | 有 | 有（callback_query） | **没订阅**（`TOPIC_CARD`） | 有（`template_card_event`，5 秒内改卡） | 有（Adaptive Card invoke） |
| 改已发消息 | 有 | 有 | 有（卡片实例随时可改） | 只有流消息 6 分钟内 | 有 |

要点：

- **Telegram 是上游支持最完整的渠道**。它用上游的 `createChannelProgressDraftCompositor`
  （`src/channels/progress-draft-compositor.ts`）渲染过程、计划和审批事件，Teams 也用它。
  飞书没用它，是 V 自己手写的。v-experience 在 Telegram 上主要是**补缺口**，不是重做。
- Worker 已把 `onPlanUpdate`、`onItemEvent`、`onToolStart`、`onCommandOutput` 等回调全部转发给 Gateway
  （`experiments/agent-worker-isolation-v1/harness-event-contract.mjs`），渠道侧看到的和内置 runtime 一致。
- 钉钉底子好：卡片随时可改，缺的是按钮回调订阅和带按钮的卡片模板。
- 企业微信受平台限制：流消息 6 分钟、按钮点击后 5 秒内改卡，之后状态无法再变。

## 3. 架构

### 3.1 现状

飞书的体验逻辑大部分堆在一个打包文件 `monitor.account-WFdlCDhR.js` 里，叠了约 6 层补丁。
但其中与渠道无关的部分其实已经有独立源码，合计约 1000 行：

- Ask User：`feishu-ask-user/runtime.mjs`（去重、选择暂存、resolve、失败取消）、`chat.mjs`（聊天回答解析）
- 后台任务行：`feishu-task-status-render.mjs`
- 进度清单：`feishu-progress-stream-render.mjs`
- 审批：`feishu-dm-approvals/core.mjs`、`module.mjs`

Gateway 层已有可复用的挂点（都是 V 的 core 补丁或上游原生）：

| 挂点 | 来源 |
|---|---|
| `Symbol.for("openclaw.v.progressCardChangedListeners")` → `{sessionKey, card}` | V core 补丁 `progress-card` |
| `Symbol.for("openclaw.v.taskRegistryBridge")` → `listActive(sessionKey)`、`listeners` | V core 补丁 `task-registry-*` |
| `questionGatewayRuntime.subscribeRequested`、RPC `question.get` / `question.resolve` | V core 补丁 secret-entry runtime-v2 + 上游 |
| 审批 native runtime SDK、`approval.resolve` | 上游 |
| `responsePrefixContextProvider().agentRuntime` | V core 补丁 `reply-prefix` |
| 回复回调（`onPlanUpdate`、`onItemEvent` …） | 上游 |

两处 core 写死了飞书，推广前要改成按渠道配置：

- secret-entry：`builtin-openclaw` 只在 `messageChannel === "feishu"` 时挂 `channelData.vSecretEntry`
- 命令权限：`command-auth` 只认 `providerId === "feishu"`

### 3.2 目标

```
Gateway 挂点（progressCard / taskRegistry / question / approval / 回复回调）
        │
   v-experience（与渠道无关）
     - 会话级状态：当前回复、进度清单、后台任务、待答问题
     - 规则：去重、节流、何时显示/隐藏、回答校验、owner 判定
     - 输出「要显示什么」：结构化的 view model
        │
   渠道适配器（每个渠道一份，越薄越好）
     - render(viewModel) → 飞书卡片 / Telegram 文本+按钮 / 钉钉 AI 卡片 / 企微模板卡片 / Adaptive Card
     - 原地更新、按钮回调解析、回调时限
```

- v-experience 是 V 自己的代码，放在本仓库 `apps/v-experience/`，有单元测试，构建成一个 ESM 模块。
- 在 9.1 上，它以 `Symbol.for("openclaw.v.experience")` 挂在 Gateway 进程里；渠道补丁只做两件事：
  回复开始时向 v-experience 要会话句柄，并提供 renderer。
- 升级时 v-experience 本身不动，只需把上表的挂点在新版本里重新接上。
- 能用上游的就用上游：Telegram / Teams 的过程和计划显示走上游 compositor，
  v-experience 只把 V 自有事件（`progress_card`、后台任务）喂进去。

### 3.3 迁移顺序：先新渠道，后飞书

飞书现在很稳定，不先动它。做法是「绞杀式」迁移：

1. 从飞书的源码模块里**复制**中立逻辑到 `apps/v-experience/`，补测试；
2. Telegram 第一个用它，在 VLab 验收；
3. 钉钉、企业微信接上，模块在三个渠道上稳定后；
4. 再让飞书改用同一个模块，验收标准是飞书行为完全不变。

代价是一段时间内飞书和 v-experience 各有一份相同逻辑；好处是任何时候都不会影响现在的飞书体验。

## 4. 分阶段计划

### 阶段 T0：Telegram 测试环境

- VLab 需要一个**独立的** Telegram 测试 bot。由 Tianyi 用 BotFather 创建，并自己把 token 写进 VLab 配置；
  绝不复用生产 bot。
- 验收驱动：Mac 上的 Telegram 桌面版登录 Tianyi 账号，由 agent 用 computer use 发消息、点按钮。
  （Bot API 不能以用户身份发消息，所以不能像飞书那样用 lark-cli。）

### 阶段 T1：Telegram 实测基线

在 VLab Telegram 上，用 worker、`/vcodex`、`/vds`、`/vcc` 四个 harness 把第 1 节每一项跑一遍，
记录实际效果。代码阅读得出的矩阵只是假设，以实测为准。

### 阶段 T2：Telegram 补缺口（按优先级）

1. A1 Ask User 多题 / 多选：内联键盘勾选 + 确认按钮，复用飞书的暂存与校验逻辑。
2. A3 密钥录入：Telegram 没有密码框，需要选方案（见第 5 节）。
3. A4 接管卡：实测通用回退；不够就写 Telegram renderer（图片 + 按钮，状态原地改写）。
4. B2 进度清单：把 `progress_card` 事件喂进上游 compositor 的 `pushPlanProgress`。
5. B3 后台任务行、B4 Runtime 页脚：在回复消息末尾追加，结束后编辑更新。
6. A2 审批：是否把审批同时发到 Telegram 由 Tianyi 决定；能力是原生的，只是 V 上关着。

### 阶段 D / W / M：钉钉、企业微信、Teams

每个渠道重复 T0 → T1 → T2，只新写 renderer。前置工作：

- 钉钉：自建带按钮的卡片模板，订阅 `TOPIC_CARD` 回调；给回复派发接上 `onToolStart` / `onPlanUpdate`。
- 企业微信：插件代码直接生成模板卡片（不再靠 LLM 输出 JSON）；接受 6 分钟 / 5 秒的平台限制，做降级。
- Teams：Azure Bot 注册耗时最长，提前开始；群聊没有流式，进度只能在 1:1 里显示。

### 阶段 F：飞书切到 v-experience

见 3.3。

## 5. 待定事项

- Telegram 上的密钥录入：
  ① 配置 `gateway.publicOrigin`，走上游 Control UI 链接（也顺带解决
  「V 不肯存聊天里的凭据」那条死锁）；
  ② Telegram Mini App 表单；
  ③ 让用户直接发，bot 读取后立刻删除该消息。
  倾向 ①，因为它对所有渠道都通用。
- 钉钉、企业微信插件是第三方包，改动按「打补丁 + 记入捕获」流程管理，升级插件时要重打。

## 6. 相关安全问题（单独处理）

钉钉和企业微信两个插件都把 `CommandAuthorized` 写死为 `true`；企业微信的私聊和群聊策略又都是 `open`。
任何能给机器人发消息的人都能执行本应只有 owner 能用的命令。这和体验工作无关，应单独修。

## 7. 实测结果（2026-10-04）

做法：真实的钉钉 / 企业微信 / Telegram 插件跑在 VLab candidate 的私有 Gateway 里，
平台换成本地假服务器（`lab/candidate/*-fake-*.mjs`），每个场景都是 VLab Worker 上的真实模型回合
（deepseek-v4-flash）。插件代码按字节取自 V（`apps/v-experience/*/fetch-*.sh`）。

| 场景 | 钉钉 改前 | 钉钉 改后 | 企微 改前 | 企微 改后 | Telegram 原生 |
|---|---|---|---|---|---|
| 工作清单（progress_card + 工具） | 只有最终答案 | ✅ ▶️/✅ 计划 + ⚙️ 当前工具，结束只留答案 | 只有最终答案，无流式 | ✅ 同左，且正文流式输出（7 帧） | ✅ 原生（工具名英文） |
| 单选题 | ❌ 问题被丢弃，卡到超时 | ✅ 单独发中文问题，回「3」14 s 内继续 | ❌ 卡住 | ✅ 回「3」1 s 内继续 | ❌ 无选项，卡到测试超时 |
| 多选题 | ❌ 卡住 | ✅ 回「1、3」13 s 内继续 | ❌ 卡住 | ✅ 13 s | ❌ 问题超时后才把回答当新消息处理 |
| 凭据请求 | ❌ 卡住 | ✅ 提示本渠道不能安全输入并取消，V 立即回复 | ❌ 卡住 | ✅ 同左 | ❌ 停在 running |
| 后台任务行 | 无 | ✅ 卡片内 ⏳ → ☑️ | 无 | ✅ 回复内 ⏳，结束另发 ☑️ | 无 |

Candidate：钉钉改后 `49f7b919`、改前 `d0f2e11d`；企微改后 `6ea201be`、改前 `a81c684e`；
Telegram 原生 `503fe11b`。

10/04 Tianyi 决定 Telegram 也上全套（`apps/v-experience/telegram/patch.mjs`，改核心里的两个 Telegram chunk）。
Telegram 改后 `1b53a07e` 全过：单选题按钮一点即答（16 s 内继续），多选题勾选 + 确认，按钮消息原地改成「✓ 已选择：…」；
凭据给出提示并取消；回复后另发一条静音的后台任务行并编辑到「☑️ 后台任务已结束」。进度清单仍用原生。

实现要点（踩过的坑）：

- Worker 的提问不走回复 payload，要订阅 V 核心的 `Symbol.for("openclaw.questionChannelRequestedListeners")`；
  这个 Set 由核心在第一次提问时才创建，v-experience 要先建好，否则第一个问题收不到。
- 工具进度回调要通道声明 `allowToolLifecycleWhenProgressHidden`（飞书也是这样），否则核心不转发。
- 回答绕过插件自己的队列，直接 `question.resolve`（与飞书 #162 同一思路）。
- VLab 测新通道要把插件加进 `plugins.allow`，并加 `bindings → makaron`（与 V 一致），否则插件不加载或通道启动即退出。

没覆盖的：

- 钉钉 / 企微 App 里的实际渲染（AI 卡片 markdown、`<br>`、完成后再改卡片、企微 6 分钟限制下的长回合）——需要测试 bot。
- `/vcodex`、`/vds`、`/vcc` 三个 harness：candidate 只跑了 Worker。补丁不依赖 runtime（同飞书的挂点），但未实测。
- 群聊：补丁对群聊同样生效（按提问人匹配回答），未实测。
- Telegram 的提问卡死：修法同上，但要改核心里的 Telegram 代码，待 Tianyi 决定。

上 V 前还要做：合入 dev（需 Tianyi 授权）→ 共享 VLab 集成验收 → 两个第三方插件目录纳入捕获与漂移哨兵 → promote。

## 8. 真机验收（2026-10-04 上午）

VLab 测试机器人：钉钉「Vlab」（扫码注册，凭据在 VLab secrets）、Telegram `@v_lab_test_bot`；企业微信待建。
`lab/candidate/live-experience.mjs` 起私有 Gateway 接真实平台，agent 用 Mac 上的钉钉客户端发消息验收。

钉钉全部通过（截图见会话）：

- 工作清单：卡片里 ▸ 查资料（进行中）/ ☐ 写草稿 / ⚙ 正在运行命令… 实时变化，结束后只留答案。
- 问题：单独一条消息，编号选项；回「3」/「1、3」/「2」都在约 10 s 内被接住，回「✓ 已收到：…」。
- 问题之后的回答开在**问题下方的新卡片**里（真机上发现：原来会写回问题上方的旧卡片，要往上翻才看得到）。
- 后台任务行：卡片完成后追加「⏳ 后台 1 项进行中 · 子 agent」，子 agent 结束后变「☑️ 后台任务已结束」。

真机上发现并已修的问题：

1. 完成后的 AI 卡片只认 finalize 写入的内容，`PUT /card/instances` 改 `msgContent` 不显示；后台行改用再次 finalize 写入。
2. 等回答期间插件自己的「回复开始」回调会新开卡片，夹在问题和回答之间；改为等回答期间不开新卡。
3. VLab 到 `api.dingtalk.com`（IPv4 在新加坡）约 250 ms，正好卡在 Node 默认的 happy-eyeballs 尝试超时上，首次建卡偶发 ETIMEDOUT 退化成普通消息。测试环境用 `--network-family-autoselection-attempt-timeout=2000`；生产 V 是否也偶发待查。
4. 共享 VLab 配置里还挂着未打补丁的钉钉/企微插件副本（capability-alignment），测试时必须过滤掉，否则加载的是旧插件。

真机修复后，假平台回归 `bb3757b2` 五项全过（钉钉补丁 9d2f9ae0 之后）。

Telegram：bot 已接入私有 Gateway，Mac 端 Telegram 客户端连不上（需要代理），待验收。
