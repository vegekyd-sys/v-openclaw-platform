# DB91 生产规模副本：候选证据（验收进行中）

范围仅限独立 VLab `db91-parity`，端口 26340，owner `codex-db91-production-equivalent-20260908`。本轮未发布生产。

## 已定位的故障链

- 全局状态库：原生完整性检查在 state-lifecycle 锁内耗时 6682 ms，另一 Worker 获取锁在 5051 ms 超时。候选在原锁前顺序只读预热该文件，不生成校验证书、不跳过原生完整性检查。
- Agent 轨迹库：`B16-05` 中轨迹写入事务持锁 9305 ms，前台等待约 5 秒失败。`B16-06` 完整查询计时进一步证明，`readSqliteTrajectoryRuntimeRuns` 的全库分组统计单次耗时 6699 ms，位于该写事务内，两个后台任务同期报 `database is locked`。
- 受控取消时的独立故障：Worker 关闭 IPC 后，迟到的应答发送可触发未处理的 channel-closed 错误。候选只处理应答/ack 的关闭竞争，不改变请求、取消、准入或调度。

## 轨迹清理候选

`057331e6627696ac5435df3690b56895b77811cc` 将全库统计移至写事务前；使用同一数据库连接的 `PRAGMA data_version`，在扫描前后以及取得写锁后验证数据没有被其他连接修改。当前会话在追加/裁剪后单独刷新统计。变化时放弃清理计划、保留追加写入，不记录清理已完成，后续 flush 重新尝试。

原有 14 天保留期、512 MiB 总量策略、单会话窗口、原生删除逻辑、5 秒锁期限及完整性校验保持不变。连接间版本比较边界依据 [SQLite 官方说明](https://www.sqlite.org/pragma.html#pragma_data_version)。

- 本地并发保护 4 项通过；状态预读 2 项、迟到应答 4 项通过。
- 原生轨迹实现与 Kysely 的隔离 SQLite 夹具：5 组策略对照通过，包括 Unicode 字节预算、过期/总量/单会话裁剪、竞争失效后不删除以及下一次重试。该夹具不是实际 Agent 性能证明。

## 第一轮完整负载：B16-08

运行代码 SHA-256：`956874c9bd20963d6543e0c1db58d82a36bd5a4e45b611db94bd11110f9cb018`，61280 文件。脚本候选 `e26f369d6c6944d52efcefde57a5a884473c4830`。

| 项目 | 实测结果 |
| --- | --- |
| 前台矩阵 | 90/90 完成，36 次本轮唯一真实 exec 校验通过 |
| 前台首段回复 | 中位数约 11.8 s；P95 27.603 s；最大 38.467 s；无 ≥80 s 样本 |
| 前台并发 | 最大 5；观察到总计 21 active 且前台 5 submitted 的样本 3 个 |
| 后台负载 | 16 路真实长历史任务循环；386 次完整 exec/read/write 和最终回复验证通过 |
| 受控结束 | 其余 16 次由矩阵结束标记取消，不计作完整交付或独立故障 |
| 状态查询 | 0 错误；矩阵 completed=true |
| 原生慢持锁日志 | 本轮两条 ≥1 s 记录，2535 ms / 1827 ms；未观察到锁超时 |

前台记录：实例内 `tmp/parity-results/B-full-1788876049490.json`；后台记录 `background-B16-08.json`；原生日志 `tmp/B16-08-native-runtime.log`。

这不是匹配基线的最终 A/B/A 结论：此前已运行多轮定位测试。下一阶段重新恢复封存快照、归零目标文件缓存、使用同一脚本做反向对照。

## 匹配快照控制：M-A1 / M-B1（失败，不能发布）

两组均重新恢复原始 9 库、逐库哈希校验及相同隔离修正、目标库缓存驻留归零。启动预读开启，两项状态/轨迹修复开关分别关闭或开启；其他代码和配置一致。自动观察实际 16 后台并发后立刻启动前台。

- M-A1：前台启动间隔 101 ms，ready 等待 129868 ms。第一项完成；全库轨迹统计仍在写事务中耗时 6486 ms，后台 `PARITY_BG_M-A1_4_0` 报 `database is locked`，矩阵失败。原生日志已保存。
- M-B1：前台启动间隔 48 ms，ready 等待 123847 ms。实际观测总 active 21、前台 5；45 项中 44 项验证完成，`c5-0-4` 首段回复 128779 ms，180 秒内没有最终回复，矩阵失败。44 项成功样本中位数 9187 ms、P95 19296 ms、最大 28015 ms，不代表全部样本。
- M-B1 后台 305 次请求中 289 次完整验证、16 次受控取消。后台 4 个首段回复超过 80 秒，不能称延迟全面通过。后台驱动 errors=0，但取消期间原生日志另有 `terminal session persistence failed ... database is locked`，不得据驱动统计宣称无锁错误。
- 失败前新 Worker 6（PID 1720764）全局状态库原生完整性检查耗时 60810 ms；锁外轨迹扫描后续出现 27815 / 21982 ms，同步事件循环停顿 51239 ms。实例触及 MemoryHigh=10 GiB，存在回收/换出压力；高压状态是相关证据，尚不能证明单一原因。
- 正在独立验证表达式统计索引，候选尚未接入运行时。小型等价性和无正文回表测试通过，不等于实际 Agent 验收。

记录：`tmp/parity-results/{coordinator-M-A1,coordinator-M-B1,background-M-B1}.json`、`B-full-1788879329282.json`、`tmp/{M-A1,M-B1}-native-runtime.log`。

### 反向对照 M-A2 与表达式索引候选

- M-A2 恢复原始 9 库及同一隔离修正，原运行代码 SHA-256 仍为 `956874c9bd20963d6543e0c1db58d82a36bd5a4e45b611db94bd11110f9cb018`。九库缓存驻留页归零；原生 ready 等待 128766 ms。实际 16 后台后 85 ms 发出前台请求。
- 第一项前台完成，随后后台 `PARITY_BG_M-A2_7_0` 原生日志出现 `rawError=database is locked`，后台驱动失败、前台矩阵随之停止。两次原方案对照都复现锁错误；M-B1 本身也失败，因此旧候选不算修复完成。记录 `tmp/M-A2-native-runtime.log` 及 `tmp/parity-results/*M-A2*`。
- 新候选 `c6d8c5c` 为轨迹表增加覆盖统计所需的表达式索引，并把同义聚合查询中的常量 1 从 Kysely 参数绑定改为 SQL 字面量，以匹配索引。没有修改记录、保留策略或超时；不是完整性检查的替代品。
- 本地 5 项索引/并发计划检查通过。VLab 原生 schema contains 在加索引前后均通过；真实 9.1 轨迹实现验证原生、字面量查询、加索引、加索引并分离扫描四种实现的策略等价（4 组预算策略），并通过并发失效后重试检查。夹具完整性通过，不计作真实 Agent 性能验收。
- I-B1 已安装索引，运行代码 SHA-256 `fe002ce55a63b573b70a753c9eb7926ac6114b0c0aa092fa6483ace03a0894c3`。九库缓存归零，原生 ready 等待 120691 ms；16 后台实际活跃后 47 ms 发出前台。20 项前台、停止前 165 次后台完整验证通过，后台驱动 errors=0。
- 此时用户明确要求提高内存软限制。I-B1 使用正常停止标记受控结束；前台协调器因后台结束而退出非零，不归类为候选运行故障，也不能归类为完整 90 项通过。日志 `tmp/I-B1-native-runtime.log` 保留。
- 按用户要求，独立实例的软限制从 10 GiB 提至 12 GiB，硬上限从 12 GiB 提至 14 GiB；物理内存实测 16367439872 字节。只改 owner/name/root/lease 绑定的资源例外，其余实例不变。控制脚本备份 `tmp/parity-resource-profile-before-12g.mjs`。不同配置分别报告，重新恢复快照后跑 `I12-B1`；真实负载及进行中重启恢复仍未完成。

## 12/14 GiB 完整负载与首次重启检查

- `I12-B1`：运行代码仍为 `fe002ce...`；原生 ready 等待 121755 ms，实际 16 后台后 89 ms 启动前台。前台 90/90、36 次真实 exec、最大前台 5 / 总 active 21；首段中位数 17618 ms、P95 40289 ms、最大 48791 ms。
- 后台 404 次完整 exec/read/write/最终回复验证，16 次结束时受控取消，驱动 errors=0；后台首段最大 77558 ms。持续运行后达到 12 GiB 软限制并使用约 3.2 GiB swap；不能声称硬件等同 V。
- 本轮原生日志无 `database is locked`、状态锁争用异常或 terminal session persistence failure；取消阶段有两次非致命 EPIPE，调用点均为 `WorkerPool.cancel` 的异步 IPC send。已提交取消发送保护候选，只使用原有关闭通道回调保护，不改变请求准入。
- 证据：`tmp/parity-results/B-full-1788882219184.json`、`background-I12-B1.json`、`coordinator-I12-B1.json`、`tmp/I12-B1-native-runtime.log`。
- `i12-recovery1`：真实 exec 已写入唯一标记后、仍 active 时调用旧 labctl restart。Gateway PID 1724334 → 1726039，ready 等待 134824 ms；420 秒验证窗口内没有新最终回复，标记未重复，恢复验收失败。
- 定位：旧 labctl restart 直接 systemctl stop/start；原生 SIGTERM 只有消费到 restart intent 才走重启恢复，否则为 stop。KillMode=control-group 又把 SIGTERM 同时送给 Worker，其退出后插件补写 interrupted tool result 并终结为 failed，启动恢复不会选中该失败会话。生产服务只读核对也为 control-group，但本轮不改生产。
- 已提交仅限本实例的管理入口候选：KillMode=mixed、labctl restart 先通过原生 API 写入精确 PID 的 restart intent（force=true、waitMs=0），再按原入口停止/启动；其他实例保持原行为。force 显式选择本次受控进行中恢复边界；仅 waitMs=0 在原生实现中会回落默认排空等待，并不代表立即重启。

## 2026-09-09 进行中重启恢复实测

- `i12-recovery2`：使用新入口，在唯一文件已经写入一行、真实 Agent 仍 active 时执行重启。旧 Gateway 日志先记录原生 restart intent、标记 1 个 interrupted main session，随后才中止 Worker；关闭耗时 4702 ms，未放宽 systemd 停止超时或原生完整性检查期限。
- Gateway PID 1726686 → 1727378；新进程 ready 等待 101423 ms。自动续跑产生新进程启动后的最终回复；没有用户重发；跨原始请求及原生内部恢复消息统计，原始写入工具调用 1 次、唯一标记 1 行。验证 `completed=true`。
- 恢复判定保留原始用户消息，额外 user-role 消息只允许原生 `internal_system` / `main_session_restart_recovery` 来源；不允许重复原始请求或新增普通用户消息。不是缩小到最后一条用户消息后统计副作用。
- 当前运行时代码包含取消消息的 EPIPE 防护。已启动 `I12-B2-restarted`，在恢复后的同一进程补跑完整 90 前台 / 16 后台矩阵。此轮不是文件缓存冷启动样本；新防护的负载取消验证、同为 12/14 GiB 的控制组及冷启动重复仍待完成。
- 证据：实例内 `tmp/parity-results/recovery-i12-recovery2.json` 及对应新旧 PID 的 systemd journal。生产 V 与其他实例未修改。

## 必须保留的限制与纠正

- VLab 4 核/约 15 GiB，生产 V 8 核/约 30 GiB，不能称为硬件完全等价。
- 9 库原始封存副本合计 14,159,519,744 字节；机器人、cron、浏览器、外部交付关闭；未复制生产 OAuth；旧业务恢复标记被隔离。后台采用 30–90k token 的完成历史，Short-V 保留原生 Flash 历史，其他后台及所有前台用 Pro。
- `B16-07` 的 16 个任务均完成实际工具和最终回复，但测试键含大写编号；Gateway 规范化为小写，导致精确空闲比较失败。逐个原生查询确认全部空闲后，修正测试键与目标查询，未降低空闲/并发门槛。该轮不作为完整矩阵通过。
- 一次候选重启的原生全量预检用了 212957 ms，仍在原 300000 ms 期限内；该次没有主动清除文件缓存，不冒称全冷。不能把第一轮前台延迟统计当作启动耗时。
- 同快照 A/B/A、进行中重启与唯一副作用/新最终回复验证尚未完成；生产发布尚未授权。
