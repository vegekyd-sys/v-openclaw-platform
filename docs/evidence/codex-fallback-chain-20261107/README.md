# /vds 灰度形态下的回退链与 Codex 重试次数（2026-11-07）

问题：交互群用 `channels.modelByChannel` 换到 /vds 后，DeepSeek 出故障时谁接、多久接。11/01 的建议是把回退链改成 `[flash, luna]`，这次在当前字节上重测，结论相反。

## 环境

- VLab candidate，V 当前字节：Codex 插件整包 `c2bbae59`（11/01 13:35 起 V 上没变过，11/06 存档 72 个文件逐一相同），core 是 VLab 当前 runtime（含 #543/#544/#558/#559/#561/#563）。
- 加 #534 的看门狗补丁（`CODEX_PATCHES`），DeepSeek `timeoutSeconds=90`（与 V 相同）。
- 形态与灰度方案一致：默认 `deepseek/deepseek-flash`（Worker），`modelByChannel` 把会话换到 `deepseek/vds-deepseek-flash`（Codex），回退链是被测变量。
- luna 用替身：Worker runtime 上一个独立 provider `lunastub`，故障代理对它永远放行（背后是真 DeepSeek flash）。candidate 不能用 ChatGPT 登录（会刷新令牌，见记忆 candidate-stale-oauth-refresh），所以这里只测路由和耗时，不测 luna 本身。
- 故障代理在 Codex 和 Worker 前面：`-all` 让所有 DeepSeek 请求都出故障（DeepSeek 整体故障，11/03、11/07 发生过的那种），`-codex` 只让 Codex 的 `/responses` 出故障（只有 Codex 路径坏）。
- 每个故障一个新会话：先一条健康消息，再一条故障消息，再一条健康消息。任务是一次 shell 调用后回复哈希，回复正确证明工具真的跑了。n=1。

脚本 `lab/candidate/runtime-concurrency.mjs` 的 `CHAIN_COMPARE`，plan `lab/candidate/codex-chain-*.plan.json`。原始记录是同目录的 `*-progress.jsonl`。

## 回退链

| 故障 | `[flash, luna]`（candidate-60601d23） | `[luna]`，即 V 现状（candidate-666b44e2） |
|---|---|---|
| DeepSeek 整体 503 | 31.8 s → luna | 32.2 s → luna |
| DeepSeek 整体挂起 | **278.6 s** → luna | **95.4 s** → luna |
| 只有 Codex 503 | 31.2 s → flash（Worker） | 32.5 s → luna |
| 只有 Codex 挂起 | 95.5 s → flash（Worker） | 96.4 s → luna |

- 8 条故障消息全部回复正确；故障后的下一条都回到 Codex，3.6–8.8 s。
- 整体挂起时 `[flash, luna]` 多出的 183 s：Codex 看门狗 90 s 后交给 flash，flash 在 Worker 上同样挂起，Worker 同模型重试一次，两个 90 s 都耗完才到 luna（代理记录 `hang:responses`、`hang:completions` ×2、`ok:completions` ×2）。
- 整体 503 时 flash 那一步只花不到 1 s（两次立刻返回的 503）。
- flash 在前的唯一好处是“只有 Codex 坏”时不花 ChatGPT 额度。11/01 修完 `another runner` 后，近两天日志里 Codex 专属故障是 0，而 DeepSeek 自身的 500/503 在 11/03 和 11/07 都出现过。

**结论：回退链保持 V 现在的 `[openai/gpt-6-luna]`，不要改成 `[flash, luna]`。** 回退候选按 provider/model 去重（`createModelCandidateCollector`），所以 Worker 默认会话不受这个选择影响。

## Codex 的重试次数

V 的 `codex-home/config.toml` 里 `[model_providers.deepseek]` 没写重试次数，Codex 用默认值：请求重试 4 次、流重试 5 次。整体 503 时 Codex 一共打了 30 次 `/responses`（6 × 5），约 25 s 后才把失败交给 OpenClaw。

在 `[model_providers.deepseek]` 加 `request_max_retries = 1`、`stream_max_retries = 1`（链为 `[flash, luna]`）：

| 故障 | 默认（candidate-f918dda5） | 重试 1 次（candidate-05f3061b） |
|---|---|---|
| DeepSeek 整体 503 | 32.4 s，Codex 30 次请求 | **11.3 s**，Codex 4 次请求 |
| 每个请求首块后断流 | 20.4 s，Codex 6 次请求 | **9.9 s**，Codex 2 次请求 |
| 只有第一个请求 503（瞬时） | 3.6 s，Codex 内部重试成功，不回退 | 4.3 s，Codex 内部重试成功，不回退 |

- 瞬时故障仍在 Codex 里自愈，不会因为调低次数就回退。
- 两边都是 `[flash, luna]`，整体故障时都多经过一次 flash；换成 `[luna]` 预计再少约 1 s，没单独测。
- candidate-f918dda5 结束时清理目录报 `ENOTEMPTY`，退出码 1；它的三个场景都已跑完并记录。

**结论：第 1 批的配置里加上这两行。** 只改 V 上 makaron 的 Codex 配置文件，Gateway 重启后新起的 app-server 才读到，正好和 `modelByChannel` 那次重启合并。

## 未覆盖

- 真实 luna（ChatGPT 订阅）：只测路由；luna 的大会话窗口见 #543/#544 的验收。
- 并发下的故障、压缩中的故障、大会话。
- n=1，耗时由超时和退避决定，机器负载影响小，但没有重复。
