# v-quota-router

这个工具在本周订阅额度预计用不完时，把重要会话切到 `/vcc`（Claude 订阅）或 `/vcodex`（ChatGPT 订阅）；额度快用完时再切回 agent 默认模型（`/vds`）。

为什么这样设计、调研结论、需要拍板的事项，见 [docs/quota-aware-routing.md](../../docs/quota-aware-routing.md)。

## 它做什么、不做什么

- **读额度，不花额度。**
  - Claude：用 Claude Code 自己的 access token 调 `GET /api/oauth/usage`，最多每 15 分钟一次，失败或 429 时用缓存。**从不刷新令牌。**
  - Codex：读 rollout 里最新的 `token_count.rate_limits`。读数过期时，改用 Gateway 的 `usage.status`。
- **只用原生接口切换。**
  - 调用 `sessions.patch {key, model}`。效果等同于用户在聊天里打别名。传 `model:null` 表示回到默认模型。
  - 连接时只申请 `operator.read` 和 `operator.write`，不申请 admin。原因：在 `modelSelectionScope=effective` 下，带 admin 的 patch 会把模型写进配置。
- **只碰它管的会话。**
  - 只碰两类会话：没有任何模型覆盖的，以及它自己切过、且模型没被别人改过的。
  - 用户自己选过的模型一律不动；它切过的会话被用户改了模型，它就放手。
- **不碰正在跑的会话。** 有活跃 run 的会话不 patch，等下一轮。

## 命令

```bash
node quota-router.mjs probe                 # 只读额度和配速，不连 Gateway
node quota-router.mjs tick --dry-run        # 完整走一遍，只打印计划
node quota-router.mjs tick                  # 按 config.mode 执行（默认 dry-run）
node quota-router.mjs release-all           # 把它切过的会话全部切回
```

常用参数：

- `--state-dir`：默认 `$OPENCLAW_STATE_DIR/v-quota-router`。
- `--config`：默认 `<state-dir>/config.json`。
- `--openclaw-config`：默认 `$OPENCLAW_CONFIG_PATH`。
- 测试用：`--quota-fixture <json>`、`--now <ms>`。

## 配置（`<state-dir>/config.json`，全部可省略）

```json
{
  "mode": "dry-run",
  "agentId": "makaron",
  "tiers": [
    { "id": "claude", "model": "anthropic/claude-opus-5-5", "quota": "claude", "maxSessions": 2, "ownerOnly": true,  "maxTotalTokens": 300000 },
    { "id": "codex",  "model": "openai/gpt-6.1-sol",       "quota": "codex",  "maxSessions": 3, "ownerOnly": false, "maxTotalTokens": 250000 }
  ],
  "pacing": {
    "claude": { "reservePercent": 15, "hardStopPercent": 90, "endgameHours": 36 },
    "codex":  { "reservePercent": 15 }
  },
  "importance": {
    "vip": { "feishu:group:oc_xxx": 45 },
    "labelKeywords": { "重要": 40 },
    "minScore": 40
  },
  "policy": { "maxUpgradesPerTick": 1, "minHoldMinutes": 120, "idleReleaseHours": 24 }
}
```

- **`mode`** 有三个值：
  - `dry-run`：只记录本来会做什么。
  - `apply`：真的切换。
  - `off`：把切过的会话全部切回，然后停下。
- **`importance.ownerIds`** 不写时，取 `openclaw.json` 的 `commands.ownerAllowFrom`。
- 各项默认值见：
  - `lib/pacing.mjs` 的 `DEFAULT_PACING`
  - `lib/importance.mjs` 的 `DEFAULT_IMPORTANCE`
  - `lib/decide.mjs` 的 `DEFAULT_POLICY`

## 状态目录

| 文件 | 内容 |
|---|---|
| `state.json` | 账本（它切过哪些会话、切到哪一档、什么时候切的）、额度采样、Claude 读数缓存。缓存只保留用到的窗口字段，不存令牌 |
| `events.jsonl` | 每次有动作或 dry-run 计划时写一行：配速读数、动作、候选及打分理由。超过 5 MB 时轮转 |
| `PAUSE` | 文件存在时，tick 什么都不做 |
| `LOCK` | 防止两个 tick 同时跑。超过 15 分钟视为残留 |

## 安装（V，需 Tianyi 批准；先装成 dry-run）

```bash
sudo install -d -o openclaw -g openclaw -m 700 /home/openclaw/.openclaw/v-quota-router
sudo install -d /opt/v-quota-router && sudo cp -r quota-router.mjs lib /opt/v-quota-router/
sudo cp systemd/v-quota-router.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now v-quota-router.timer
```

## 止血

最快的两种做法：

- `touch /home/openclaw/.openclaw/v-quota-router/PAUSE`：停止一切动作。
- 以 openclaw 用户运行 `node /opt/v-quota-router/quota-router.mjs release-all`：切回所有会话。

单个会话也可以在聊天里打 `/vds` 切回，控制器会自动放手。

## 测试

- 单元测试：`node --test apps/v-quota-router/tests/quota-router.test.mjs`
- VLab candidate（真实 9.1 Gateway，不跑模型回合）：

  ```bash
  node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner <id> --plan "$PWD/lab/quota-router.plan.json"
  ```

  另有 `lab/quota-router-effective.plan.json`，在 `modelSelectionScope` 不设置（即 effective）时再跑一遍。
