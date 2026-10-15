# V 重启提速（restart-speed）

2026-10-13 起。目标（Tianyi）：V 重启到能用压到 30 秒以内，不能折损效果。

## V 现在一次重启花在哪（10/05–10/12，29 次，journald）

以 systemd `Starting` 为 0 点，10/10 之后的典型值：

| 阶段 | 耗时 |
|---|---|
| 停旧进程 + 4 个 ExecStartPre | ≈2 s |
| **db91 完整性预检**（8 个 agent 库串行全量 integrity+FK，makaron 16 GB、v-codex 6.5 GB） | **110–112 s**（10/11 一次 196 s） |
| 预检结束 → `loading configuration` | 12–20 s |
| → `http server listening` | 13–30 s |
| → 飞书 WebSocket 连上 | 5–7 s（约第 148 s） |
| → 首批 5 个 worker 就绪、`[gateway] ready` | **41–50 s**（约第 199 s） |

## 四个原因和改法

1. **预检每次重启都把 22 GB 读一遍。** 同一个 Gateway 生命周期里，一次全量检查本来就被所有进程复用 26 小时
   （`db91-integrity-gate.mjs`）。新增 `db91-restart-carry.mjs`：只有满足下面全部条件，上一个生命周期的检查结果才带进
   新的生命周期，否则照旧全量检查后才接活：
   - 同一次开机（`/proc/sys/kernel/random/boot_id` 相同，宿主机没崩溃、没重启）；
   - 上一个 Gateway 正常退出（退出码 0 时写 `clean-exit.json`；崩溃、SIGKILL、OOM 都不会写）；
   - 收据按上一个生命周期自己的规则此刻仍然有效：格式、epoch、撤销栅栏相同，`checkedAt` 在 26 小时内（不刷新）；
   - 文件身份不变：路径、设备、inode、创建时间、属主、user_version、schema cookie、schema 哈希，且没有无法解释的缩小。

   原生的后台校验器（启动后 5 分钟一次，之后每天一次）照常对每个库全量检查并刷新收据。开关
   默认开启（DB91 门开着就生效），`OPENCLAW_DB91_RESTART_CARRY=0` 关闭；代码发布即可生效，不用改 unit。

2. **V 上的后台校验器从 10/05 起每次都失败。** 它要把子进程放进 unit 委派的 cgroup（`94-verifier-resource-group`），
   但基础 unit 的 `ProtectControlGroups=yes` 让 cgroup 树只读，每次报
   `EROFS ... cgroup.subtree_control`，所以 V 实际只在启动时检查一次库。同一个 drop-in 设 `ProtectControlGroups=no`
   （共享 VLab 一直是 `no`，服务用户只能写自己被委派的子树）。改完以后检查次数比现在多：每次启动后 5 分钟 + 每天，
   而且是在限内存的 cgroup 里读，不挤占 Gateway 的页缓存。

3. **worker 预热和 Gateway 互相等 30 秒。** 10/07 r3（#254）让 worker 在报告就绪前激活 secrets 快照；V 的配置里有
   agent 运行时 SecretRef（`skills.entries.*.apiKey`、`plugins.entries.google.config.webSearch.apiKey`），这一步会调
   Gateway 的 `secrets.resolve`。Gateway 启动时要等 worker 池这个服务起来才应答，而 worker 池要等 5 个 worker 都就绪：
   调用等满 30 秒超时，再退回本地解析。共享 VLab 的配置里没有这类 SecretRef，所以 VLab 从来没出现过。
   改法：这一步照样在预热时开始，但就绪不再等它（`agent-command-DPfawBbr.js`）；Gateway 应答后（或照旧本地解析后）
   同一份快照在内存里激活。在它完成前到来的回合会自己建快照，#254 之前每个首轮都是这样。
   `OPENCLAW_WORKER_EAGER_PREPARE_SECRETS=await` 恢复原来的阻塞写法。

4. **worker 进程没用上 Gateway 已有的两个启动加速。**
   - Gateway 的 `dist/index.js` 安装了 OpenClaw 自带的 dist 内部相对 import 快速解析（`entry.esm-resolve-fast-path`），
     worker 从 `production-worker/worker.mjs` 起步、从没装过：每次 import 都走 Node 默认解析，反复解析 openclaw
     `package.json` 的 300 多项 exports，VLab 上每个 worker 启动多花约 10 s CPU。worker 现在装同一条规则
     （`dist-esm-resolve-fast-path.mjs`）。
   - Node 编译缓存只有 CLI 入口（`dist/entry.js`）开了，Gateway（unit 用 `dist/index.js`）和 worker 都没开。现在两者在
     CLI 同一个目录开启（`<tmp>/node-compile-cache/openclaw/<版本>/<package.json mtime-size>`），按源码内容和 V8 版本/参数
     做键，文件变了就重新编译。

## VLab 验证（candidate，私有 Gateway，V 的启动参数和 db91 环境、5 个 worker、无渠道）

同一台 VLab、同一份配置（加了 V 那类 SecretRef），每组先热身启动一次，再连续重启 3 次；单位秒，以 Gateway 进程
启动为 0 点。私有库是 makaron 的会话元数据（4165 个会话，433 MB），所以这里的预检本来就只要 1–3 s；V 上的 110 s
不在这张表里。

| | 改动前（candidate-5963c405） | 全部改动（candidate-abf1f68f） |
|---|---|---|
| 预检 | 0.8–3.1 | 0.007–0.018（1/1 带过） |
| HTTP 开始监听 | 9.6–24.4 | 7.7–8.5 |
| 首个 worker 就绪（能处理消息） | 79.6 / 90.9 / 93.5 | 32.0 / 35.4 / 28.9 |
| `[gateway] ready` | 82.2 / 93.2 / 95.2 | 33.4 / 36.9 / 30.4 |
| worker 预热（每个） | 49–55 | 13–19 |
| 停止 | 0.25 | 0.25 |
| 重启后真实回合（exec 拿随机 UUID 再原样回复，worker 执行） | 6.2 s，通过 | 8.6 s，通过 |

改动前那组跑的时候 VLab 负载更高（HTTP 监听有两次到 21–24 s）；VLab 平时还有一个 Chrome 常驻吃掉约 1.2 核，
同一配置的数字前后会差 5 s 左右。

安全性（candidate-16b5795a，`SAFETY=1`）：
- 干净重启：1/1 带过，`source=carried-clean-restart`，`checkedAt` 保持原值。
- SIGKILL 掉 Gateway 和 worker 再启动：0/1 带过（`previous-exit-not-clean`），启动前全量检查。
- 再干净重启后约 5 分钟：原生校验器输出 `database integrity verification passed`（状态库 + agent 库），
  收据换成 `source=native-verifier-child`、年龄 0。
- 单元测试 `node --test lab/restart-speed.test.mjs`（9 项）：崩溃、非 0 退出、换过开机、撤销、过期、文件被替换、
  schema 变化都不带过；全局撤销之后又重新做过全量检查的可以带过（与生命周期内规则一致）；快路径只处理 dist 内相对
  `.js` 且结果与 Node 一致；发布文件与补丁逐字节一致。

## 没覆盖到的 / 上 V 前要知道的

- VLab 是 4 核，后台常驻一个 Chrome 吃掉约 1.2 核；5 个 worker 同时预热抢 CPU。V 是 8 核。
- 页缓存：V 上预检读 22 GB 会把上一个生命周期热的页缓存挤掉，之后 import 和 worker 读库都变慢（V 的
  「预检结束 → listening」要 25–45 s，VLab 私有 Gateway 只要 7–9 s）。不再读这 22 GB 以后，这部分预计会接近 VLab，
  但只能在 V 上实测确认。
- 上 V 时必须同时装 `restart-speed.conf`（`ProtectControlGroups=no`）：沿用检查结果默认开启，它依赖后台校验器每次启动后和每天做全量检查；V 上校验器不修好，就只剩「26 小时没全量检查过就回到启动前全量检查」这一道兜底。
- 部署本身那次重启没有上一个生命周期的记录，仍会全量预检一次；从下一次重启开始生效。
- 重启时如果有群正在跑一轮，可能卡在 `restart recovery claim changed`（见 memory `v-restart-recovery-wedge`），
  这是另一个问题，不在本次范围。

## 上线 V（2026-10-13）

08:20 装到 V（`promote-to-v.mjs`，parity ALIGNED），同时装 `restart-speed.conf`。经 `v-self-restart` 重启两次：

| 秒 | 上线前典型 | 08:26 首次（无记录，全量） | 08:30 计时 |
|---|---|---|---|
| db91 预检 | 110–112 | 129 | 0.03 |
| 飞书连上 | ≈148 | 171 | 31.3 |
| 首个 worker 就绪 | ≈193 | 180 | 36.6 |
| `[gateway] ready` | ≈199 | 187 | 43.4 |

08:43:52 原生校验器 9 项通过（V 上自 10/05 以来第一次）。exec 回合转录核对通过。

还没到 30 s 的两段，下一步再查：
- 预检之后到飞书连上约 29 s（import + 33 个插件 + 渠道），VLab 共享实例同一段约 22 s。
- 重启后第一条消息：08:31:11 收到、14.7 s 交给 worker，到 32.7 s 才开始准备 prompt（约 18 s），第二条起正常。疑似首轮在
  Gateway 尚未 ready 时走 `secrets.resolve` 或会话恢复，未证实。

## 第二轮（2026-10-14）：重启后第一条消息

V 上重启后第一条消息进 worker 后要等 8–18 s 才开始准备 prompt。原因：worker 每一轮都通过 Gateway 的 `secrets.resolve`
解析 agent 运行时 SecretRef（V 有，共享 VLab 没有），超时 30 s；Gateway 要等 worker 池起来才应答。改为只在 worker 进程里
最多等 3 s（`OPENCLAW_WORKER_SECRETS_RESOLVE_TIMEOUT_MS`），超时走 OpenClaw 已有的本地解析（worker 与 Gateway 同一套环境
变量和密钥文件）。Gateway 和 CLI 仍是 30 s。

candidate（配置加上 V 那类 SecretRef，worker 进程里在 Gateway 启动期间和就绪后各解析一次）：

| | 改动前 candidate-3136aa98 | 改动后 candidate-46d299bd |
|---|---|---|
| Gateway 启动期间解析 | 18.2 s（等到 Gateway ready） | 3.2 s 后本地解析 |
| 就绪后解析 | 171 ms，经 Gateway | 180 ms，经 Gateway，未回退 |
| 解析出的值等于环境变量 | 是 | 是 |
| 真实 exec 回合 | 通过 | 通过 |

启动 profile（共享 VLab，`lab/profile/startup-cpu-profile.mjs`）和 `OPENCLAW_GATEWAY_STARTUP_TRACE=1` 显示的其余可压段
（启动维护、就绪后主线程任务、Control UI 资源校验、worker 池启动时机）在 VLab 与 V 差别大，等 V 上的启动 trace 再定。

### 上 V（2026-10-14 16:33，与 #360 worker 一半合并为 restart-speed-2-reconcile-20261014）

见 CHANGELOG 同名一节。第一条消息的等待从 8–18 s 降到 4.4 s。这次还看到两件事，作为下一轮的依据：

- `cli.main.gateway-run-bootstrap` 18.6 s：启动迁移/修复只在配置或构建指纹变化后重跑，待同配置重启确认。
- 就绪后主线程卡 15–33 s（历次都有）：钉钉 socket 超时重连、本机 ws 握手超时、第一条回复卡片被压住，是现在「重启 → 第一条
  回复」最大的一段。

工具：`lab/restart-speed-accept.mjs --target v --self-restart true --requested-by "<谁、在哪、何时说的>"`；校验器等待默认 40 分钟。
