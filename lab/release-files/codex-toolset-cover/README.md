# Codex 群聊换发言人不再换线程（2026.9.1，thread-lifecycle）

`patch-codex-toolset-cover.mjs --codex <@openclaw/codex 目录>`，幂等。基线是 V 在 2026-10-13 运行的
`thread-lifecycle-DAcEJ_Om.js` a9f76cf4（`vds-view-image` 发版产物），产物 `dist/` 4cceab62。
只改这一个文件；发版 plan 见 `release.plan.json`。

这是 `codex-firsttext` README 里的 F（253d1ad8）。F 在 10/08 合入、装到 V 磁盘，但 10/09 在重启生效前被
`codex-compaction-summary-20261009` 换回，理由是「首字没有可测改善」。当时没看到它在大会话里的另一个后果：
每换一次发言人就压缩一次。

## 现象（V，群 oc_88d96b7e…，/vds = Codex + deepseek-flash）

「聊两三句就触发 compaction」。2026-10-13 16:31–17:06 CST 这个群 35 分钟里：

- 会话（`agent:makaron:feishu:group:oc_88d96b7e…`）开了 11 个 Codex 线程。工具数在 100 和 112 之间交替，
  与发言人一一对应：主人（Tianyi）的回合 112 个，其他成员的回合 100 个。
- 每个新线程的第一次请求都是整段会话记录重放：输入 37.2–38.2 万 token，缓存只命中 8.7–9.2 万。
- Codex 对 deepseek-flash 用兜底窗口 272,000（生效 258,400，自动压缩线 244,800）。所以 6 个主人线程都在
  第一次请求后立刻 `auto-compaction`（压后约 30–31 万 → 下一次请求 11–20 万）。每次压缩落在不同的新
  threadId 上（日志 `codex_app_server_compaction_succeeded`，compactionCount 都是 1）。
- 成员线程只有一次请求就结束了（37 万上下文直接答），没来得及压缩；下一位发言人又换线程。
- 10/12–10/13 两天，这个会话 9 次压缩分布在 9 个线程上。对照：单人私聊 ou_0674 两天 16 次压缩只用了 4 个线程，
  是窗口偏小导致的正常节奏。

## 根因

一个 Codex 线程的动态工具在创建时就固定了。主人回合比成员回合多 12 个顶层工具（`codex_plugins`、
`conversations_list/send/turn`、`gateway`、`intent`、`mobile_ui`、`nodes`、`openclaw`、`portal`、`sessions`、
`terminal`），`sessions_send` 和 `openclaw_direct` 的描述也不同。工具指纹一变，`startOrResumeThread` 就丢掉绑定、
开新线程，并把完整的 OpenClaw 会话记录投影进去。会话超过 24.48 万 token 时，这个投影本身就超过 Codex 的压缩线，
于是每次换发言人都是「整段重放 + 立刻压缩」。

V 上实测（同一群今天的两个线程首行 `dynamic_tools`）：成员的 100 个工具全部能在主人线程里找到同名、参数 schema
一致的工具；反过来不行（主人有 12 个专属工具）。

## 改法

工具指纹不同时，读绑定线程 rollout 首行记录的工具：先确认它和绑定上的指纹一致；再检查本回合的每个工具，
线程里都有同名、参数 schema 相同的工具（描述可以不同，命名空间按子工具递归比较）。满足就续用这个线程
（日志 `keeping thread whose tool catalog covers this turn`）。热复用和 resume 用线程自己的指纹，绑定始终记录
线程真实的工具集。supervision 绑定不走这条路径。

安全上不放宽：Codex 发来的工具调用只按本回合授权的工具表执行（`dynamic-tools` 的 `toolMap`），成员调用主人专属
工具会被拒绝（10/08 candidate 实测返回 `Unknown OpenClaw tool: conversations_list`）。代价是成员回合里，模型能看到
主人专属工具的声明。

方向是单向的：主人线程能服务成员回合；成员先开口的会话，主人第一次说话仍然换一次线程，之后两边共用主人线程。

## 不在本补丁里的

- 主人第一次说话那一次换线程仍会整段重放。新线程（换 provider 家族、推迟的记忆整理的临时线程、上面这一次）
  重放超过 24.48 万就会立刻压缩，根子是 Codex 不认识 deepseek-flash、窗口按 272,000 兜底；见 `codex-firsttext`
  README「没有上线的另一半」。
- 推迟的记忆整理（trigger memory）按设计开临时线程、全量灌入，所以大会话里每次整理也会压缩一次（今天 16:40
  线程 01a1346b，2 个工具，33 万 → 压缩），用户不可见，只是成本。

## 验证

candidate `lab/candidate/codex-ds-window.mjs` 的 U 段（plan `lab/candidate/codex-toolset-cover.plan.json`，
`PHASES=U U_SEED_MESSAGES=6 U_SEED_WORDS=25000`，2026-10-13 17:40 CST）。codex 插件用 V 当前的 4 个文件
（`vds-view-image/codex-dist`），同一 Gateway 先跑 V 的 thread-lifecycle（v）、再跑本补丁（fixed）。
成员先发 6 条垫底消息（约 28 万 token，第 6 条时压缩一次），然后主人、成员交替 5 轮，问前面给过的暗号。

| | V 原样 | 补丁 |
|---|---|---|
| Codex 线程 | 6 | 2 |
| 换发言人时整段重放 | 5 次，每次首个请求 32.9–33.6 万 token（都超过 244,800） | 1 次（主人第一次说话），之后成员回合 `keeping thread whose tool catalog covers this turn` |
| 交替阶段的上下文 | 每轮 33 万左右 | 主人线程压缩一次后 6.8–7.6 万 |
| 暗号回答 | 都对 | 都对（主人第一轮模型以「你说过不要复述」为由没念出暗号，与补丁无关；之后两轮都答全） |

candidate 里每轮都要求「不用工具」，一轮只有一次请求，V 原样的新线程在回合内来不及压缩；V 上真实回合会调工具，
所以第二次请求就压缩了（见上面的现象）。只靠单条超大垫底消息复现不了：新线程投影会把它截到约 8 万 token。

10/08 的 T 段（成员调主人专属工具被拒、两边暗号互通）仍适用，本补丁的判定逻辑与当时逐行相同。
