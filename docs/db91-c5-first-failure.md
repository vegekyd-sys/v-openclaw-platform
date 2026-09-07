# 首次同 Agent 五项目真实争用复现

2026-09-07 12:01 UTC，db91-fix 自有 VLab 实例，完整 2.523GB makaron 库，五个真实注册项目/不同会话，Worker 5×1，同一父 slice CPU200%、MemoryHigh4GiB/Max6GiB。完整性候选已启用，启动原生全校验耗时18,391ms。生产与共享实例未修改。

测试脚本：`scripts/test-db91-project-writes.mjs 5 3`，运行版本6595e39，caseId=w1788782468483。请求进入原生执行后，在模型调用压力工具之前失败；因此没有达到工具同步写入 barrier，不是“15条写入压测通过”。

结构化原生日志现场读取结果：

- PID1661106：12:01:33.507Z 报告 `slow SQLite transaction hold`，elapsedMs=11760，原生日志未标注 operation/database，仍需调用栈定位。
- PID1661105、1661119、1661112：先出现未标注对象的begin锁超时约5秒；随后明确在同一 `/state/agents/makaron/agent/openclaw-agent.sqlite` 上执行 `agent.write`，BEGIN分别等待5007、5005、5005ms后失败，sqlitePrimaryCode=5。
- PID1661118：同库agent.write BEGIN等待2031ms；Gateway PID1661063同库BEGIN等待1730ms。
- 项目0、4、2原生harness报 `database is locked`，Gateway约23秒返回失败。测试控制器随后取消项目1、3，未静默重试。
- 父slice内存现场采样峰值2,846,658,560字节，低于6GiB上限；不能据此单独排除CPU/调度对长持锁的影响。

这证明完整性冷开优化未解决该同库争用问题，是上线阻断。下一步在仅自有实例的native transaction慢日志增加调用栈观测，确认长事务具体来源。observer不属于生产安装器。不能把长事务和缺省operation的日志强行解释为已定位根因。

此前两项目三轮脚本校验 caseId=w1788782250002 通过：两个真实工具写入重叠463ms、6条转录按eventId/内容哈希读回正确、真实工具结果+最终回复均落库，端到端10967/10874ms，HTTP失败0。这只是小规模脚本正确性证据，不抵消上述五项目失败。
