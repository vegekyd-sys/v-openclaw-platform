# 统一跨会话版本：上线前修正与验收

2026-10-27。用户已授权：修正剩余问题，共享 VLab 验收通过后自行上线，使用 v-self-restart，完成 align 并做生产完整验收。此前共享 v1 的失败与回滚保留在 [10 月 26 日报告](unified-session-shared-20261026.md)，不能继承为本轮通过。

## 修正

- queued followup 失败/取消以 operation 的真实结果终结卡片，避免被 NO_REPLY 误记为成功空结果（PR #488 已合入，本轮才进入服务器复验）。
- sessions_send 工具说明要求把完整任务、约束与预期输出先交给目标，不得由源会话代做后改派 ACK。核心验收仍检查目标实际执行及回源的真实结果，不以收到请求算通过。
- Codex 的 announce 提示由核心提前以 `announce:…:user` 幂等键写入。原生镜像发现相同键后复用该消息，但历史没有本轮 mirrorIdentity / upstreamUserText；工具完成而没有最终文字时，严格总结恢复因此拒绝 prompt。候选记录证实键相同、原文相同、上游标记不同。
- 另一处证据顺序差异来自纯推理记录：snapshot 把它放在工具之前，但实际延后到 turn 末尾持久化。总结投影原本就不会使用推理内容，现从顺序校验中一致排除纯推理消息，包含公开文字或工具的混合消息仍受全部校验。
- 恢复现在只接受本轮精确幂等键、唯一的已持久化用户消息和完全相同原文。在脱离数据库的投影里补齐本轮标记；历史再次核对原始证据，拒绝改写、重复、旧标记、顺序变化、缺失/伪造工具结果和混入后续追问。不会追加重复用户消息，不会重执行已完成工具。主动 sessions_yield 不启动补总结。
- 候选环境的 Gateway 实际使用 state/npm 下的托管 Codex，不能只覆盖 runtime/npm。候选按明确清单同步相同代码并记录前后 SHA；共享激活也核对、备份并同步 Gateway 的五份文件，恢复原字节用于回滚。Worker 与 Gateway 的加载文件都必须一致。

- 原生总结器原先硬编码 OpenAI provider，且把 VDS 配置别名送给原生模型目录。现在 DeepSeek 使用原回合的 runtime model 映射和 HTTPS provider，私有临时目录只带模型元数据，继续禁用工具、技能、hook 和外部能力；GPT 路由保持原行为。真实故障候选同时校验恢复结果的持久化 payload，不能用之前流式文本冒充最终回复。

## 验证状态

- 相关本地回归 272/272，包括 relay、native presentation、followup、发布计划和严格 prompt 证据校验。
- Voice PR #151 已合入 main `ab8d078dd2937c303ab1eb0008b62fc5a4b8d309`，合入 CI 通过。锁文件依赖重装后 Voice 966/966；设备服务 95/95；发布流程 11/11。
- Voice 最终产物 239 文件，files SHA256 `06eaef28eda1999cbf4d31c7a0510b00d080e438aa531e6b42578d31b27724e3`。首页说明两条后台入口在绑定飞书展示请求、公开过程和结果；普通逐句语音不纳入。
- 初期候选未加载托管 Codex 补丁的两轮，以及没有真正进入无最终回复路径的模型轮次，均保留为未通过；不能充作异常恢复证据。
- 故障注入在真实工具执行完之后移除上游最终回复。要求隔离总结恢复运行、子任务哈希与父任务 token 正确、父任务副作用仅一次，并继续处理独立排队追问。

Worker 候选 `candidate-87a2104c-17f7-4832-93b1-15e9481e54f7` 的 F1i/F2/F13 三个核心场景全部通过，实际 DeepSeek Worker、模拟飞书 API 读回验证同步返回、异步执行与一次回源、嵌套三任务收齐后逐层汇总。不能代替真实飞书共享验收。

真实故障候选 `candidate-c35ff89b-b598-4234-ae95-e1a88b9fb853` 通过：47 份运行文件，输入 SHA256 `732f981d2778247a819c57208e7d8657b4c7cd38f18c56e9345eed474a2268a9`，真实 VDS 工具执行后移除最终回答；隔离总结恢复持久化结果、父操作仅一次、steer 排队追问和两张进度卡隔离均通过。共享 PID 未变化。

当前仍待共享 VLab、生产发布和生产功能验收回执。尚未宣称上线完成。

## 共享 v2 实测与撤回

`35020db7` / `unified-session-20261027-v2` 的真实飞书验收已通过：旧上下文 Worker 完整派发（目标执行 37×41=1517）；VDS 异步一次回源；VDS→混合 Worker/VDS 三目标逐层汇总（323、667 与真实时间戳）；原生 Codex 子 agent 完成后的 announce 和同时排队追问各有独立卡片、实际结果、正确锚点。

真实 GPT Live 通话却暴露核心遗漏：语音后台 Worker 将 `sleep 15; echo $((101*99))` 派到另一个会话，目标完成并返回 9999，但源 SDK 回合没有全局 lifecycle end，批次一直 open；语音和源任务卡提前拿到“已交给后台”的 ACK。失败 run `talk-realtime-consult:1793035938654:eaaeb88c-75bf-4361-be40-d9d1414e683e`，send `s_mvpjb671d7e593bb69`，batch `b_mvpjb67185adedf734`。未将这一版接受或发布到 V；已按流程恢复配置、Gateway Codex 副本并回滚共享 v2。

修复放在统一执行生命周期与 relay 结果续接层：所有 embedded 根回合结束都会关闭其派发批次，不依赖飞书卡片是否启用；调用方订阅持久化批次，只有来源会话真正跑完汇总回合后才完成。回源回合继续转派会继续等待；空结果/失败/会话身份变化拒绝成功；关闭调用方会移除监听，迟到结果不能回到旧 caller。原生 Voice 复用原有 continuation owner，保留取消、公开进展、来源汇总回合身份及待应用的用户补充条件。真实 Voice 产品的两条入口都有这个 owner，兼容没有 owner 的旧 SDK 调用。

新增候选专门要求目标工具生成运行时标记并真实回源，核对 caller 结果、工具记录、飞书卡片；不再用 ACK 或模型复述预设答案当作这项功能验收。共享和生产的最终结果仍待后续回执。

本轮本地相关回归 274/274。真实 VDS 续接候选 `candidate-c3ea0023-47af-4f7c-abbd-6d4aedfabde0` 通过（50 份运行文件，输入 SHA256 `96576a4d085ccecc59e74e2f352fa09d931179c1c89764864ed2411fcfb6dfad`）：direct 调用返回目标实际输出 `RELAY_DIRECT_1793037530`，native owner 调用返回 `RELAY_NATIVE_1793037546`，均核对目标工具记录和模拟飞书 API 的实际卡片正文。前一版测试误用了仓库历史 `chat.send` 后台客户端，其 ACK 失败记录保留；现候选明确调用产品使用的 consult SDK，不以历史入口替代当前两条产品路径。

## v3 再验收

平台 PR #490 的续接修复已合入 dev；PR #491 补齐测试目录和可独立运行的候选计划。Node 22.23.1 本地全套 3003/3003，相关合并回归 274/274，GitHub 静态检查通过。catalog 提交未改变冻结产物的 50 个运行文件。

冻结共享产物 `unified-session-20261027-v3`，source `24e38152e8e16d86882b5eb8faa249bd3c114b59`，artifact SHA256 `e7fc1cef9fcd0af835408957dba6cc87d329509a008b0a8b6ddff0aa8d70b550`。Worker 续接候选 `candidate-7bee93bc-e3c2-455b-9079-90d46b862644`（input SHA256 `e827c72525e1b04714db8c10608e3f2f03b00c841511cf836efe008f1a9075c6`）同样通过 direct 和 native owner 的实际 SDK → 目标工具 → 来源汇总 → caller 最终结果。

真实共享飞书已验证旧上下文 Worker 完整转派 37×41=1517。真实 GPT Live 通话使用合成中文音频经私有麦克风送入正式 H5 getUserMedia/RTC，不采集用户麦克风：同步跨会话返回时间戳 1793038214；异步返回 1793039149，目标实际工具、来源精确卡片 `om_x100b62cde39004a0b09bc28ff2232bc` 和实时通话文字一致，batch 只 wake 一次。

异步期间插入普通 2+2 对话仍正确继续后台工作，真实来源卡片显示时间戳 1793038470。现有语音策略对新话题后的旧任务结果采用上下文补充而非强行插播，不能把此例计作自动播报证据。内部 journal 的 publicSnapshot/currentText 保留过早 ACK，但实际 Feishu 卡片 readback 和 executionOutcome 已是正确最终结果；验收以精确 messageId 的 API 正文为准。

原生 Codex spawn_agent → sessions_yield → announce 与被阻塞的真实飞书追问均有独立卡片。子任务实际文件哈希、父任务真实 token 和追问结果正确；在终结前已读回追问计划，最终卡片分别 `om_x100b62cdf43bb4a0cfe635df262d7f3` / `om_x100b62cdf1ad08a0ce783d825af7d3b`，未串计划、未重复投递。

一次取消脚本使用 chat.abort 指定渠道 followup runId，RPC 明确返回 aborted:false；这不是已取消回合，不能当作取消卡片失败或验收通过。改用用户真实飞书 /stop 入口复验。剩余共享与生产回执继续补齐。

Grok Voice 3.0 的真实 direct 通话也已完成异步跨会话：目标新的实际时间戳 1793039643，来源精确卡片 `om_x100b62cd824b84a0ce4075091563be2`、目标工具和通话播报一致。四次后台任务对应四条 presentation；普通插话没有额外建任务卡。飞书真实 `/stop` 停止 queued followup `c8171096-7245-4f24-8310-efded9d527f9`，精确卡片 `om_x100b62cd9db5e8a0cef49c8921e88e5` 为“任务已取消”，没有正常完成标记。

共享 v3 最终核心复验通过：`SHARED-F2-2298be` 目标实际 sleep75 输出 1793039822 后一次回源；`SHARED-F13-87ee34` 四次 send、深度 [1,2,2,2]，三目标混合 Worker/VDS，真实计算 323/667 与新时间戳全部收齐后两级汇总，每个 batch wake attempt=0。五个真实群均逐一读回结果。完整回执保存在本机 `vlab-dev/tmp/unified-shared-20261027-v3/`。

共享正式 accept 已绑定 v3 精确 SHA；为满足现有工具 config hash 约束，停机恢复原配置后登记 accept，再恢复已验收配置 SHA256 `ab29f8dae69e71dc9cd5b3967d64194e2115db89c4033e0ab7e769f2087b0e7c` 与同产物 Gateway Codex 五份副本。重启后真实飞书烟测 `RESTART-V3-4d9a2` 成功且只有一条回复。

## 正式发布进行中

Voice fleet 两端已发布 `ab8d078dd2937c303ab1eb0008b62fc5a4b8d309`，同一 files SHA256 `06eaef28eda1999cbf4d31c7a0510b00d080e438aa531e6b42578d31b27724e3`；web/devices 均 ready、无 admission hold。回执 `v-voice-releases/background-feishu-20261027/production-receipts/20261027-024039-536e9431/matrix.json`。内置浏览器已核对真实生产 `/voice/?phone=public` 更新日志，截图保存于 `vlab-dev/tmp/unified-production-20261027/voice-changelog.png`。不将服务端一致性宣称为新的 iPhone/硬件固件验收。

平台生产 promote plan 已核对 50 个文件的 before bytes 全部一致，正在正式安装。尚待 v-self-restart、生产功能验收和最终 align。
