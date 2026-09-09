# 完整历史首字体验：VLab 2026-09-09

状态：实验候选，尚未完成性能/回归验收；未发布生产。

## 边界

- 用户授权继续在完整 V 数据副本上优化首字，不改 Core Prompt。
- 实例 `db91-parity:26340`，owner `codex-db91-production-equivalent-20260908`；通过 labctl 获取 integration lease 后沿用完整副本的资源 profile。原共享 24993 和 GPT Live 实例未改动/停机。
- 分支 `codex/vlab-production-equivalent-db91`，任务自有 worktree。模型仍 DeepSeek V4 Pro，配置默认 max，原生协议映射为 high；未调整思考档位、裁剪历史或删减工具。
- channels/cron/browser 禁用；模型通过原生 Agent 执行，测 Gateway WebSocket 正文首字，不把 HTTP 响应头、思考片段、最终对象创建时间当作首字。不代表真实飞书终端验收。
- 群历史测试通过 `sessions.create` 的原生并行 fork，`forkFrom=last-completed`、`emitCommandHooks=false`，不接管/重放父会话业务。历史 fixture 引用与结果保留在实例私有 tmp 中，不进 Git。

## 基线事实

完整有效测量 `traced-1788915216154.json`：

| 场景 | 正文首字 | 开始请求模型 | 说明 |
| --- | ---: | ---: | --- |
| 重启后新会话 Hi | 11.348 s | 8.220 s | 本地首次准备占比较高 |
| 同会话再次 Hi | 2.143 s | 0.995 s | 约 31,872 token 命中缓存 |
| 另一新会话 Hi | 3.940 s | 0.945 s | 约 12,544 token 命中缓存 |
| 新鲜只读 exec | 3.614 s | 0.881 s | 工具结果包含本轮唯一编号，验证通过 |

原始 `baseline-1788914902840.json` 的端到端结果有效，但其 Worker 观察器最初装在未启用的旧 runtime 副本上，阶段不全；恢复后重新对实际 `runtime/production-worker` 安装并以上述 traced 轮为完整阶段依据，不把缺失阶段当作零耗时。

完整历史基线 `history_a-1788915267509.json`，约 553k 输入 token，387 条消息，47 个工具：

| 场景 | 正文首字 | 请求模型 | 首思考 | cache hit / miss |
| --- | ---: | ---: | ---: | --- |
| 历史 fork 首次 Hi | 66.294 s | 1.536 s | 62.192 s | 12,544 / 540,613 |
| 同会话下一次 Hi | 4.714 s | 1.102 s | 3.842 s | 553,344 / 110 |
| 相同历史另一 fork Hi | 23.555 s | 1.390 s | 22.847 s | 12,544 / 540,616 |
| 新鲜只读 exec | 7.610 s | 1.011 s | 3.817 s | 首轮 553,088 / 178 |

两份 fork 的消息历史长度相同、工具定义哈希相同，system prompt 的差异发生在末尾 Runtime 会话信息区域；同会话第二次 system hash 不变。这里证明了该 fork 实验的前缀失配，不等于已经证明生产每个十几秒样本都由同一个原因造成。模型前缀缓存是 best-effort，网络、远端排队与缓存写入时序仍可能影响样本。

## 候选与待验收

候选源码 `8121ad44cacce55d519b7fa0a1bdf34b863a3888`，实验总 runtime hash `838d54980daf2239e7820b1efa06337c51c033b69d253a77961f8930ea0fcff0`。

仅对显式开启 `OPENCLAW_DEEPSEEK_LATE_RUNTIME_CONTEXT=1` 的 DeepSeek V4 Pro 请求，在原生 `OPENCLAW_CACHE_BOUNDARY` 处分开稳定提示与动态运行部分，后者仍为 system 消息，移动至最后一条 user 消息之前。所有历史消息顺序、内容、当前 user 与后续工具链保持不变；两个 system 文本拼回后与原生实际发送文本逐字节相同。未修改 Prompt 构建器、Core Prompt 存储、模型/思考设置、工具 schema 或转录。

单元检查：10/10（含观察器五项），覆盖非目标/关闭时引用不变、文本无损、历史不变、并行工具结果连续性、会话变化后的共同历史前缀、歧义输入不生效，以及流式读取与取消行为。

仍需真实 Agent Hi、缓存复用、当前 Runtime 会话身份、新鲜 exec 与回退 A2 对照；布局调整可能影响模型行为，单元检查不能替代这些回归。

## 操作和回滚

- 脚本 `install-parity-late-context.mjs` 固定实例/owner，要求服务停止、源码精确提交且工作树干净；不接受生产目标。
- runtime 原文件与原 env 备份只在实例私有 `state/late-runtime-context-20260909`；不得导出其中 env。
- 先确认本任务测试原生空闲，`labctl stop db91-parity --owner ...`，用相同脚本和当前 source SHA 加 `--restore`，再经 labctl 重新记录候选并启动。
- 第一版 Worker 观察器的旧副本源码已经恢复；仅残留不被导入的无敏感信息观察器 helper，不清理其他任务文件。
