# /vds 调工具前先说一句：现状与候选验证（2026-11-20）

Tianyi 批准验证首字报告里的第 1 项：回合需要调工具时，先用一句话告诉用户要做什么。V 上只读，没有改动、没有发消息、没有重启。候选测量台是 `lab/candidate/vds-preamble-e2e.mjs`。

## 结论

1. **V 早就有这条设置，而且有三处。**最直接的一处是 V 工作区 AGENTS.md 的第 4 条（9/9 加入）：「调用工具前，先向用户输出一句简短的公开过程说明」。它通过 Codex 原生 AGENTS.md 送到 /vds 模型，V 的 rollout 里可以看到。
2. **它只部分生效。**V 11/18 15:18 – 11/19 用了工具的 703 个 /vds 回合里，59% 在第一次调工具前说了一句。没说的 288 个里有 285 个，第一个工具是 shell 命令。会话越长越不照做：15 万 token 以内 79%，45 万以上 50–59%。说了的回合正文首字 p50 10.9 s，没说的 38.4 s。
3. **把第 4 条改写得更具体后，候选里几乎每次都照做。**
   - 新会话：base 5/28，v1 24/25，v2 24/26。
   - 长会话（先贴约 90 万字符）：base 0/8，v1 8/8，v2 8/8。
   - 这句话会作为正文第一次推进飞书卡片（24/24、8/8）。首个可见正文 p50：新会话从 2.7 s 降到 1.5–1.6 s，长会话从 4.5 s 降到 2.3 s。
   - 工具调用照常，答案 174/174 正确。闲聊回合不多说话，也不调工具。
4. **建议**：把 V 工作区 AGENTS.md 第 4 条换成 v2 的文字（见下）。这是 V 的工作区文件，改了就生效，不用重启。按 V 的规则，改核心文档前要先给 Tianyi 看 diff 并得到确认。本次没有改 V。

## 现在 V 上有什么

| 位置 | 内容 | 送达方式 |
|---|---|---|
| Codex 自带 base instructions（gpt-5 系模板，/vds 也用） | 「Before making tool calls, send a brief preamble…」；但也写了例外「Avoid adding a preamble for every trivial read (e.g., `cat` a single file)」 | thread 的 base_instructions |
| V 工作区 `makaron-openclaw/.openclaw-local/workspace/AGENTS.md` 第 4 条（9/9 起） | 「Tool-call process note — 调用工具前，先向用户输出一句简短的公开过程说明，解释接下来要做什么及目的。」 | Codex 原生 AGENTS.md（user 消息「AGENTS.md instructions for …」） |
| 同一文件「Real-Time Progress Updates」 | 慢任务（超过 10 秒）开始前用 `message.send` 发一条进度 | 同上；这是另一种机制，会单独发一条消息 |

同一线程里，有几条指令在往相反方向拉：
- OpenClaw core 的 `PROGRESS_CARD_SYSTEM_PROMPT`：「keep your progress card current with the progress_card tool; the user follows it instead of reading the transcript」。只在配对了卡片渲染端时注入，V 已配对。
- SOUL.md：「Act first, explain later」「Skip the filler」。
- 群聊策略：「Be extremely selective」。

监控会话之前 grep 的是 `/home/openclaw/.openclaw/workspace`，makaron 实际用的工作区是 `/home/openclaw/makaron-openclaw/.openclaw-local/workspace`，所以没找到。共享 VLab 的工作区里还留着 9/9 改动前的备份 `AGENTS.md.before-tool-preamble-20260909-…`。

## 为什么只有 59%

- 没照做的几乎都发生在第一步是 shell 命令时（285/288），和 Codex 模板里「简单读取不用说明」那条例外对得上。原来的第 4 条没有说它优先于这条例外。
- 照做率随会话变长而下降。第 4 条位于线程开头的 AGENTS.md 消息里，会话越长越容易被稀释。
- 群聊和单聊的照做率一样（都是 59%），所以不是群聊策略单独造成的。

## 改法

只改第 4 条这一行，其余不动。

v2（推荐；v1 是去掉「哪怕第一步只是……」这一句的版本）：

> 4. **调工具前先说一句** — 这一轮只要需要先调用工具（跑命令、读文件、看图、搜索、查记忆、更新进度卡等）才能回答，第一次调用工具之前，先在回复正文里写一句给对方看的话（不超过 25 个字），说清楚接下来要做什么，例如「我先数一下 skills 目录。」，写完这句再在同一次回复里调用工具。哪怕第一步只是读一个文件、跑一条简单命令也要先说这一句，这条优先于「简单读取不用说明」的通用惯例。这句话是对方最先看到的内容：思考过程对方看不到，进度卡也不能代替它。同一轮后面的工具调用不用每次都说。不需要工具、直接就能回答时不要加这句；群里不需要回复（NO_REPLY）时也不要加。

候选里 v1 和 v2 没有可分辨的差别（33 次里照做 32 次，34 次里照做 32 次）。推荐 v2，是因为它直接针对 V 上 99% 的失败形态，也就是第一步是 shell 命令的情况。

## 候选测量台

`lab/candidate/vds-preamble-e2e.mjs`，私有 candidate，不动共享 Gateway，没有用 lease：
- V 字节的 Codex 插件（whole-dist sha a864aa8f，与 V 核对过）、Codex 0.169.1、真实 DeepSeek（`deepseek/vds-deepseek-flash`，thinking high，V 的别名）。
- 假飞书：REST 加 Lark SDK WebSocket 帧，取自 early-tool-status-e2e。记录卡片的每次写入和 V 自己的 `[firsttext-e2e.1]`。
- 私有工作区放 V 顶层的 9 个提示文件（从 V 只读拷贝，作为 plan 输入，不进 git），技能目录取共享 VLab 的。
- 发送人配成主人。强制「已配对卡片渲染端」，让进度卡那句和 V 一样注入。保真度检查确认：Codex 模板含 preamble 段、base 臂含原第 4 条、改法臂含新第 4 条、进度卡那句在、群聊策略在。
- 各臂在同一个 Gateway 里交替运行，臂的顺序轮换。每个场景实例都是新的飞书会话，所以是新的 Codex 线程；单聊按发送人分会话，每个实例用独立发送人。
- 场景：单聊 shell 两种、单聊读图、单聊闲聊、群聊 shell、群聊闲聊、4 轮混合对话（闲聊和 shell 交替）、长会话（可选）。

| 运行 | candidate | 回合 | 结果 |
|---|---|---|---|
| 新会话 base/v1/v2 × 3 轮 | candidate-964b7f48 | 144 | 先说一句：base 5/28，v1 24/25，v2 24/26；进卡片 24/24；首个可见正文 p50 2.7 → 1.6 / 1.5 s，p90 4.3 → 2.2 / 2.7 s；答对 48/48 ×3；闲聊调工具 0、多说话 0 |
| 长会话 base/v1/v2 × 2 轮 | candidate-89ed89f5 | 30 | 先说一句：base 0/8，v1 8/8，v2 8/8；首个可见正文 p50 4.5 → 2.3 s；答对 10/10 ×3 |
| 第一轮（作废） | candidate-ad91afa1 | 144 | 所有单聊共用一个发送人，于是落在同一个会话，后面的问题直接从历史里回答。只有群聊 shell 有效：base 1/6，v1 6/6，v2 6/6 |

开场白示例：「我先数一下 skills 目录。」「我先打开这张头像看看。」「我核对一下 AGENTS.md 里这个章节的条目数。」base 偶尔说英文（「Let me check that file…」），改法臂全是中文。闲聊回复的长度三臂相近（p50 69–71 字符）。

## 没覆盖到的

- 候选的工具都很快（单条命令），所以首字只省 1–2 s。V 上没照做的回合首字 p50 38 s，主要卡在多轮工具，收益应该大得多。粗估照做率从 59% 升到约 95% 后，/vds 首字 p50 约 14 s → 11 s，>30 s 占比 22% → 5% 左右；这是按 V 的分布模拟的，没有在 V 上测过。
- candidate 只保留了 feishu、deepseek、codex、moonshot、worker 插件，工具数比 V（107）少；技能目录取自共享 VLab，不是 V 的。
- 长会话是贴一大段文字撑大上下文，不是 V 那种真实的多轮工具历史；输入量是按字符估算的，没有读到用量。
- 语音、钉钉、企微、Telegram 没有测；它们也读同一份 AGENTS.md。
- 上线后要看三件事：照做率（用 `lab/firsttext-split/` 的方法，按 rollout 里第一次调工具前有没有 assistant 消息来判断）、首字分布、群里是否被嫌话多。
