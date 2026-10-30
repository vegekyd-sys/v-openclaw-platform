# 黑盒功能契约（升级 C2）

证明 fork 构建的行为和 V 一样。只通过 Gateway RPC、HTTP 和假的上下游观察结果，不读 dist 文件，也不碰 V 和共享 VLab。

## 四份产物

```bash
node lab/contracts/make-targets.mjs --out <dir> \
  --stock <发布版 dist 所在目录> --modules <带 node_modules 的 fork worktree> \
  --fork <fork worktree> --capture release/captured/<发版名> \
  --feishu <官方飞书包> --codex <官方 Codex 包>
```

| 产物 | 内容 | 用途 |
|---|---|---|
| `stock` | 发布版 9.1 加官方飞书、Codex 包 | 反向对照 |
| `v` | `stock` 叠加 V 捕获的 core、飞书、Codex 文件 | 基线 |
| `fork` | `pnpm build` 原样输出 | 只用来看打包差异，不能发布 |
| `fork-c5` | 发布文件集（`files` 过滤）、官方 Control UI、RTC 叠加，也就是 C5 要发布的形态 | 被验证对象 |

飞书和 Codex 在 V 上是单独安装的包。这里放进内置插件目录，因为渠道入站只对受信插件开放；字节和 V 相同，只是位置不同。

## 运行

```bash
node lab/contracts/run.mjs --targets <dir> [--only <子串>] [--on stock,v,fork-c5] [--out result.json]
```

每条契约在每份产物上单独启动一个 Gateway：私有端口、空状态目录、假模型，需要时加假飞书。

| 类型 | 成立的条件 |
|---|---|
| 反向对照（默认） | `v` 和 `fork-c5` 通过，`stock` 因断言失败。工具层面的报错不算反向对照成立 |
| 对照型（`parity: true`） | `v` 和 `fork-c5` 返回的值完全相同（已去掉路径、时间、ID） |

## 写契约时要注意

- 飞书回合会在工具结果后面追加运行时上下文，判断工具结果用 `lastToolResult`，不要看最后一条消息。
- 只读工具的回合可以安全重放，故障路径走不到；要测失败恢复，得用有副作用的工具。
- `stock` 在回合结束后可能多发一次 bootstrap 请求，看模型请求时不要只看最后一条。
- V 的记忆索引由单独进程建，Gateway 不自己建；测检索先跑 `gw.cli(["memory", "index", "--force"])`。
- 配置名为 `deepseek` 的 provider 会触发从 npm 安装插件，测试里换个名字。
- 反向对照失败的原因要看一眼：`stock` 必须是因为缺这个行为而失败，不能是因为别的。

## 这套契约证明不了什么

- 假模型和假飞书只证明 Gateway 这一侧的行为，真实飞书的展示、真实 provider 的响应不在内。
- 性能和并发不在这里，放在 C3 的同口径 A/B。
- 在 Mac 上跑，不是 V 的 Linux、不是 V 的库规模，也没有 Worker。
