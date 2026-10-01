# Codex 应用插件关闭（canva）验收 · 2026-09-30

改动与原理见 `lab/release-files/codex-plugins-off/README.md`（PR #129，dev `1d4db3b`）。

## 共享 VLab（真实 ChatGPT 登录）

测试会话 `agent:makaron:explicit:vlab-dev-vcodex-ttft-1790773604695`，发 `/vcodex` 后返回 `openai/gpt-6.1-sol`；用 `vlab.mjs test` 发送，`deliver:false`，不往飞书发消息。时间取自 `trajectory_runtime_events` 和 `codex-home/logs_2.sqlite` 里的 app-server 请求日志。

| 回合 | 用户消息 → 线程就绪 | 回合开始前的插件请求 |
|---|---|---|
| 基线 1（插件开） | 4.8 s | app/installed、plugin/installed、app/read、plugin/read、app/installed、plugin/read |
| 基线 2（插件开） | 6.2 s | plugin/installed、plugin/read、app/installed、plugin/read、app/installed、plugin/read |
| 改后 1（重启后冷启动） | 2.8 s | 无（initialize、account/login/start、configRequirements/read、skills/list、thread/start） |
| 改后 2 | 0.3 s | 无 |
| 改后 3 | 0.3 s | 无 |

5 轮回复都正确，模型为 gpt-6.1-sol，provider 为 openai。改动时 VLab 空闲，采用停服 → `config.mjs --apply` 改两份配置 → 启动的方式；约 2 分钟就绪，worker 池 5 个，夜班伴随服务正常运行。

## 生产 V

21:14 第一次尝试等空闲：45 秒内一直有 7 个活跃项（定时任务、后台任务、根请求），脚本放弃并恢复接入，V 没有受影响。Tianyi 选择现在做保留式重启：`activate-production.mjs --preserve-inflight`，Gateway PID 635943 → 1141805，21:17:18 启动。21:20 哨兵报告 worker 池 5；夜班 gatewayRestart 状态由 hold → resuming → up。

验收由 lark-cli 以 Tianyi 身份在私聊 `oc_e76c5073…` 中发送（该会话走 vcodex：gpt-6.1-sol / openai / codex）：

| 回合 | run 开始 → 线程就绪 | 回合开始前的插件请求 | 模型 |
|---|---|---|---|
| 改前 20:36 测速 2（热） | 4.2 s（其中 Gateway 空闲 3.9 s） | plugin/read、app/installed、plugin/read | 5.9 s |
| 验收 1（重启后冷启动） | 3.7 s | 无（initialize、login、thread/start） | 8.1 s |
| 验收 2（热） | 1.8 s | 无（只有 turn/start） | 7.1 s |

飞书收到 → 回复卡片，扣掉模型时间：改前 7.0 s，改后 3.6 s。剩下的 1.8 s 是 80 MB 大私聊的本地计算（扫会话树、解析会话条目、GC），这次没有处理。

回退：用 `.before-codex-plugins-off-*` 备份恢复两份配置，再受控重启。
