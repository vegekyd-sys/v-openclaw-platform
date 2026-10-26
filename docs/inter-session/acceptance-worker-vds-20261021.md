# Worker / VDS 跨 session 候选验收（2026-10-21）

## 范围与结论

本轮只在独立 candidate 内修复和验收。真实飞书发送保持停止；没有合入 dev、更新共享 VLab 或生产上线。分支为 `codex/inter-session-takeover-20261021`。

Worker/VDS 的本轮修复与候选范围验收已完成。真实飞书 WS、客户端人工验收和共享集成仍留待用户后续决定。

这份记录补充 [原飞书记录](e2e-feishu.md) 和 [接手记录](takeover-20261021.md)，不覆盖历史失败回执。最终结果见下方矩阵。

## 修复

1. **入口漏拦并发 RPC**：本轮 queued ReplyOperation 的 sessionId 与正在运行的 RPC 相同，原生占位例外把目标误判为空闲。协作请求现在检查实际 embedded 执行句柄，忙时在消费系统事件、写 transcript 和创建回复卡之前返回 BUSY。
   - 同时修正首版候选：通用 `isEmbeddedAgentRunActive` 包含 queued 占位本身，不能用作实际执行的判据。改读 raw handle registry，RPC 结束后能恢复受理。
   - 回归测试先失败、修复后通过；普通消息行为与原生字节逐项比较一致；queued-idle 和 deferred-flush-only 均能正常受理。
2. **后台工作过早交回**：VDS 会用 `nohup` / shell `&` 脱离任务系统，导致后台任务不在账本里。请求说明改为使用受管理的 `OpenClaw exec(background:true)`；没有受管理工具时前台等实际完成，不能把“已启动”当最终结果。
3. **失败回程重新派活**：每项失败说明要求不要重复发，但总说明“没做完可以再交一次”会诱导 Worker 重试、VDS 在重启后再次派活。已统一为已开始后失败、中断、取消或超时先汇报，未经用户要求不重试；只允许未开始或成功结果缺必要项时补交。F10/F5 增加未再次派发的断言。

## 验收方法

- 模型和执行链真实：Worker = `deepseek/deepseek-flash`；VDS = `deepseek/vds-deepseek-flash`，实际 codex harness。没有用假模型替代推理。
- 飞书平台为本地 HTTPS 假 API：合成 app 凭据、loopback webhook、真实渠道桥和原生卡片生成代码；记录消息、回复关系、卡片更新、表情及中间快照。
- 私有 HOME、无网络建房 shim、Node 预加载拦截真实飞书域名；不能向真实飞书发送。原始回执中的 `platform`、`files`、`sourceCommit`、`inputSha256` 和 `sharedUnchanged` 可复查。
- G/R 竞态采用私有 candidate 屏障：分别证明 RPC 在 G 准入前、或 G 之后 R 之前实际运行；改动前后 SHA 记入 allowance。这些屏障不是产品代码，也未写入共享运行目录。
- F9 的 VDS 负例使用仅匹配该场景的私有 silent stimulus，允许目标返回裸 NO_REPLY（产品说明本来禁止沉默）。验证的是无文字结果的收集和显式回传，不冒称生产模型自然触发了此故障。
- 不把 runner 退出码当验收。每项同时要求账本、来源 runId、transcript 和假平台读回通过；历史失败记录原样保留。

## 验收矩阵

真实飞书/WebSocket 与用户界面人工验收不包含在本次零发送范围内。下表按逐项证据判断，不把含有旧失败的整组 receipt 表述为全组通过。

| 场景 | Worker 证据 | VDS 证据 |
|---|---|---|
| F1i / F1 当场询问；F3c 准入后的 RPC 竞态 | 最终 closeout 回执 | 最终 closeout 回执 |
| F2 / S-tail：75 秒任务重复 5 次 | `CWT1`：五次全部通过，发起方尾耗时 1614 / 1795 / 1704 / 1839 / 1745 ms | `CDT1`：五次全部通过，1923 / 2178 / 1584 / 3221 / 1874 ms |
| F3 忙时排队；F3b 真人竞争 | 原真实飞书 fullA-worker + `CWE1-F3b` | 原真实飞书 fullA-vds + `CDE1-F3b` |
| F3b-rpc：G 入口确定性 BUSY、只执行一次 | 最终 closeout 回执 | 最终 closeout 回执 |
| F4a owner 插话；F4b 非 owner 排队 | `CWT1-F4a` / `CWE1-F4b` | `CDE1-F4a` / `CDT1-F4b` |
| F5 强杀重启、再次接真人消息；F10 模型失败且不重新派活 | 最终 closeout 回执 | 最终 closeout 回执 |
| F6 posting / running / waking 三个崩溃断点 | 原真实飞书 crash-worker 四项读回已通过 | `CDF1-F6-*` 三项全部通过 |
| F7 三件并发状态与一次交回；F13 子任务收齐后最终汇总 | 最终 closeout 两项均通过 | F7 closeout 通过；F13 单独 `CDH1` 原判据复验通过 |
| F8 防循环；F14 兄弟互问死锁保护；F16 DISABLED 回退；F17 全局上限 | `CWE1` 对应四项全部通过 | `CDE1` 对应四项全部通过 |
| F9 无文字结果显式回传 | `CWT1-F9` 通过 | `CDF1-F9` controlled silent stimulus 通过 |
| F11 全文、假密钥隐藏；F11-shared 共享群裁剪；F12 新房间路由绑定 | `CWT1-F11/F12`、`CWF1-F11-shared` 通过 | `CDT1-F11/F11-shared/F12` 通过 |
| F15 受管理后台任务结束、collect 产出并回传 | 最终 closeout 回执 | 最终 closeout 回执 |
| TR1 / TR2：无网络建三个房间、逐层追问、混合 harness、重启、一次最终汇总 | `CWF1-TR1/TR2` 全部通过 | `CDF1-TR1/TR2` 全部通过 |

F3b 真人事件可能被渠道 FIFO 先串行处理，不能假称该运行触发了 G 的 BUSY；真正 G 拦截由新增 F3b-rpc 屏障场景证明。TR1/TR2 的原 VCC 房间由 Worker/VDS 混合替代，回执核对实际 `agentHarnessId` 同时出现 `vlab-worker` 和 `codex`，不代表 VCC 通过。

C-stock / C-fallback 的原真实飞书对照已通过，见原飞书记录，本轮未重新执行。普通回合的原生前后等价另由离线回归覆盖。

最终 closeout 在同一产品提交 `34ed321358fc529d6e7e082b47d2436d60f09105` 上运行：

| 回执 | 结果 | 证据边界 |
|---|---|---|
| `worker-closeout2-receipt.json` / `candidate-280571f0-9b57-42b3-bb22-43ac4e474901` | **9/9 通过**，860.5 秒 | F3b-rpc、F1i、F1、F3c、F10、F15、F5、F7、F13；所有假平台读回通过 |
| `vds-closeout2-receipt.json` / `candidate-2c86bb05-9fc5-4dba-aa3c-3eef47b1f70e` | **8/9 通过**，852.4 秒 | F13 的三项答案及汇总来源正确；但模型错抄房间 3 ID 后追加更正，根批次变成 2 件，不满足本用例预设的单件回传格式。失败原样保留，不能称整组通过 |

VDS F13 随后以相同产品字节、相同输入模板和原断言，在独立会话单独复验：**通过**。回执 `vds-f13-confirm-receipt.json` / `candidate-1ca6ef8a-0c6a-45b2-8491-822685247858`，116.1 秒，输入 hash `a9a811a788950bd2ff4c5cff7148dbed1282c3793740f9ce53da724da3e72ec8`。该回执 `dirty=true` 仅因当时正在整理三份报告文档，映射产物的 `(target, after)` 已与 closeout 逐一核对相同；没有改变输入模板或放宽断言。这次偏差也说明模型的逐字抄写并非确定性保证；错误 ID 在路由前被拒绝，最终仍只有一次批次回传，不是多次执行了房间任务。

两份 closeout 及 F13 单独复验的 `realFeishuSends=0`、`blockedLiveRequests=0`、`unimplemented=[]`、`sharedUnchanged=true`。两份 closeout 的输入 hash 分别为 `9f1f2a4b2c9b1032d2b35ad8f9983433df3862350c611482ce965341f0b5a61b` 和 `5ac1c750cdde8f075c44903a42793b8e8eb3342b1f52fb00d0eff6d7711dd7b9`。

## 证据与可复查位置

私有原始证据保存在本 worktree 的 `tmp/inter-session-takeover-20261021/`（Git 忽略）：每组 `*-receipt.json`、`plans/*.json`、离线日志及原 Claude 的 `runs/`。原始 transcript、消息正文、配置和凭据不提交 Git。

此前无效判据已纠正并重新执行：VDS toolResult 正文归一化、F7 持续三件重叠、F13 三项精确值和汇总来源、F11 假密钥的哈希证明、F12 原生会话条目、插话按 transcript 提交顺序、合法 mock bot ID、TR 问题带本次任务标签且先派口令提供者。不能据此把旧失败直接改成通过。

## 本地验证与候选产物

- 相关离线测试 **409/409 通过**，约 30.5 秒；覆盖核心准入/字面消息、插件、四渠道补丁、候选驱动、工作区和安装/回滚/发版配置。没有重跑整个仓库的全部测试，不引用旧 2803/2804 结果作为本轮结论。
- `node lab/build-inter-session-plan.mjs --check` 通过。目录审计 errors 0、offlineFiles 327；`releaseReady=false` 仍不是发布许可。
- 实际运行验证的产品提交：`34ed3213`（后续若只有报告提交，产品字节不变）。两次回归红/绿日志保存在私有证据目录的 `queued-rpc-before/after.log` 和 `queued-projection-before/after.log`。

| 文件 | SHA256 |
|---|---|
| `get-reply-CqW1y05D.js` | `a22a84a9b832d0aed7a0ab00354dde35a332cff377a9eeca6df3130292a4f974` |
| `plugin/core/copy.js` | `af1644a85c2e0610457b14a1cfc3734054d4412fa8d99f293f79e9888dfa6064` |
| `lab/inter-session.plan.json` | `d618e745bb43eb5738211c4a4e900aa6b0325210f19df8d5d952de9e6fa0c16f` |

首版 BUSY 候选在 RPC 结束后错误地持续等待，已主动停止两次自己的临时 candidate 并保留账本；这两次没有场景 summary，不能因 runner 显示成功退出就记作通过。最终 closeout 使用修正后的实际句柄检查重新运行。

## 合入与发布边界

只交付候选，不合 dev。后续若获准共享集成，需重新核对当前字节/配置和 integration lease，再验证真实 WS、飞书客户端卡片、配置启停与 Worker 换代。其他渠道和 VCC 不在本轮 Worker/VDS 完成声明中；VCC 仍保留 Claude 组织停用的独立阻塞。
