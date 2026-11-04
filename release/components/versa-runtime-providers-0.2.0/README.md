# versa-runtime-providers 0.2.0

从 OpenClaw 2026.10.10 起，V 不再用 worker 池（`vlab-agent-worker-isolation`），Tianyi 于 2026-11-04 拍板。agent 回合改在 Gateway 进程里跑，用官方原生 runtime `openclaw`。依据是 vlab91 演练：10.10 不带 Worker 时，稳态首字不比带 Worker 的 V 慢（15 并发中位数 7.9 秒对 8.2 秒）。

worker 插件除了 worker 池，还顺带注册了一个 provider，V 的配置至今还在用它：

| 配置键 | 值 | 没人注册时的后果 |
| --- | --- | --- |
| `agents.defaults.compaction.provider` | `versa-fast-quality-v1`（快速压缩 + 质量审查） | 静默退回内置压缩 |

这个插件只注册这一个 provider，别的都不做：不注册 harness、hook、gateway 方法和服务，也不 import core，只用插件 SDK。

0.1.0（9.6 时做的）还注册了 `volcengine-rtc-agent`，即 Control UI 里的小荷/火山 RTC 语音。2026-11-04 拍板 Control UI 里的 RTC 不要了，语音只保留独立的 v-voice 入口，所以 0.2.0 不再带它。

- `fast-compaction-provider.mjs` 与 V 最后一次捕获的 worker 字节逐字节相同（`release/captured/voice-streamed-hangup-20261013b.worker/dist/`），测试会校验。
- 配置键和默认值都沿用 worker 插件：
  - `fastCompactionModel`：没设时依次回退到 `agents.defaults.compaction.model`、`azure-openai/gpt-5.5`。
  - `fastCompactionMaxInputChars`：默认 420000。
  - `fastCompactionMaxOutputTokens`：默认 12000。
  - `fastCompactionMaxQualityRetries`：默认 1。

  schema 与 worker 插件里这四项一致，且 `additionalProperties:false`。worker 的其他键（如 `minWorkers`）不能放进来，否则 Gateway 以 78/CONFIG 退出（9.6 上实测）。
- **需要 llm 授权**：压缩 provider 调用 `api.runtime.llm.complete` 时总会指定模型。`plugins.entries.<id>.llm.allowModelOverride` 不为 true 时，指定模型会被拒绝，压缩就退回内置实现。转换脚本会写上 `llm: {allowModelOverride: true, allowedModels: [<压缩模型>]}`。
- manifest 声明了 `activation.onStartup`：压缩 provider 只从已激活的注册表里查找，所以插件必须在启动时加载。
- 不能和 worker 插件同时启用：两边会注册同名 provider，报 "already registered"。

## 切换

```
node scripts/upgrade-lts/noworker-config.mjs --config <openclaw.json> \
  --plugin-path <本目录的安装位置> [--worker-config <worker-openclaw.json>] [--disable-mcp voice-memory] [--dry-run]
```

脚本做这些改动：

- 所有 `agentRuntime.id: "vlab-worker"` 改成 `openclaw`；`codex`、`claude-cli` 保持不变。
- worker 插件的条目改成 `{enabled:false}`，并从加载路径里删掉。
- 加载本插件，把 worker 配置里的 fastCompaction* 四项搬过来，补上 llm 授权，`plugins.allow` 加上本插件。
- `mcp.sessionIdleTtlMs` 缺失时设为 300000。
- 删掉 `talk.realtime.providers.volcengine-rtc-agent`。如果默认的 `talk.realtime.provider` 还是它，脚本拒绝执行；V 现在是 `openai`。

脚本可以重复执行。写入前先把原文件备份为 `.pre-noworker-<时间戳>`，回滚就是恢复这个备份。

传 `--worker-config` 时，脚本还会列出只在 worker 配置里生效的设置（只列路径）。无 worker 模式下 agent 回合读的是 Gateway 配置，这些设置会随之失效。

## 测试

`node --test release/components/versa-runtime-providers-0.2.0/*.test.mjs scripts/upgrade-lts/noworker-config.test.mjs`
