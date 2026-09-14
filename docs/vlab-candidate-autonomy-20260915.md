# Candidate 自主执行修正验收

用户要求撤掉候选工具给 Agent 添加的网络与其他执行限制。本修正替代上一版断网沙箱；不会自动启动渠道或业务任务，只执行 Agent 选择的命令。

变更：删除 bwrap 沙箱、固定两并发槽位、CPU/Memory/Tasks/默认时限、输入/输出/数据库大小及数量上限、分支名限制。执行配置与服务器环境保留真实 provider/凭据引用和集成设置；Agent 可选择任意 command、env、cwd、user，显式 timeoutSeconds 可选，默认 0 无时限。运行代码改用独立可写文件副本，避免污染版本缓存。诊断 fixture 仍脱敏。

实机 receipt：`candidate-46481480-22a9-4d16-8a39-ac8f530aff99`。

- 真实 OpenClaw 配置修改、独立读回、恢复通过。
- 真实 SQLite 私有副本写入及 runtime 可写验证通过，共享 Gateway 可连接。
- 外网 HTTPS 访问 example.com 并验证响应内容通过。
- 从正在运行的 unit 实读：CPUQuotaPerSecUSec、MemoryMax、TasksMax、RuntimeMaxUSec 全部为 infinity。
- Agent 选择 `lab-db91-parity` 身份匹配现有插件属主；无插件 suspicious ownership 警告，无配置元数据库路径警告。该身份是示例选择，runner 默认管理身份也已单独通过外网/配置/SQLite 测试。
- 总耗时 11733 ms；共享 PID/配置保持不变。
- 16 项本地自动回归通过，包括可选外部输入、任意命令/环境参数、默认无限时长、保留集成设置及原 Git/worktree 回归。

这证明候选执行能力开放与列出的实际测试，不代表所有 provider/语音链路已在本任务完成业务验收。旧 worktree 请使用 dev 的控制入口，将 `--repo` 指向自己的代码，避免继续调用旧 runner。

三并发实际命令验证：三个 Python 命令均成功，三者同时运行重叠 3.948 秒，证明旧的两任务并发门禁已撤销。对应 receipts：`candidate-e121ea7a-0e29-4043-acce-b203c149c37d`, `candidate-96e38d66-a913-4b13-b8ea-74441384b0a2`, `candidate-092d1684-aad9-4de9-9f97-1ab90b0fdc54`。
