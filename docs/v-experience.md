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
| C1 | 切换 Harness：`/model`、`/vcc`、`/vcodex`、`/vds`，非 owner 也可切自己的会话 | 控制 | core `command-auth` 补丁（V2 写死 `providerId === "feishu"`；V3 推广到所有渠道，见第 12 节） |
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
| A4 接管卡 | V | V（截图照片 + 接管 / 我完成了 / 跳过，原地改，见第 16 节） | V（actionCard：截图 + 三个按钮；卡片不能改，状态发一句话） | V（截图卡 + 按钮卡，点按钮 5 秒内改卡） | 通用回退 |
| C1 切换 Harness | V | `/model` 原生 + 模型选择按钮；Telegram 只放行 Tianyi，权限问题不存在 | 命令权限**写死为已授权**（已改，见第 12 节） | 命令权限**写死为已授权**（已改，见第 12 节） | 只能打字 |
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
- 命令权限：`command-auth` 只认 `providerId === "feishu"`（V3 已改为渠道列表，见第 12 节）

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
  10/04 晚：改做独立的一次性链接服务（Control UI 只给管理员），见第 12 节。
- 钉钉、企业微信插件是第三方包，改动按「打补丁 + 记入捕获」流程管理，升级插件时要重打。

## 6. 相关安全问题（单独处理）

钉钉和企业微信两个插件都把 `CommandAuthorized` 写死为 `true`；企业微信的私聊和群聊策略又都是 `open`。
任何能给机器人发消息的人都能执行本应只有 owner 能用的命令。这和体验工作无关，应单独修。

10/04 晚更正与修法见第 12 节：`/restart`、`/config` 等 owner 专属命令在 9.1 里另有 owner 检查，本来就执行不了；
真正敞开的是其余命令（`/status`、`/stop`、`/think`、`/compact`、行内指令等）。

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

## 9. 改成飞书式布局（2026-10-04 中午）

Tianyi 看了真机截图后指出：钉钉的样子跟飞书差得多——选项要能点、过程要流式展示，而不是一句「正在工作」。改为照飞书卡片的结构（从飞书插件代码读出，未查看他的飞书会话）：

- 卡片从上到下：问题前已写的内容 → 问题（答完收成「✓ 已选择：…」）→ 过程说明（最多 12 段，正式回答开始后由回答替换）→ 工具状态行 → `---` → 进度清单。
- 工具状态行直接调用 OpenClaw 的 `formatChannelProgressDraftLineForEntry`，与飞书同款（「🛠️ Exec」「🔎 Web Search」…）。
- 进度清单用飞书的 ☑️ / ▶️ / ◻️；钉钉不支持灰色和删除线（真机实测），只靠 ☑️ 区分。
- 问题嵌在回复卡片里：钉钉选项是 `dtmd://dingtalkclient/sendMessage?content=…` 链接（真机实测点击会以用户身份发出该文字），多选题点选后点「确认」；答完问题在卡片内收起，回答接着写在同一张卡片里，不再单独发问题、不再发「✓ 已收到」、不再拆卡片。企业微信无此类链接，选项编号打字回答，同样嵌在流式回复里。

真机：钉钉点「苏州」后 15 s 内在同一张卡片续写方案。假平台回归：钉钉 `56d6f731`、企微 `77565b74` 五项全过。

## 10. 钉钉真按钮（2026-10-04 下午）

Tianyi 要求钉钉做成真按钮。做法（调研见会话）：

- 模板只能在钉钉卡片平台网页建，没有 OpenAPI。先用钉钉官方开源的「循环渲染容器之交互组件的使用与服务端更新」表单模板（变量 title / form_fields / form_status / button_text / err_msg），测试期用其公开示例 ID `9f86e003-…schema`；上线前需导入到我们自己的应用并发布。
- 模板 ID 经环境变量 `V_DINGTALK_QUESTION_CARD_TEMPLATE` 传入（钉钉插件的渠道配置是 strict，不能加键）；不设则退回卡片内链接。
- 问题来了：回复卡片收尾并显示「❓ 请在下方卡片中回答」→ 发问题卡片（选项行 CHECKBOX_LIST / _MULTI，可选自定义文本，按钮「按这些选择继续」）→ 单选一点即答，多选勾选后按按钮 → 卡片原地变成「✓ 已选择：…」并禁用，聊天里不产生用户消息 → 回答在下方新开回复卡片。打字回答仍然有效，卡片同步收起。
- 点击经 Stream `TOPIC_CARD`（`/v1.0/card/instances/callback`）回到连接器，在 `connect()` 之前注册；回调的 ack 里直接带卡片更新。

假平台 `01f4cf12`：问题卡片 → 模拟点「苏州」→ 卡片「✓ 已选择：苏州」→ 新卡片「城市：苏州」；其余场景全过。

真机（candidate `44e09e67`，钉钉「Vlab」机器人，示例模板）：14:42:16 发出问题卡（杭州 / 苏州 / 南京 + 自定义文本），14:44:02 Tianyi 在卡片上点「杭州」→ Stream 回调到达 → 卡片变成「✓ 已选择：杭州」并禁用 → `question.waitAnswer` 返回 → 3 秒后回答在下方新卡片里写完（工具行 2 次、过程说明 10 条）。通过。

## 11. Telegram 飞书式布局、企业微信电脑端（2026-10-04 傍晚）

- Telegram：原生「Working」草稿换成工作视图（说明 + 飞书工具行 + 横线 + 清单），问题改为 HTML（粗体标题、选项只在按钮上），问题出现时过程消息让到下方，回答发出后过程消息删除。假平台 `8f287a69` 五项通过；新样式真机待测。
- 企业微信电脑客户端在流式消息结束前不显示任何内容（手机端正常流式，Tianyi 真机确认）。所以问题到来时，连同已写内容一起结束这条流，回答走插件现成的「流已过期」路径另发新消息；未回答的问题不在新消息里重复。假平台 `801b04f5` 通过、`b15fa5e8` 用真机那条消息以非主人身份连跑 3 遍通过；真机 17:42 通过（回「3」→「✓ 已选择：南京」+ 推荐）。
- 更正：ask_user 在 9.1 不分主人（只看主会话与 deny）；非主人少的 12 个是控制面工具（computer、nodes、sessions、gateway、automations 等）。17:07 两次「残缺工具调用」与此无关，新会话里未能复现。生产 V 的飞书 / 企业微信 / 钉钉都对所有人开放，主人只有 Tianyi 的飞书和 Telegram。

## 12. 切换 Harness（C1）推广到所有渠道，命令权限修正（2026-10-04 晚）

改了什么：

- core `command-auth` 补丁 V2 → V3（`lab/release-files/feishu-model-switch-roles/`）：「非 owner 只能用整条 `/model`」从只认飞书改为认
  `feishu`、`telegram`、`dingtalk-connector`、`wecom`、`msteams`。飞书行为不变（同一条正则）。`patch-runtime.mjs` 能把 V 现在的 V2 原地升级，
  也能直接打在原版 9.1 上，两者结果与仓库里的文件逐字节相同（`tests/model-command-roles.test.mjs`，原版由 V2 反推，哈希与 npm 9.1 一致）。
- 钉钉、企微补丁不再把 `CommandAuthorized` 写死为 `true`，改为和飞书 / Telegram 一样用 core 的
  `shouldComputeCommandAuthorized` + `resolveCommandAuthorizedFromAuthorizers`：只有像命令的消息、且发送者过了私聊白名单才算
  （`open` = 所有人；企微直接用插件自带的 `resolveWecomCommandAuthorization`，默认策略跟随 bot 入口的 `open`）。
- Telegram 补丁：配置了 `commands.allowFrom.telegram` 时，原生命令（菜单里的 `/model` 等）在拼出命令文字之前就做了授权，
  V3 规则看到空文字，连 `/model` 也拒。现在原生命令把自己的文字带进授权，模型选择按钮按 `/model` 算。

### 每个角色能做什么

规则只在该渠道配置了 `commands.allowFrom.<渠道>` 时生效；owner 来自 `commands.ownerAllowFrom`（带渠道前缀）。

| 渠道 | owner | 非 owner（能给机器人发消息的其他人） |
|---|---|---|
| 飞书 | 全部命令 | `/model`、`/model <别名或模型>`（只改自己会话）、`/new`、`/reset`；其他命令不执行；单独的 `/vcc` 等别名只当重置，消息里夹的行内指令被去掉 |
| Telegram | 全部命令 | 同飞书；V 上 Telegram 只放行 Tianyi（`allowFrom`），所以目前没有非 owner |
| 钉钉 | 全部命令（V 上没有配 owner） | 同飞书 |
| 企业微信 | 全部命令（V 上没有配 owner） | 同飞书 |
| Teams | 全部命令 | 同飞书（V 上 Teams 是 `pairing`，未在用） |

`/restart`、`/config`、`/debug`、`/allowlist` 写入等在 9.1 里本身就要求 owner（`rejectNonOwnerCommand` / `ownerOnly`），任何配置下非 owner 都执行不了。
第 6 节说的漏洞实际是：渠道没有 owner、也没配 `commands.allowFrom` 时，9.1 认为「没设 owner = 人人都算命令 owner」，
非 owner 能用 `/status`、`/stop`、`/think`、`/compact`、`/model`、行内指令等全部非 owner 专属命令。只改插件的 `CommandAuthorized` 关不上这个口子
（`open` 策略下人人都过白名单），要靠下面的配置。

### 生产配置（要 Tianyi 批准后才改；已做成 `lab/release-files/v-experience-multichannel/`，见第 19 节）

V 现在：`commands.ownerAllowFrom = ["feishu:<Tianyi>", "telegram:<Tianyi>"]`，`commands.allowFrom = { "feishu": ["*"] }`；
钉钉、企微、Slack 都是 `dmPolicy: open, allowFrom: ["*"]`、没有 owner。需要：

```json
"commands": {
  "ownerAllowFrom": ["feishu:<Tianyi>", "telegram:<Tianyi>"],
  "allowFrom": { "feishu": ["*"], "telegram": ["*"], "dingtalk-connector": ["*"], "wecom": ["*"] }
}
```

- 想让 Tianyi 在钉钉 / 企微也有 owner 权限，再加 `"dingtalk-connector:<staffId>"`、`"wecom:<userid>"`。
- 顺序：先部署 V3 core（飞书行为不变；V2 只认飞书，先改配置会让钉钉 / 企微非 owner 拿到全部命令），再改配置；两者都要重启，不能热加载。
- Teams 上线时再加 `"msteams": ["*"]`。Slack 同样敞开、但不在规则列表里，单独处理（加进列表或关掉）。

### 实测（假平台 candidate，真实插件 + VLab Worker）

场景 `model-roles`（`lab/candidate/model-roles.mjs`，各渠道 `*-model-roles.plan.json`）：owner 发 `/status` 作对照（有回复才说明命令通路是通的）；
非 owner 发 `/model vcc` → 回执 + Gateway `sessions.list` 里该会话的模型；再发 `/status`、`/config show`、`/restart`，
检查没有执行、渠道没有重连（Gateway 没重启）。

| 渠道 / 配置 | owner `/status` | 非 owner `/model vcc` | 会话 | 非 owner `/status` `/config` `/restart` |
|---|---|---|---|---|
| 钉钉，补丁 + 角色配置 | 有 | `Model set to vcc (anthropic/claude-opus-5) for this session only` | `anthropic/claude-opus-5`，runtime `claude-cli` | 都未执行 |
| 企微，补丁 + 角色配置 | 有 | 同上 | 同上 | 都未执行 |
| Telegram，补丁 + 角色配置 | 有 | 同上（原生命令） | 同上 | 都未执行（`You are not authorized to use this command.`） |
| 钉钉，原版插件 + 角色配置 | 有 | 同上 | 同上 | 都未执行（配置 + V3 core 本身就够） |
| 钉钉，V 现在的配置（无 owner、无 allowFrom） | 有 | 同上 | 同上 | **`/status` 执行了**；`/config`、`/restart` 被 owner 检查拦下 |
| 钉钉，只配 owner、不配 allowFrom | 有 | 不执行 | 未切换 | 都未执行 |
| 飞书（`feishu-model-switch-roles`，V3） | 9 项检查全过 | | | |

Candidate（按表格行序）：钉钉 `9d962118`、企微 `c5d02970`、Telegram `ecfa2b36`（三者在 `f376c5f2` 干净提交上）；
原版插件 + 角色配置 `bba5a98c`；V 现在的配置 `12e2df19`；只配 owner `033ebb6c`；飞书 `1cafc02d`。

没覆盖 / 待处理：

- 钉钉、企微、Telegram（文字命令）对被拒的命令显示 9.1 的兜底「No reply was generated for this message. This is usually a temporary model failure」，
  容易误解为模型故障；飞书是不回复。要改成「此命令仅限 owner」需要另改 core 的空回复兜底。
- 真机未测；`live-experience.mjs` 已按上面的角色配置启动（Telegram owner 来自 `LIVE_TELEGRAM_ALLOW`，钉钉 / 企微不加 owner），并对 runtime 打 V3。
- `/vds`、`/vcodex`：candidate 关了 Codex 插件，只测了 `vcc`；规则对任何 `/model <x>` 一样。
- 群聊未测（规则按发送者，与私聊相同）。

## 13. 凭据一次性链接（A3，2026-10-04 晚）

Telegram、钉钉、企业微信没有密码框，原来只能「提示本渠道不能安全输入 + 取消请求」。现在：

```
agent 调 secrets request ──> Gateway question（secretStore 绑定，15 分钟到期）
   │ questionChannelRequestedListeners
   ▼
渠道（v-experience）── POST /v1/links（loopback + admin token）──> v-secret-entry
   │ 私聊里发「🔑 V 需要凭据 X：请点开这个一次性链接…」+ https://…/secret-entry/#<token>
   ▼
用户浏览器：密码框 ── POST /secret-entry/api/submit {token, value}
   ▼
v-secret-entry ── question.resolve {answers:{secret_value:[value]}, resolvedBy:"<渠道>:secret-link:<提问人>"}
   ▼
Gateway 写凭据库（+ V 的 mode-600 镜像）、登记脱敏，secrets 工具拿到 "stored"，agent 继续
```

- 服务：`apps/v-secret-entry/`（无依赖 Node）。公网面只有页面、`api/info`、`api/submit`；管理面只在 loopback，Bearer admin token。
  令牌 32 字节、在 URL 片段里（不进访问日志、链接预览、Referer）、只存 sha256、只在内存；打开页面不消耗，成功提交一次即作废；
  有效期跟问题到期时间且不超过 15 分钟；Gateway 暂时失败可重试，5 次后关闭；问题已结束则关闭；同一问题重发会关闭旧链接。
  值不落盘、不进日志；审计只有 id / 问题 / 名称 / 渠道 / 提问人 / 时间。
- 调 Gateway 用 OpenClaw 自己的 CLI 传输（`plugin-sdk/gateway-runtime.js` 的 `callGatewayFromCli`，scope `operator.questions`），
  与 V 的运维脚本相同；所以服务以 Gateway 的用户运行、读 Gateway 自己的配置，本身不保存 Gateway 凭据。
- 渠道：`v-experience.deliverSecretQuestion` 统一处理。**链接只发在提问人的私聊里**：私聊直接发；群里改为私信提问人（Telegram
  `sendMessage(用户 id)`、钉钉机器人单聊 `oToMessages/batchSend`、企业微信 `sendMessage(userid)`），群里只说「录入链接已私信发给你」；
  私信发不出（如 Telegram 用户从没和 bot 说过话）就撤销链接、退回原来的提示 + 取消。服务没配置（Gateway 环境里没有
  `V_SECRET_ENTRY_ADMIN_URL` / `V_SECRET_ENTRY_ADMIN_TOKEN_FILE`）或签发失败，也退回提示 + 取消。Telegram 发链接时关掉链接预览。
- core：`patch-openclaw91-secret-entry.mjs` 新增 `channels-v1`（叠在 v1 上，也能直接升级 V 冻结的 builtin）：
  `messageChannel` 为 `telegram` / `dingtalk-connector` / `wecom` 时不再抛「Credential request unavailable here」，
  问题保持等待；飞书的卡片描述符不变。不在名单里的渠道行为不变。
  顺带修了这个脚本的两个老问题：直接 `node patch-openclaw91-secret-entry.mjs <dist>` 时 dist 参数被丢掉（只有带 `--check` 才能跑），
  以及 9.1 有不止一个 `builtin-openclaw-*.js`（按含 `toolName === "secrets"` 的那个定位）。

验收：`lab/candidate/telegram-secret-link.plan.json`（`telegram-experience.mjs` 的 `secret-link` 场景）——私有 Gateway + 假 Bot API +
真实 Worker 模型回合；同机起 v-secret-entry，从 bot 消息里取链接，HTTP 打开页面、提交随机值，断言问题提交前 pending、agent 回复
SECRET_SAVED、链接第二次用返回 410、没有出现取消提示，并扫描本轮写过的所有状态 / 数据文件、Gateway 与服务输出、bot 收发内容，
值只能出现在凭据库里（`secrets/` 镜像、状态库的 `secret_store_entries` 表）。

结果（10/04 18:3x，VLab candidate，deepseek-v4-flash + Worker）：

| 场景 | candidate | 结果 |
|---|---|---|
| Telegram 链接录入（`telegram-secret-link.plan.json`） | `be26c905` | ✅ 私聊收到「🔑 V 需要凭据 V_CANDIDATE_DEMO_TOKEN：请点开这个一次性链接…5 分钟内有效…」+ 链接（关了预览）；提交前问题 pending；提交 200，5 s 后回复 SECRET_SAVED；问题 `answered`、答案 `stored`、`resolvedBy=telegram:secret-link:70000001`；同一链接再用 410；扫描 1225 个本轮写过的文件，值只在 `secrets/store/…` 和 `state/openclaw.sqlite`(+WAL) 的 `secret_store_entries`，Gateway / 服务日志与 bot 收发 0 处 |
| Telegram 未配置服务的退路（core 已放宽，`TG_SECRET_CORE=1`） | `e5f66680` | ✅ 原提示 + 取消，agent 回 SECRET_UNAVAILABLE；单选题回归通过 |
| 钉钉 退路回归（补丁改动后） | `d31ac220` | ✅ `(credential, cancelled)`，SECRET_UNAVAILABLE；单选题回归通过 |
| 企微 退路回归（补丁改动后） | `74a50bc2` | ✅ 同上 |

链接的有效分钟数跟问题本身的到期时间走（这次 `secrets` 请求是 5 分钟）。第一次并发跑三个 candidate 时 VLab 磁盘短暂写满（ENOSPC），
之后都改为串行；共享实例未受影响（`openclaw-vlab-production-mirror-v8` 一直 active，事后剩余 29G）。

上 V 需要 Tianyi 批准的步骤（都未执行；10/05 起按第 19 节的发版流程走，下面保留为设计说明）：

1. 合入 dev；渠道补丁（Telegram core chunk、钉钉、企微插件）本身也还没上 V，要一起走共享 VLab 集成验收与 promote。
2. core：按线上字节重建 `builtin-openclaw-zQV8Wwjr.js`（`node patch-openclaw91-secret-entry.mjs --out-dir <dir> <线上 dist>`，只有 builtin 变），
   捕获进仓库、更新漂移哨兵。只改这一个 chunk，Worker 与 Gateway 共用同一份 dist，需要重启（stop → start）。
3. 服务：`/opt/v-secret-entry`（复制 `apps/v-secret-entry`，不含 tests），配置 `/etc/v-secret-entry/config.json`（见 `config.example.json`；
   `openclawDist` 填 V 的 Gateway 实际在跑的 dist），admin token `/etc/v-secret-entry/admin-token`（`openssl rand -hex 32`，属主 openclaw、0600，
   Gateway 进程要读它），状态目录 `/var/lib/v-secret-entry`（0700）。systemd 单元 `v-secret-entry.service`：`User=openclaw`，
   `Environment=HOME=/home/openclaw OPENCLAW_STATE_DIR=/home/openclaw/.openclaw OPENCLAW_CONFIG_PATH=<V 主配置>`，
   `ExecStart=<node> /opt/v-secret-entry/server.mjs /etc/v-secret-entry/config.json`，`Restart=on-failure`，`NoNewPrivileges=yes`、`PrivateTmp=yes`。
4. Gateway drop-in：`Environment=V_SECRET_ENTRY_ADMIN_URL=http://127.0.0.1:23961 V_SECRET_ENTRY_ADMIN_TOKEN_FILE=/etc/v-secret-entry/admin-token`（随第 2 步同一次重启）。
5. cloudflared（`/etc/cloudflared/v-dashboard.yml`）：在 `openclaw.tianyi.live` 的兜底规则之前加
   `- hostname: openclaw.tianyi.live` / `path: ^/secret-entry(?:/.*)?$` / `service: http://127.0.0.1:23960`；保留 `/email-template`、`/v-browser`、
   `/desktop-handoff`、`/voice` 等现有路由；`cloudflared ingress validate` 后只重启 `cloudflared-v-dashboard`（不动 Gateway）。
   验证 `https://openclaw.tianyi.live/secret-entry/healthz` 为 200、管理端口 23961 从公网不可达。
6. 钉钉群里私信提问人要机器人有单聊发消息权限（`oToMessages/batchSend`）；没有就自动退回提示 + 取消。

未覆盖 / 已知限制：

- 服务重启会让未用的链接全部失效（令牌只在内存）；问题照常 15 分钟到期，agent 收到超时后继续。
- 链接是不记名的：拿到链接的人在有效期内都能提交一次。所以只发私聊；群里私信不成就不发。
- 钉钉、企微的链接路径只有单元测试（`tests/v-experience.test.mjs`）与补丁语法检查，没有跑假平台 candidate；企微 `sendMessage(userid)` 能否从群里
  主动私聊、钉钉 batchSend 权限，都要真机确认。Telegram 群里私信的路径也只有单元测试。
- `/vcodex`、`/vds`、`/vcc` 没有实测：core 改动在 builtin（嵌入式 runtime 的提示投递），其他 runtime 走 runtime-v2 的问题监听，渠道侧相同。

## 14. 合并后全量回归、插话、接管卡、钉钉出字（2026-10-04 晚）

- 插话（C2）：钉钉、Telegram 不改代码即可（core 默认 steer）。企微两处阻塞：插件按会话串行排队；分发走高层入口、等当前回合结束。现在回复进行中的消息绕过插件队列，分发改用 `core.channel.reply.dispatchReplyFromConfig`（与钉钉连接器相同的低层入口），OpenClaw 把它插进当前回合；被插话的那条消息自己收到「✅ 已收到」（企微每条消息都要有一个结束的回复）。
- 接管卡（A4）：插件默认卡片渠道改为飞书 + Telegram（Telegram 原生渲染两个按钮）；钉钉、企微把卡片压成文字，改为 V 在回复里放 `[接管电脑](url)` 链接；卡片按钮命令 `requireAuth: false`（处理函数自己核对是不是收卡人）。生产 V 未覆盖 `cardChannels`，上线即生效。
- 钉钉出字：卡片数据更新在 INPUTING 状态下不渲染（真机 18:05 空卡 3 分钟），已回退为流式接口；保留节流 800→300 ms 和被节流更新的补发。企微节流 1 s→400 ms。Telegram 默认 progress 模式回答本来就是整段发出。
- 合并后全量回归（假平台）全部通过：Telegram `3cde346a`（progress、ask-single、ask-multi、secret、background、steer）；钉钉 `7506f6ef`（ask-card、progress、ask-single、ask-multi、secret、background、steer）；企微 `e858dda5`（同前六项）；Harness 权限 Telegram `0c61fdee`、钉钉 `cc82fb3c`、企微 `b8212161`；Telegram 凭据链接 `849ba4b1`。
- 真机测试（live）已带上凭据链接服务，页面只监听 VLab 的 tailnet 地址。

## 15. 原生卡片：凭据链接（A3）与接管卡（A4）上钉钉、企微、Telegram（2026-10-04 晚）

和飞书卡片一样：标题、一两行说明、一个按钮。共用一个「链接卡」结构（`v-experience.mjs`：`{title, lines, buttons:[{label,url}]}`），各渠道原生渲染，平台拒收卡片时退回文字链接（`sendCardOrText`）。

| | 钉钉 | 企微 | Telegram |
|---|---|---|---|
| 凭据链接 | `actionCard`（会话 webhook；群里私信走 batchSend `sampleActionCard`）：「🔑 V 需要凭据 X」+ 说明 + 允许的域名 +「链接只能用一次、N 分钟内有效；值不会出现在聊天记录里」，按钮「填写凭据」 | `template_card` `text_notice`：主标题 + 说明（desc），其余在副标题，跳转「填写凭据」，点卡片本身也打开链接 | HTML 消息 + 内联 URL 按钮「填写凭据」；`BUTTON_URL_INVALID`（非公网地址，VLab 的 tailnet IP）时改发原来的文字链接 |
| 接管卡 | `actionCard`「需要你接管 V 的电脑」+ 原因 + 「做完在聊天里回复『好了』…N 分钟内打开有效，接管最长 M 分钟」，按钮「接管电脑」 | `text_notice` 同样内容，跳转「接管电脑」 | 不变（接管电脑 + 交还给 V 两个按钮），标题同改为「需要你接管 V 的电脑」 |

- 钉钉链接包成 `dingtalk://dingtalkclient/page/link?url=<编码后的链接>&pc_slide=false`：按钉钉「消息链接说明」，`pc_slide=false` 让 PC 端用系统浏览器打开（true 是侧边栏），手机端在钉钉内置浏览器打开。只在假平台验证过参数，PC/手机实际打开方式要真机确认。
- 交还给 V 是回调按钮，钉钉 actionCard 和企微 text_notice 都发不回来，所以这两个渠道不放，说明里改成「在聊天里回复『好了』」；插件给模型的说明同步改（收到「好了」后查 `desktop_handoff_status`，仍在接管就提醒去页面点交还给 V）。
- 接管卡的投递：插件仍用 `openclaw message send --presentation`。钉钉 `deliveryMode: "direct"`，CLI 进程里连接器的 outbound 新增 `renderPresentation`（有链接按钮的 presentation → `channelData.vLinkCard`）和 `sendPayload`（发 actionCard；其他 payload 照旧走 sendText/sendMedia）。企微 `deliveryMode: "gateway"`，`message send` 到 Gateway 的旧 `send` 方法只带文字（core 在 CLI 里就把卡片压平），所以企微改走 `openclaw gateway call message.action`（Gateway 里 `gatewayOwnedDelivery`，同样经 `renderPresentation`/`sendPayload` 发 `template_card`）。插件 `DEFAULT_CARD_CHANNELS` 加上 `dingtalk-connector`、`wecom`；卡片发送失败仍退回「回复里放链接」。
- 补丁：钉钉多改 `runtime-C81EKBS1.mjs`（channel 插件 chunk），企微多改 `dist/src/channel.js`；基线字节在各自 `baseline/`。钉钉出字（流式 300 ms 节流）未动。

假平台 candidate（真实 Worker 模型回合，每个 plan 单独跑）：

| plan | candidate | 结果 |
|---|---|---|
| `dingtalk-handoff-card` | `fd9b8199` | ✅ batchSend `sampleActionCard`：标题、原因、「做完在聊天里回复『好了』…10 分钟内打开有效，接管最长 30 分钟」、按钮「接管电脑」，链接 `dingtalk://…pc_slide=false` 包着 `/desktop-handoff/#…`，用这个令牌 claim 200；回复「接管卡片已发出，完成后回复『好了』。」不含链接；Worker 配置（Gateway 派生）带插件与假渠道 |
| `wecom-handoff-card` | `60201ca5` | ✅ `message.action` 477 ms → `aibot_send_msg` `template_card` `text_notice`，jump_list/card_action 指向 `/desktop-handoff/#…`，claim 200，回复不含链接 |
| `dingtalk-secret-link` | `5c301a65` | ✅ 会话 webhook `actionCard`「🔑 V 需要凭据 V_CANDIDATE_DEMO_TOKEN」+「填写凭据」；页面提交 200、再用 410、SECRET_SAVED；值不在 Gateway/服务日志、聊天、审计 |
| `wecom-secret-link` | `77ae7b08` | ✅ `text_notice` 同上；提交 200、再用 410、SECRET_SAVED、无泄漏 |
| `telegram-secret-link` | `7c0c8bcb` | ✅ HTML 卡片 +「填写凭据」URL 按钮，文字里没有链接；SECRET_SAVED；扫描 1229 个文件值只在凭据库 |
| `telegram-secret-link-loopback`（链接写 127.0.0.1，假 Bot API 按 Telegram 拒收 IP/localhost 按钮） | `640cc792` | ✅ 第一次 sendMessage 得到 `BUTTON_URL_INVALID`，随即改发文字链接；SECRET_SAVED、再用 410、无泄漏 |

回归（同一分支）：钉钉 `dingtalk-experience` `89d0c621`（progress、ask-single、ask-multi、secret 无服务时提示 + 取消、background）✅；企微 `wecom-experience` `628c2fe5`（同五项）✅。钉钉出字速度没有改动。

未覆盖 / 待真机确认：

- 钉钉客户端怎么显示 actionCard、`dingtalk://…pc_slide=false` 在 PC/手机上是否如文档所说分别用系统浏览器/内置浏览器打开；企微客户端对 text_notice 的标题/副标题长度截断（文档写建议标题 ≤ 26 字，凭据名长时标题会被截）。假平台只证明发出了什么。
- 企微接管卡依赖 CLI 能连上 Gateway（`gateway call message.action`，V 上 `openclawCommand=/usr/local/bin/openclaw`）；钉钉接管卡在 Worker 里跑 `message send`，读 Worker 配置（Gateway 派生，含渠道凭据）。
- 「好了」只是普通消息：用户没在接管页点交还给 V 时，`desktop_handoff_status` 仍显示接管中，模型会提醒去页面交还；钉钉/企微没有按钮式交还。
- 群里的接管卡（私信路径）在钉钉走 batchSend、企微走 `message.action` 私聊，只有单元测试。

## 16. 真机验收（2026-10-04 20:40–22:20，用 Tianyi 的电脑）

- 插话：企微 ✅（只回 STEER_B，插话的消息收到「✅ 已收到」）；Telegram ✅（第一次 sleep 被放到后台、回合已结束，改为前台等待后通过）。
- 切换 Harness：钉钉、企微 ✅（非主人 `/model vcc` 生效、回答走 claude-cli，`/status` 被拒，显示 9.1 的「No reply was generated…」）。
- 凭据卡片：钉钉 ✅、企微 ✅（Tianyi 点卡片「填写凭据」提交；值只在凭据库，Gateway 日志、服务日志与审计里 0 次）。
- 接管卡：钉钉原生卡片 + 「接管电脑」按钮 ✅；企微卡片可点开接管页 ✅；Telegram 测试地址 `http://[IPv6]` 被拒（`BUTTON_URL_INVALID`），退回链接。Tianyi 要求与飞书一致（截图 + 接管 / 我完成了 / 跳过），在做。
- 钉钉出字：AI 卡片模板只渲染流式接口写入的内容，客户端会逐字播放；卡片数据更新与只发 FINISHED 都会空卡（真机 18:05、21:01）。Tianyi 定：先不改。
- 测试环境注意：真机测试原先加载的是 VLab 安装的接管插件副本，已改为加载分支代码。

## 17. 「电脑」接管卡与飞书对齐：截图 + 接管 / 我完成了 / 跳过（2026-10-04 夜）

第 15 节的接管卡只有一个链接按钮。现在三个渠道都换成飞书那张「电脑」卡的样子：标题「电脑」+ 状态（需要操作 / 操作中 / 已完成 / 已跳过 / 已结束）、原因、V 桌面的截图（截不到时用 V 的封面图）、三个按钮——「接管」打开接管页，「我完成了」「跳过」以**点按钮的人**的身份发 `/v-handback <id>`、`/v-skip <id>`，由插件的命令处理（同一套「是不是收卡人」检查，`allowed = 本人 || controlAnywhereActors || senderIsOwner`）。卡片状态仍存在接管服务里（`PUT /v1/handoffs/:id/card`，带 `channel`），所以按钮命令在 Gateway、工具在 Worker 也能接上。第 15 节的单按钮卡保留为回退：原生卡发送失败（没有凭据、平台拒收）时照旧发它，再不行就把链接写进回复。

| | Telegram | 钉钉 | 企业微信 |
|---|---|---|---|
| 怎么发 | 插件直接调 Bot API（`core/telegram-api.js`，凭据和 `apiRoot` 取 Gateway/Worker 配置的 `channels.telegram`）：`sendPhoto` multipart 上传截图，卡片内容是 caption（HTML），下方一行内联按钮 | 插件发 presentation（`message send`，CLI 里跑连接器 outbound）；连接器 `sendPayload` 把截图用机器人媒体上传（oapi `/media/upload`，返回 `@lAD…`）放进 markdown，按钮多于一个时走 `sampleActionCard3`（三个竖排；两个用 `sampleActionCard6` 横排） | 插件发 presentation（Gateway 的 `message.action`）；插件先把截图交给接管服务换一个公网短期链接，`sendPayload` 先发 `news_notice`（`card_image` = 该链接，点图打开接管页），再发 `button_interaction`（「接管」是一行可点的链接，「我完成了」「跳过」是卡片按钮） |
| 截图 | `sendPhoto` 直接上传字节 | 本机临时文件 `v-desktop-handoff-<id>-….jpg`（0600，发完即删）→ 连接器上传成媒体 id；上传失败则不带图照发 | 接管服务 `PUT /v1/handoffs/:id/snapshot`（admin）→ `https://<公网>/desktop-handoff/snapshot/<32 位随机令牌>.jpg`，只在内存、默认 60 分钟过期，令牌不进审计；服务地址不是公网 https 主机名（VLab 的 tailnet 地址）时改为本机临时文件，WeCom 侧经机器人长连接 `aibot_upload_media_*` 上传、作为一条图片消息发出 |
| 我完成了 / 跳过 | 回调按钮，`callback_data` 就是 `/v-handback <id>`：9.1 Telegram core 对以 `/` 开头的回调数据先清掉按钮，再以点按人身份合成一条命令消息 | `dtmd://dingtalkclient/sendMessage?content=/v-handback%20<id>` 作为按钮链接：点按人把这条命令发进会话 | 按钮 `key = vcmd:v-handback:<id>`；补丁在 `monitor.js` 的 `template_card_event` 里把它改写成点按人发来的文字 `/v-handback <id>`，走正常消息路径 |
| 状态变化 | 原地改：`editMessageCaption`（同时换按钮；有新截图时 `editMessageMedia`）。接管中由插件的轮询改为「操作中」，结束改「已结束」 | **actionCard 不能改**。按下后插件另发一句状态（「✅ 电脑已在 V 手里，V 接着做。」/「已跳过这一步…」，`message send` 到卡片所在会话），V 同时继续 | 只能在点按钮后 5 秒内、用那次事件的 `req_id` 改卡（`aibot_respond_update_msg`）。点按时补丁把事件停在进程内的 `cardActionBridge`，插件的命令处理完调用它把卡改成「已完成 / 已跳过」（按钮换成一个不起作用的状态按钮）；没赶上窗口就像钉钉一样另发一句状态 |
| 非公网链接 | Telegram 拒收非公网 URL 按钮（`BUTTON_URL_INVALID`）→ 去掉「接管」按钮，链接写进 caption，「我完成了」「跳过」照旧 | 链接包在 `dingtalk://…/page/link?url=…&pc_slide=false` 里，不受影响 | horizontal 链接行，不受影响 |

状态那一句为什么不是命令的回复文字：9.1 core 对返回 `continueAgent: true` 的插件命令**丢弃回复文字**（`get-reply` 只在 `shouldContinue` 为假时投递 `commandResult.reply`），原来 `/v-handback` 在没有卡片时返回的「✅ 已交还给 V…」其实从没显示过。现在由插件 `announce()` 另发，不等它发完（实测钉钉里这一句排在 V 的继续回复之后）。

代码：`apps/v-desktop-handoff/plugin/core/channel-cards.js`（各状态的按钮与文案、presentation、Telegram caption/键盘）、`core/telegram-api.js`（multipart 手工拼：`FormData` 会把 caption 的 `\n` 变成 `\r\n`）、`index.js`（`postChannelCard` 分渠道发送，`setCardState` 分渠道改卡并返回「用户是否看得到新状态」；看不到时 `announce` 一句状态）、接管服务 `service/server.mjs`（`SnapshotStore`、`/snapshot/<token>.jpg`）；渠道侧 `apps/v-experience/v-experience.mjs`（`linkCardFromPresentation(…, {commands})` 保留斜杠命令按钮、`![alt](ref)` 一行作图片；`dingtalkRobotActionCard`、`wecomCardMessages` / `wecomButtonCard` / `wecomNewsCard`、`parseWecomCardKey`、`localCardImage`、`cardActionBridge`），钉钉补丁多改 `runtime-*.mjs` 的 `sendPayload` 并从 `token-*.mjs` 引入取 token 的函数（基线 `dingtalk/baseline/token-xUW84QQ8.mjs`），企微补丁多改 `monitor.js` 的事件分发和 `channel.js` 的 `sendPayload`。钉钉出字（流式 300 ms 节流）没有动。

安全：渠道只上传文件名为 `v-desktop-handoff-*.jpg|png`、普通文件（非链接）、≤5 MB、JPEG/PNG 魔数正确的本机文件（`localCardImage`），presentation 不能让渠道上传任意文件；截图链接只服务 JPEG/PNG、随机令牌、过期即 404。命令按钮只接受 `/[a-z][\w-]* [\w-]+` 形式。

### 平台限制（文档与源码能确认的 / 不能确认的）

- 钉钉 actionCard 发出后不能修改（机器人消息没有更新接口；能改的是互动卡片/AI 卡片，需要在开发者后台建卡片模板）。所以钉钉卡不跟状态走，状态靠命令回复那一句。
- 钉钉 `dtmd://dingtalkclient/sendMessage` 在 AI 卡片的 markdown 里能用（V 的问题选项就是这么做的）；**放在 actionCard 按钮的 actionURL 里是否同样生效，没有真机验证**。另外群里机器人只收 @ 它的消息，按钮发出的 `/v-handback …` 不带 @，**群聊里很可能到不了 V**（单聊没有这个问题）。到不了时用户仍可在接管页点「交还给 V」，或在聊天里 @V 说「好了」（模型会查 `desktop_handoff_status`）。
- 钉钉 markdown 里 `![](@lADO…)` 媒体 id 的写法出自钉钉 actionCard 示例；`sampleActionCard3`/`sampleActionCard6` 的字段名按钉钉机器人消息类型文档；都只在假平台验证过发出的内容。
- 企微智能机器人的 `button_interaction` 没有图片字段，`news_notice` 没有回调按钮，所以截图和按钮是两条消息。`news_notice` 的 `card_image` 必须是企微服务器能下载的 URL：生产 V 的接管服务公网地址 `https://openclaw.tianyi.live/desktop-handoff` 可以（cloudflared 已转发 `/desktop-handoff`，新路径 `/desktop-handoff/snapshot/…` 在同一前缀下，不用改 ingress）；VLab 是 tailnet 地址，改为上传图片消息。
- 企微改卡只有一次、5 秒内、必须用那次点击事件的 `req_id`；插件命令在 Gateway 里排在该会话的队列后面，若会话正忙（例如 V 还在出上一句回复）可能超时，此时卡片不变、命令回复一句状态。「操作中 / 已结束」这类不是由点击引起的变化，企微卡片无法显示。
- 企微点击事件随后作为普通消息进入回合，V 的回复用的是那次事件的 `req_id` 流式回复，这和插件原来把卡片事件转给模型的做法一致；真机上事件 `req_id` 同时用于改卡和回复是否都被接受，没有验证。
- Telegram 照片 caption 上限 1024 字符（原因截到 300 字）；callback_data 上限 64 字节（`/v-handback h_` + 12 位十六进制 = 26 字节）。

### 实测（假平台 candidate，真实插件 + VLab Worker 模型回合，逐个跑）

每个场景：真实模型回合调用 `desktop_handoff_request`（工具在 Worker 里）→ 检查卡片 → 用卡片里的链接 claim（200）→ 按「我完成了」或「跳过」（钉钉：按钮链接里的命令作为用户消息发回；企微：`template_card_event`；Telegram：`callback_query`）→ 检查接管服务里的状态、卡片的变化、V 继续回复。截图用 candidate 生成的封面 JPEG（`cardImage: "cover"`，VLab 自己的显示器不进测试）。

| plan | candidate | 结果 |
|---|---|---|
| `dingtalk-handoff-card`（handoff-card、handoff-skip） | `08b5fbe0` | ✅ batchSend `sampleActionCard3`「电脑 · 需要操作」：原因、说明、`![V 的电脑](@lADPcandidate1)`（截图经 oapi `/media/upload` 上传，1932 字节 multipart）；按钮 接管 → `dingtalk://…pc_slide=false` 包着 `/desktop-handoff/#…`（claim 200）、我完成了 → `dtmd://…sendMessage?content=/v-handback h_…`、跳过 → `/v-skip h_…`。按我完成了：卡片状态 done、接管未结束、聊天里「✅ 电脑已在 V 手里，V 接着做。」、V 回复「收到，继续。」；按跳过：skipped、接管结束（revoked_by_agent）、「已跳过这一步…」、V 继续 |
| `wecom-handoff-card`（同上） | `54da62f2` | ✅ `news_notice`（`card_image` = `https://openclaw.example.test/desktop-handoff/snapshot/<32 位>.jpg`，经回环取回 200 image/jpeg、与封面字节一致；`card_action`/跳转「接管」= 接管链接）+ `button_interaction`（电脑 / 需要操作，「接管」链接行，按钮 我完成了 `vcmd:v-handback:h_…`、跳过 `vcmd:v-skip:h_…`）。点我完成了：816 ms 内 `aibot_respond_update_msg`（同 task_id、只发给点按人）卡变「已完成」、状态 done、V 继续；点跳过：140 ms 改「已跳过」、接管结束、V 继续 |
| `wecom-handoff-card-loopback`（服务地址 `http://127.0.0.1:9`，代表 VLab tailnet） | `9ca667d9` | ✅ 截图改为 `aibot_upload_media_*` 上传（1724 字节）+ 图片消息，再发按钮卡；点我完成了 773 ms 改卡、done、V 继续 |
| `telegram-handoff-card`（同上） | `560a9ef0` | ✅ `sendPhoto`（JPEG 1724 字节）caption「<b>电脑</b> · 需要操作 / 原因 / 说明」，一行按钮 接管(URL) / 我完成了 / 跳过（callback `/v-handback h_…`、`/v-skip h_…`）；按下后 core 先清按钮，插件 `editMessageCaption` 改成「已完成 / 已跳过」+ 无按钮，状态 done / skipped（跳过结束接管），V 回复「收到，继续。」 |
| `telegram-handoff-card-loopback`（链接 `http://127.0.0.1:9`） | `3e5f8398` | ✅ 第一次 `sendPhoto` 得到 `BUTTON_URL_INVALID`，重发时去掉「接管」按钮、caption 末尾「接管：http://127.0.0.1:9/desktop-handoff/#…」；我完成了照常，卡改「已完成」 |

回归：`dingtalk-secret-link` `a50c9aac` ✅、`wecom-secret-link` `65cd10b5` ✅（链接卡渲染共用）。单元测试：`tests/v-experience.test.mjs` 37 项、插件 24 项、接管服务 14 项全过。

前两次钉钉运行的教训：模型偶尔不调用工具就回复（第一次运行 cand001 一次模型调用、没有工具事件），harness 现在这种情况下再问一次；`continueAgent` 丢弃回复文字是第二次运行发现的。

假平台只能证明发出了什么、按钮命令能否回到插件；不能证明钉钉/企微/Telegram 客户端怎么显示（图片尺寸、按钮排布、dtmd 按钮是否生效）。需要测试机器人真机看一遍。

## 18. 决定：飞书暂不合入 v-experience（Tianyi，2026-10-05）

- 最终要合：两套逻辑会分叉，升级时 dist 补丁要搬两份，新渠道（Teams）只需写薄补丁。
- 现在不合：飞书是最稳、用得最多的渠道；v-experience 刚在钉钉 / 企微 / Telegram 真机验收、还没上生产；飞书用原生卡片组件（真横线、颜色、表单密码框、可原地更新的「电脑」卡、审批卡），v-experience 要先有飞书渲染器，否则样子倒退。两边共用 core 同一批事件，行为已一致，不急。
- 做法：v-experience 先在三个渠道生产跑两三周 → 下一次 OpenClaw 升级（源码 fork 方案）时把 v-experience 写进 fork 源码 → 分块迁飞书：先迁逻辑（提问运行时、后台任务行、进度清单状态），渲染保留飞书原生组件作为「飞书渲染器」，每块用飞书现有测试回归 → 审批、主人身份这类控制台功能继续只在飞书。

## 19. 上线流程：共享 VLab → V → ALIGNED（2026-10-05）

钉钉连接器、企微插件、接管服务、凭据链接服务以前都不在发版流程里（VLab 从 runtime/ 外面加载这两个插件，parity 也不看它们），所以多渠道改动只能手工上 V，上完 VLab 和 V 就对不齐。现在它们是组件表 `scripts/lib/runtime-components.mjs` 里的普通组件（见 `docs/vlab-v-sync-flow.md` 第 4.6 节），这一轮和以后的多渠道更新都走同一条路。

一次性（Tianyi 批准后，持 lease）：

1. 更新 VLab 上 server 工具副本里的 `lab/shared/files.mjs`（允许 `extensions/` 目标）。
2. `node scripts/vlab-channel-plugins-prep.mjs` 看计划 → `--owner <o> --apply`：钉钉、企微按 V 的目录名搬进 VLab runtime/，受控重启一次。
3. `node lab/vlab.mjs baseline --id … --replaceCurrent true` → `node scripts/vlab-v-parity.mjs` 必须是 ALIGNED → `node lab/vlab.mjs align`。

这一轮（顺序和回退见 `lab/release-files/v-experience-multichannel/README.md`）：

| # | 在哪 | 做什么 |
|---|---|---|
| 1 | VLab | 运行时字节（core command-auth V3、Telegram、secret-entry `channels-v1`；钉钉、企微补丁）按 VLab 当前字节构建 plan → package / stage / deploy |
| 2 | VLab | `install-desktop-host.sh`、`install-secret-entry-host.sh`（`UNIT_PREFIX=vlab-`，凭据页只在 tailnet 地址）用同一个提交 |
| 3 | VLab | `activate.mjs vlab --owner <o>`：测试机器人、`commands.allowFrom`、卡片模板；这次重启也让 Gateway 读到 `V_SECRET_ENTRY_*` |
| 4 | VLab | 真机验收（第 16、17 节的清单），`vlab.mjs accept`；`vlab-v-parity --pending <plan>`（plan 带 `"sidecars"`）= AHEAD |
| 5 | V | 先装旁路服务（同一提交；cloudflared 加 `/secret-entry`） |
| 6 | V | `promote-to-v.mjs --apply`：同一份字节、捕获（多出 `.dingtalk`、`.wecom`）、哨兵、align |
| 7 | V | `activate.mjs production`：`commands.allowFrom` + 受控重启，字节和环境变量这时生效 |
| 8 | 仓库 | 捕获 + CHANGELOG（钉钉 / 企微记为首次纳入存档）、发版 PR、tag；接管组件改 `blocking: true` |

未验证 / 风险：

- **VLab 加载插件的方式与 V 不同，信任状态可能不同**：V 不在 `plugins.load.paths` 里列这两个插件（钉钉在 npm 安装目录，企微在全局 `~/.openclaw/extensions`），VLab 用 load path。9.1 的 `openKeyedStore` / `openChannelIngressQueue` / `dispatchHookAgentTurn` 等运行时方法和渠道 owner 判定只对 bundled 或 `trustedOfficialInstall` 插件开放；live candidate 为此给 loader 打过补丁。第 3 步之前在 V 和 VLab 上各查一次两个插件的 origin / trusted（`openclaw plugins inspect`，只读），不一致就先让 VLab 用和 V 相同的方式加载，否则 VLab 测到的行为不代表 V。
- 渠道凭据靠 OpenClaw 的配置 `${ENV}` 替换（VLab 的 Gateway token 已经这样用）；第 3 步后先看三个渠道是否都连上。
- 接管服务的安装脚本会在 Gateway 运行时替换 `/opt/v-desktop-handoff/plugin` 的文件（原来就如此）；新插件代码在下一次 Gateway 启动才生效，中间如有懒加载可能读到新文件。
