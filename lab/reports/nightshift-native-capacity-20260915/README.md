# Night Shift 原生调度与混合负载验收

## 范围

接手飞书群 `oc_e0714165b7209676a3ffb9358dd03c9f`。所有变更在独立任务分支；共享 VLab、dev 和生产 V 的运行产物未被本任务更改。

## 2026-09-15 生产现场

- Gateway：db91.6，PID 2447184，启动于 08:35:42 CST。
- Night Shift：部署 commit `c299ec1aca0465c3aaee9d8c6b77445065a35761`，PID 2083864。
- PR #25–#30 的提交均包含于上述 Night Shift 部署版本；GitHub 仍为 draft/open，不能凭 PR 合并状态判断是否上线。
- PR #31 `b7ef202cf06d09baba6ffec6e2828fa297b36135` 尚未部署；本分支在 `209d775919bd67fa8db7a28fcd4abe0b73a25cb6` 集成了该 PR。
- 生产仍使用旧周期调度；已配置全局 36、每实例 8、每 15 秒最多启动 3 个。原生事件调度和普通会话保护尚未成为生产部署事实。

## 本次补充修复

- 所有 API 发起的 dispatch 进入同一调度和压力预算，避免手动重试绕过保护。
- 新探测确认后只放行一次启动；探测超过 10 秒失效。5 秒探测与原有 3/15 秒全局启动窗口共同限制冷启动。
- 从 Worker 池读取总容量、活动数和排队数，为普通会话至少预留 9 个槽位；已有排队时暂停新增 Night Shift。
- 已占用槽位不再误计为“本轮新启动”，防止消耗错误预算。
- 新生成的下游卡片立即进入 scoped 快照，不必等 5 分钟修复周期。
- 完成校验被限流时保持本地运行态，不提前解锁下游；自动重试、定时节点和延期校验均安排后续唤醒。
- 并发连接复用一个 WebSocket；断线仅重试明确只读请求。写入响应丢失后不盲目重放，下一次读取执行一次完整恢复快照，收养已有卡片。

## 验证状态

- 当前 VLab Workboard handler 源码契约和 Night Shift 回归：167/167，通过，零跳过（含 Worker 插件配置检查）。
- 生产结构化脱敏回放：84 个发布版本、168 个项目、2250 张卡、2667 次尝试；168/168 项目规划与生产版本一致，当前可比较动作 6 条，差异 0。此项证明当前快照规划兼容性，不代表执行全部历史工作流。
- Dashboard 构建通过。
- 真实原生父子卡：父卡完成前子卡启动数为 0；随后 2/2 卡片实际调用 memory_search、exec、workboard_complete 并给出最终回复。receipt `candidate-6ddc8a16-ff44-4e41-8328-53005fbf5f18`。
- 真实 20、30 并发：50/50 卡片完成；独立 Worker 采样分别达到 20、30 个实际活动任务；29/29 混跑普通会话成功。精确运行源码 `fd424e0725cbb52dab2ce5fe0f4139c33cad5322`，dirty=false；receipt `candidate-1fca0b67-40dc-4e05-bb08-183b7ecae9d5`。详见 [容量证据](capacity-evidence.json)。
- Night Shift HTTP 服务端到端事件调度：通过。经真实 API 发布工作流、创建项目，两级原生父子卡自动完成，项目 43.6 秒内变为 done，早于 5 分钟 repair sweep；完成时调度耗时 33 ms。
- 历史规模复验：加载 2250 张不可执行历史卡，序列化体积 3.16 MB（生产脱敏卡快照 2.34 MB）；30/30 原生任务完成，实际 Worker 峰值 30，18/18 普通会话成功。该 fixture 覆盖条数和体积，不等同于生产全部元数据和会话的逐字复制。
- 最新真实验收源码：`89bb5dd8151cb18de601b4ef40e84a44e1b1d850`；receipt `candidate-4e153e59-ee70-4734-baba-49051689f6da`。dirty 仅来自未提交的报告，执行输入 checksum 单独核对。详见 [历史规模和服务证据](history-and-server-evidence.json)。

| 原生并发 | 普通会话成功 | 接收延迟 P95 | 工具+回复 P95 | Gateway event-loop P99 |
|---|---:|---:|---:|---:|
| 20 | 11/11 | 9.3 ms | 16.4 s | 17.4 ms |
| 30 | 18/18 | 15.2 ms | 14.8 s | 21.0 ms |
| 30 + 2250 历史卡 | 18/18 | 43.9 ms | 23.4 s | 21.3 ms |

普通会话单独运行的热态样本为 6.2–7.5 秒；混跑尾部回复变慢，但接收没有排成长队。20 并发组仍观察到一次 1.87 秒 event-loop 最大停顿，30 并发组最大 450 ms；不能把 P99 通过解释为完全没有冷启动尖峰。

## 原生工具配置缺口

当前 VLab Gateway/Worker 的显式插件列表没有 Workboard。只走原生 dispatch 时，Worker 可以完成模型和命令，但缺少 Workboard 完成工具，卡片停在 review。私有候选通过 `enableNativeWorkboardTools` 给两端注册 Workboard，保留模型、完整工具配置和其他插件。修改后真实完整回写与上述容量验收通过。后续共享部署必须同时带上该配置变更，不能只更新 Night Shift npm 包。

## 真实测试边界

candidate 在 VLab 主机上使用私有配置、数据目录和独立 Gateway/Worker 进程；禁用渠道、Cron、浏览器，避免触发业务。凭据只留在服务器。共享实例 PID 前后必须相同。

早期三次 canary 发现测试采用 `deepseek/deepseek-flash` 别名时，chat 路径解析为 canonical ID，原生 agent 路径却落到其他 allowlisted 模型；因此失败样本不能作为生产默认模型故障或容量证据。后续改为继承 VLab 配置中的 `deepseek/deepseek-v4-pro`。

容量测试明确区分实际同时运行的模型/工具会话与 CPU 密集型外部命令；等待型工具形成的并发不能证明 30 个重型编译任务的 CPU 隔离能力。

候选复制了服务器端身份/工具/Memory 引导文档，并使用当前默认 DeepSeek V4 Pro；没有复制历史会话或 Memory 检索索引。memory_search 调用有记录，但空候选索引返回不可用/无结果，本轮不证明历史 Memory 检索质量。

## 合入与共享部署

候选修复通过，尚未合入 dev、部署共享 VLab或上线生产 V。共享实例 PID 在各轮验收前后均为 2646318；生产 Gateway 和 Night Shift PID 分别仍为 2447184、2083864，生产 Night Shift 进程 cwd 与 current 链接均为 c299ec1 发布目录。

用户批准合入后，按 lab lease 流程部署 Night Shift 服务及 Gateway/Worker 的 Workboard 插件启用配置，再检查共享 VLab 的真实项目操作。此配置变更需要纳入备份与回滚。保持 PR #31 本人的分支不变，使用本任务分支提交合入。
