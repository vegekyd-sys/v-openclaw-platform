# versa-runtime-providers 0.1.0

OpenClaw 9.6 起 V 不再用 worker 池（`vlab-agent-worker-isolation`）：agent 回合在 Gateway 进程里跑官方原生 runtime `openclaw`。演练基准显示去掉 worker 后更快也更稳。

worker 插件除了 worker 池，还顺带注册了两个 provider，而 V 的配置指着它们：

| 配置键 | 值 | 没人注册时的后果 |
| --- | --- | --- |
| `talk.realtime.provider` | `volcengine-rtc-agent`（小何语音，火山 RTC 托管房间） | 语音会话建不起来 |
| `agents.defaults.compaction.provider` | `versa-fast-quality-v1`（快速压缩 + 质量审查） | 静默退回内置压缩 |

这个插件只注册这两个，别的都不做。它不注册 harness、hook、gateway 方法和服务，也不 import core；9.6 从路径加载插件时，插件拿到的是 core 的捕获副本，副本里的模块状态不是 Gateway 的，所以只用插件 SDK。

- `volcengine-rtc-agent-provider.mjs`、`fast-compaction-provider.mjs` 与 `../worker-0.2.11-versa95.1/` 逐字节相同，测试会校验。
- 配置键和默认值沿用 worker 插件：`fastCompactionModel`（依次回退到 `agents.defaults.compaction.model`、`azure-openai/gpt-5.5`）、`fastCompactionMaxInputChars`（420000）、`fastCompactionMaxOutputTokens`（12000）、`fastCompactionMaxQualityRetries`（1）。schema 与 worker 插件里这四项一致，且 `additionalProperties:false`。不要把 worker 的其他键（如 `minWorkers`）放进来，否则 Gateway 以 78/CONFIG 退出，已用 9.6 的 `openclaw plugins inspect --runtime` 实测。
- **需要 llm 授权**：压缩 provider 调用 `api.runtime.llm.complete` 时总会指定模型。9.6 规定，`plugins.entries.<id>.llm.allowModelOverride` 不为 true 时拒绝指定模型（`LLM_COMPLETION_NOT_AUTHORIZED`），压缩就会退回内置实现。转换脚本会写上 `llm: {allowModelOverride: true, allowedModels: [<压缩模型>]}`。
- manifest 声明了 `activation.onStartup` 和 `contracts.realtimeVoiceProviders`。压缩 provider 只从已激活的注册表里查找，所以插件必须在启动时加载。
- 不能和 worker 插件同时启用：两边会注册同名 provider，报 "already registered"。

## 切换

```
node scripts/upgrade-mirror/noworker96-config.mjs --config <openclaw.json> \
  --plugin-path <本目录的安装位置> [--worker-config <worker-openclaw.json>] [--disable-mcp voice-memory] [--dry-run]
```

这个脚本把所有 `agentRuntime.id: "vlab-worker"` 改成 `openclaw`（`codex`、`claude-cli` 保持不变），worker 插件的条目改成 `{enabled:false}`，并从加载路径里删掉。然后加载本插件，把 worker 配置里的 fastCompaction* 四项搬过来，补上 llm 授权，`plugins.allow` 加上本插件，`mcp.sessionIdleTtlMs` 缺失时设为 300000。脚本可以重复执行。写入前先把原文件备份为 `.pre-noworker-<时间戳>`，回滚就是恢复这个备份。

传 `--worker-config` 时，脚本还会列出只在 worker 配置里生效的设置（只列路径）。无 worker 模式下 agent 回合读的是 Gateway 配置，这些设置会随之失效。

## 测试

`node --test *.test.mjs`：包括两个 provider 从 worker 组件原样搬来的测试、用假插件 API 的注册测试、schema 与代码读取的键一致性、与 worker 组件的字节一致性，以及不 import worker 专用模块的检查。
