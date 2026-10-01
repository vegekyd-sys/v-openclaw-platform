# 关掉 Codex 应用插件（canva），省掉 /vcodex 每轮 3–4 秒

## 问题

2026-09-30 Tianyi 反馈 `/vcodex` 首字慢。V 上用 lark-cli 发了两条纯文字测速消息，同时通过 Gateway 已开的 inspector 抓了 CPU profile，得到如下结果：

| | 测速 1 | 测速 2 |
|---|---|---|
| 飞书收到 → run 开始 | 1.1 s | 1.2 s |
| run 开始 → Codex 线程就绪 | 8.1 s | 4.2 s |
| 其中 Gateway 主线程空闲（在等） | 4.2 s | 3.9 s |
| 模型 | 7.6 s | 5.9 s |

两轮都有约 4 秒主线程是空闲的。同一时段 Codex app-server 的日志（`codex-home/logs_2.sqlite`）显示，Gateway 在 `turn/start` 之前依次发出这些请求：

```
20:36:35.54  plugin/read     （联网，插件市场）
20:36:36.21  app/installed
20:36:37.74  plugin/read     （再一次）
20:36:38.57  turn/start
```

这些请求来自 `plugins.entries.codex.config.codexPlugins`，里面只配了 canva。Canva 的应用清单一直是缺失状态，所以 `buildCodexPluginThreadConfig` 每轮都走 "initial_missing" 分支：读插件 → 刷新应用清单 → 再读一遍。缓存从来没有填上，每个回合都要重新做一遍。当天有完整请求日志的 6 个回合，从第一个插件请求到回合开始，中位 4.3 秒。

- Canva 从来没有被模型调用过。9 月的 Codex rollout 里匹配到的都是 OpenClaw 自带的 `canvas` 工具。
- 日志一直在报 `codex plugin inventory missing app inventory for detail apps`，说明 Canva 应用实际上也没有暴露给模型。

## 改动

`config.mjs` 只把 `codexPlugins.enabled` 改成 `false`，插件列表原样保留，回退时改回 `true` 即可。插件处于禁用状态时，`buildCodexPluginThreadConfig` 在发出任何请求之前就会返回空配置，外加一份禁用应用的补丁。

`config.mjs` 在以下两种情况会拒绝修改：配置里出现 canva 以外的插件，或者设置了 `allow_all_plugins`。这两种情况说明配置在本次审阅之后被人改过，需要重新看过再动。

```sh
node config.mjs /absolute/openclaw.json            # 只显示计划
node config.mjs /absolute/openclaw.json --apply    # 备份后写入
```

V 上有两份配置都开着 canva：Gateway 的 `/home/openclaw/.openclaw/openclaw.json`，以及 Worker 的 `experiments/agent-worker-isolation-v1/worker-openclaw.json`。两份都要改。

## 验证

- 离线测试：`config.test.mjs`。
- VLab candidate：`lab/candidate/codex-plugins-off.plan.json`（关）和 `codex-plugins-on.plan.json`（开）。私有 Gateway 使用共享 VLab 的真实配置，两份配置都按本改动迁移，在 `buildCodexPluginThreadConfig` 的两个分支上插了桩，并记录每一次 app-server RPC 的耗时。
  - `candidate-bde23087-3c5d-4033-9b43-4b8291528b69`（关）：`/vds` 4 个回合全部回复正确，4 次全部走 disabled 分支，没有任何 `plugin/*` 或 `app/*` RPC，`sharedUnchanged=true`。
  - `candidate-a7ac95ac-febe-433a-b7b1-3cb60167e30e`（开，对照）：同样 4 个回合全部正确，4 次全部走 inventory 分支，说明探针能区分两种状态，改动确实把分支切换了。VLab 上这几个插件 RPC 都不到 20 ms，因为没有 ChatGPT 登录，请求在本地就失败返回；V 上同样的请求要联网，每个 0.7–1.5 秒。
- VLab 证明不了提速效果。开着插件时 VLab 也会走读取清单的分支，但因为 ChatGPT 登录已经过期，插件请求不会真的联网，几毫秒就返回了。提速只能在 V 上验收：回合开始前没有 `plugin/read`，run 开始到线程就绪回到 1–2 秒量级。

## 上线

这是纯配置改动，不涉及 runtime 字节。`activate-production.mjs` 沿用 vcodex-sol61 的受控重启流程：

1. 取得空闲栅栏；只有在用户授权时才走 `--preserve-inflight` 原生交接。
2. 停服之后再写两份配置，避开在线配置监听。热重载可能把 Worker 池永久关掉。
3. 启动服务并等待就绪。

夜班会随 Gateway 重启自动暂停并接上（PR #125）。脚本只在 V 上以 root 身份运行。

线程配置的指纹会因此变化，已有的 Codex 线程在下一轮可能会重新同步设置，届时首轮会慢一次。

回退：用 `.before-codex-plugins-off-*` 备份恢复两份配置，再做一次受控重启。
