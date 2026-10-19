# Codex PreToolUse relay 预算（可选，2026.9.1）

`patch-codex-hook-timeout.mjs --codex <@openclaw/codex 目录> --seconds 30` 修改 codex 插件 `harness-DXVZ5II5.js` 里写死的 `nativeHookRelay: { enabled: true }`，覆盖两处：回合和 side question。改后 Codex hook 超时变成 N 秒，relay CLI 的 `--timeout` 是 N×1000−1000 毫秒。没有配置项可以改这个值。

**只是缓解，不是修复，默认不上。** 是否采用由 Tianyi 决定。

VLab 对照数据（详见 `docs/codex-hook-relay-timeout-20261017.md`）：Gateway 主线程持续饱和（ELU=1，每轮 3 s），8 路并发调用。

| 预算 | 被拦 | wall p50 / max |
|---|---|---|
| 10 s（V 现状） | 14/16 | 11.9 s / 13.5 s（被拦的在 9 s 处断开） |
| 30 s | 0/16 | 24.1 s / 30.6 s |

- 仍然是 fail-closed：超出预算照样 deny，策略和审批不受影响。
- 好处：Gateway 饱和期间，模型不必因为被拦而重试。重试一次就是带着完整上下文再调一次模型。
- 代价：
  - 每次工具调用可能要等二十多秒；
  - Gateway 真冻结（50 s 级）时，照样会失败，只是失败得更晚；
  - 冷启动也算在 Codex 的预算里。CPU 满载时冷启动可达 5–11 s，max 已经贴近 30 s。
- 需要重启 Gateway。插件目录由 npm 管理，重装后要重新打补丁。只能从原始文件打一次，改秒数要先还原文件。
