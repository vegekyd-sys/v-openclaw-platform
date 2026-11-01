# OpenClaw CLI 为什么慢（2026-11-01 12:10 CST）

V = 生产（16C/64G，Gateway db91.6）。VLab = candidate（4 核，当时 load 5–20，共享机上还有别的任务，只证明机制）。两边的数字不能互换。除非另注明，V 的数字是空闲周日上午、V 上跑的小样本。

## 结论

1. **慢的不是 Node，也不是命令本身，是每次启动都加载上千个 ESM 文件。** V 上 `node -e 0` 0.015 s，`--version` 0.03 s（n=5），一个 `cron status` 要加载 2123 个模块（n=1）。profile 里 60–70% 花在 ESM 解析、链接和编译上。
2. **普通命令还要多付一次：先加载 680 个模块，再重启自己。** 为了加 `--disable-warning=ExperimentalWarning`，父进程 respawn 一次。V 上每次多 0.30 s 墙钟、0.35 CPU 秒（4 组命令，每组 n=3）。这有现成开关。
3. **`hooks relay` 已修到 0.07 s。** V 上含 bridge POST 从 0.38 s / 0.53 CPU 秒（n=7）降到 0.07 s / 0.07–0.08 CPU 秒（n=14，/tmp 下的副本，未动线上文件）。目标是 100–150 ms，已达到。
4. **VLab 15 并发五步任务：70.3 s → 39.0 s，关钩子是 22.8 s**（同一 Gateway 交替，各 45 次，全部正确）。还差 16 s 没有消掉，见下。V 上没有做这个对照（生产不做负载）。
5. **对 V 来说，CLI 不是容量问题，是延迟问题。** 全部调用者加起来平均约 0.03–0.06 核（16 核机器）。用户感受到的是每次 1–2 s，以及 Codex 每次工具调用多等 0.38 s。

## 更正 PR #523 的数字

"V 上 relay 单次 0.67–0.74 s、0.8 CPU 秒，不含 bridge POST" 测的不是正常路径。它用了不存在的 relay id，于是多走了：100 ms 的注册重试（`registrationTimeoutMs`）、回退 `callGateway`（再加载约 680 个模块）、一次真实 WS RPC。bridge 命中的正常路径是 0.38 s / 0.53 CPU 秒。

VLab 同理：`hooks relay` 不存在的 id 1.19 s / 1.53 CPU（n=5），mock bridge 命中 1.20–1.38 s / 1.21–1.27 CPU（n=12）。VLab 差别被噪声盖住了。

## 1. 冷启动的时间花在哪

### `hooks relay`，bridge 命中（V，CPU profile n=1，500 µs 采样，总 473 ms）

| 阶段 | ms | 占比 |
|---|---:|---:|
| ESM 解析（realpath、stat、package.json `exports`） | 149 | 32% |
| ESM 加载和链接 | 119 | 25% |
| ESM 编译（V8，compile cache 已命中） | 63 | 13% |
| 模块顶层执行（其中 `ansi-*` 27 ms：`/\p{RGI_Emoji}/v` 和 `Intl.Segmenter`） | 44 | 9% |
| Node 内部 | 29 | 6% |
| native / GC | 45 | 10% |
| **relay 本身：读定位行 + POST** | **9.5** | **2%** |

加载 1191 个模块、3.5 MB：typebox 665、kysely 254、dist 155、`@openclaw/fs-safe` 87。谁拉进来的（静态图，V 上的 db91.6）：

- `native-hook-relay-cli` 里一行 `import "./method-scopes-*.js"`（只为 `ADMIN_SCOPE`，打包后留下副作用导入）：独占 713 个文件，主要是 typebox。**上游已经改成 `gateway/operator-scopes.js`。**
- `native-hook-relay-client` → `kysely-sync` / `node-sqlite` / `sqlite-user-version`：约 290 个文件，只为一条 `SELECT`。
- `entry.js` → `runtime-guard` → `redact` → `fs-safe`：约 120 个文件，发生在进入 relay 分支之前。

### 普通命令（V，`OPENCLAW_NO_RESPAWN=1` 下 profile，各 n=1）

| | `cron status` 737 ms | `gateway call health` 1028 ms | `config get` 1869 ms |
|---|---:|---:|---:|
| 模块数 | 2123 | 2262 | 1641 |
| ESM 解析 + 加载 + 编译 | 59% | 44% | 20% |
| 配置读取和校验 | ~1% | 9%（74 ms） | 60%（见下） |
| 插件发现/元数据 | 1% | 含在校验内 | 含在校验内 |
| 等 Gateway（idle） | ~1% | 13%（129 ms） | 0 |
| GC | 6% | 5% | 6% |

状态库打开：relay 的定位读取 <7 ms。`config get` 贵在两处：`validateConfigObjectWithPlugins` 628 ms（其中插件元数据快照 417 ms），`buildRuntimeConfigSchemaFromRegistry` 465 ms。

### compile cache

launcher 已默认启用，V 上命中：`NODE_DEBUG_NATIVE=COMPILE_CACHE` 显示 1174 个文件读取、1174 个 accepted（n=1）。关掉它后 relay 0.46–0.52 s（n=3），开着 0.38 s。所以它已经在起作用，再调也省不了多少。缓存目录按 uid 和 V8 flag 分开，`root`、`ubuntu` 用户调用走不到 openclaw 的目录。

## 2. 子命令差异

V（每格 n=3，`wall / CPU 秒`）：

| 命令 | 现状 | 跳过 respawn | 性质 |
|---|---:|---:|---|
| `--version` | 0.03 / 0.02 | — | launcher 快路径 |
| `hooks relay`（bridge 命中） | 0.38 / 0.53 | 不走 respawn | 启动成本占 98% |
| `cron status` | 0.97 / 1.44 | 0.68 / 1.05 | 纯启动 |
| `cron list` | 1.32 / 1.46 | 1.01 / 1.06 | 启动 + 约 0.33 s 等 Gateway |
| `gateway call health` | 1.28 / 1.69 | 0.95 / 1.30 | 启动 + 约 0.13 s RPC |
| `health --json`（`/usr/local/bin/openclaw` 旧安装） | 1.21 / 1.60 | 0.90 / 1.24 | 同上 |
| `config validate`（`dist/index.js`，哨兵用） | 1.39 / 2.10 | 不走 respawn | 启动 + 校验 |
| `config get` | 1.96–2.15 / 2.95 | 1.62 / 2.50 | **命令本身慢** |

VLab（n=5，同样格式；`sessions` 这几行在 candidate 配置下返回 `cli_error`，只代表到报错为止的启动成本）：

| 命令 | wall / CPU | 模块数 |
|---|---:|---:|
| `--help` | 6.69 / 7.9 | 6308（配置里有 plugins，launcher 不用预计算帮助） |
| `models list` | 10.27 / 12.09 | 3595 |
| `memory status` | 6.31 / 8.1 | 4292 |
| `status` | 5.88 / 6.63 | 2710 |
| `config get` | 5.62 / 6.04 | 1631 |
| `sessions`（报错路径） | 3.86 / 4.95 | 2178 |
| `cron status` | 2.35 / 2.9 | 2111 |
| `hooks relay` | 1.19 / 1.53 | 1865（不存在的 id，走了 Gateway 回退） |

`sessions`、`memory status`、`status`、`models list` 没有上 V：strace 看到它们以读写方式打开状态库，V 上 agent 库已有 33 GB。

## 3. 谁在调用（V）

追踪：`execsnoop-bpfcc`，11/1 周日 09:35–11:57（142 分钟），已排除我自己的进程。历史：makaron agent 库只读扫了 10/28–10/31 的转录（按 rowid 从新到旧，200 s 预算，**不是全量，只算下限**）。

| 调用者 | 频率 | 单次 CPU | 平均占用 | 用户感受 |
|---|---:|---:|---:|---|
| Codex 钩子 `hooks relay` | 周日 2 小时只有 5 次；工作日估 1k–5k 次/天（Codex 工具调用 800–3600/天 × 约 1–1.4） | 0.53 | 0.006–0.03 核 | **每次工具调用 +0.38 s（V）；15 并发时 VLab 每回合 +47 s** |
| 脚本里的 `gateway call`（如 workspace 的 `heartbeat-v2-feedback.py`） | 42 次/142 分钟，约 426 次/天（来源未逐一归因） | 1.69 | 0.008 核 | 脚本慢 |
| `config validate`（`v-sentinel` 每 10 分钟 2 次，另有约 100 次/天未归因） | 38 次/142 分钟，约 385 次/天 | 2.10 | 0.009 核 | 无 |
| `openclaw-gateway-memory-snapshot` 的 `health --json` | 每 5 分钟，288 次/天 | 1.60 | 0.005 核 | 无 |
| agent exec 里的 `openclaw ...`（常见 `secrets store list`、`cron`、`skills`、`--help`） | 22–202 次/天（下限，和第二行有重叠） | 1.5–3 | ≤0.007 核 | **用户看到的「V 查个东西好慢」主要在这里** |

合计约 0.03–0.06 核。追踪只见 `pre_tool_use` 5 次，样本太少，无法判断工作日 `post_tool_use` 比例，工作日频率是估算。

## 4. 官方机制

| 机制 | 现状 | V 上 |
|---|---|---|
| compile cache（launcher + `entry.compile-cache`） | 默认开 | 已开并命中；Gateway 由 db91 补丁开启 |
| `NODE_COMPILE_CACHE` | docs/vps.md 推荐 | 未设。**别加**：launcher 发现目录不同会再 respawn 一次（读代码所得，未实测） |
| `OPENCLAW_NO_RESPAWN=1` | docs/vps.md 推荐 | 未设。也影响 Gateway 重启方式，不要放进 Gateway 单元 |
| `OPENCLAW_NODE_OPTIONS_READY=1` | 内部变量，只跳过警告 respawn | 未设，**这是该用的开关** |
| `--version`、help 快路径 | 有 | 生效。`--help` 因配置含 plugins 不走 |
| `hooks relay` 快路径（`entry.js:64`、`:560`） | 有 | **生效**：不进 `run-main`、不加载 commander。不是失效路径，只是它的 import 闭包太重 |
| dist 内部 ESM 解析短路 | 9.1 有，只管 dist 内相对路径 | 生效，node_modules 不受益。上游 10/12 已删（#169543，chunk 改 `.mjs` 后不再需要） |
| 常驻 daemon | 上游没有 | — |
| 上游 relay | main 分支（最新 release v2026.10.9）已去掉 `method-scopes`，定位读取移到 worker 线程 | V 没有 |

## 5. 修复

### A. `hooks relay` 快路径（做了，强烈建议）

三处小改，补丁在 `lab/candidate/cli-startup/patch.py` 的 `relayfast`：

1. `openclaw.mjs`：launcher 检测到 `hooks relay`（非 Windows、无 `--help`、无 container）就直接跑 relay，不进 `entry.js`。
2. relay cli chunk：删掉 `method-scopes` 的副作用导入（和上游一致）。
3. client chunk：定位读取改用 `node:sqlite` 直接查，不经 kysely。

Codex 的钩子命令不变，也没有新工具。闭包从 1191 个模块降到 24 个文件（31 个模块含内建）、RSS 135 MB → 69 MB。

| | relay 单次 | 15 并发五步 p50（VLab，各 n=45） |
|---|---:|---:|
| 现状 | V 0.38 s；VLab 1.20 s | 70.3 s（p95 82.1） |
| **快路径** | **V 0.07 s；VLab 0.25 s** | **39.0 s（p95 46.4）** |
| 快路径 + 去 nice | — | 35.4 s（p95 43.8） |
| 现状 + 去 nice | — | 66.6 s（p95 84.9） |
| 关钩子（对照，同一 Gateway） | — | 22.8 s（p95 26.6） |
| 下限：只做同样工作的独立脚本 | V 0.05 s；VLab 0.11 s | — |

**策略拦截验证（VLab，真实 Gateway + Codex + `before_tool_call` 探针插件，快慢各 1 轮）：** 放行的命令执行了；带标记的命令被拦截，文件没有创建，模型回复写明被 PreToolUse 拦下。bridge 找不到时，`pre_tool_use` 回退到 Gateway 后返回 deny（fail-closed），`post_tool_use` 返回空。V 副本上和原版对照：deny 输出、POST 内容一致，stderr 都是 0 字节（n=2）。错误参数的退出码相同，文案从 `Could not start the CLI` 变成 `native hook relay failed`。

**还差的 16 s（39.0 vs 22.8）** 没有直接测量。推断是 relay 进程在饱和的 4 核机上排队：五步任务每回合约 5–7 次 relay，满负载下单次约 0.8–4 s（下面 nice 表）。CPU 账能对上（reaped 子进程 CPU：现状约 100 s、快路径约 28 s、关钩子 0）。这个差距在 V 上应小很多，但未验证。

**风险：** 补丁绑定 chunk 哈希名，换版要重做（文件名不匹配时 `patch.py` 直接断言失败）。launcher 跳过了 `entry.js` 的 `normalizeEnv`、profile、runtime guard。launcher 自己校验 Node 版本，relay 命令也不带 profile；Gateway 回退路径已实测，但 `normalizeEnv` 影响的环境变量未逐一核对。上 V 走 `promote-to-v.mjs`，relay 每次新起进程，**无需重启 Gateway**，drift 哨兵要同步更新。

### B. 其他命令跳过 respawn（V 已实测，建议）

`OPENCLAW_NODE_OPTIONS_READY=1` 对 `cron status` 从 0.97 降到 0.68 s，`health` 从 1.21 降到 0.90 s，所有非 relay 命令省 0.30 s / 0.35 CPU 秒。`config get` 和 `cron status` 的 stderr 完全相同（都是 0 字节，n=1），`cron status` 的 JSON 键相同。

做法二选一：在 `openclaw.mjs` 开头设默认值（两份安装都要改，不用重启）；或写进 Gateway 单元的环境（覆盖 exec 和 Codex，但要重启，cron 和 ssh 不覆盖）。建议前者。风险低：`warning-filter` 在 `entry.js` 里已安装；launcher 里那段 `./dist/warning-filter.js` 在这个版本找不到文件，是无效代码。

### C. 把 ESM 解析短路扩到 node_modules（VLab 实测，留给升级解决）

VLab CPU（n=12）：`cron status` 2.50 → 1.92，relay 1.17 → 0.82，`config get` 基本不变。还会加快 Gateway 和 worker 启动，因此要做全量回归。上游走的是 `.mjs` 方向，升级后自然解决，9.1 上不建议单独做。

### D. 打包 typebox 和 kysely（VLab 实测，不建议）

919 个文件 → 15 个。VLab CPU：`cron status` 1.92 → 1.80，`sessions` 3.84 → 3.36。A 做完后 relay 已不依赖它们。其余命令收益小，还要改 `package.json` 的 `exports`，插件走未打包子路径时可能出现双实例。

### E. 小修

- `ansi-*` 的 Segmenter 和 emoji 正则改懒加载：V profile 每进程 25–27 ms。A 之后对 relay 无效，其他命令占 2–3%。随手修即可。
- 哨兵 `config validate`：配置文件 mtime 没变就跳过，约省 0.007 核。价值低，不急。
- `nice`：见下。

## nice 的影响

VLab，8 个 nice 0 空转进程占满 4 核，n=15：

| | nice 10 | nice 0 | CPU |
|---|---:|---:|---:|
| 现状 relay | 20.3 s | 4.7 s | 1.4 s |
| 快路径 relay | 3.96 s | 0.81 s | 0.2 s |

排队占存活时间的 93%（20.3 s 里 CPU 只有 1.4 s）。这是极端饱和的情形。真实 15 并发里去 nice 只省 3.6–3.7 s（70.3 → 66.6，39.0 → 35.4），而且落在轮次波动范围内（快路径各轮 41.2/34.2/37.8，去 nice 各轮 36.5/35.0/31.8）。V 空闲时无差别（0.68 vs 0.67 s，n=3 / n=5）。

判断：A 上了之后 relay 只占 0.07 CPU 秒，nice 已经没有保护价值，可以去掉，但这是 Codex 插件 dist 的改动，优先级低于 A、B。

## 这次对生产做过什么

全部只读，无重启、无配置改动：

- eBPF exec 追踪 142 分钟 + 7 分钟，日志已删。
- 约 20 次走不存在 relay id 的 `hooks relay`：都发出了真实 `nativeHook.invoke` RPC（返回 not found），这是开始时没想到的副作用。
- 约 50 次只读 RPC（`health`、`cron status`、`cron list`），低频分散执行。
- agent 库 `mode=ro` + ionice 扫描约 200 s。
- `/tmp/cli-slow` 已删。**未清理**：我的运行往 `/tmp/node-compile-cache/openclaw/` 写了少量缓存条目，无害，也是所有 CLI 调用都会写的地方。

VLab：我的 2 份基线（各 1.7 GB）已删，磁盘回到 82%。

## 未覆盖

- V 上真实负载下的对照（规则不允许）。
- 工作日 relay 真实频率（周日样本 5 次）。
- candidate 的 runtime 是当时共享 VLab 的 release（`codex-failed-thread-resume-20261101-v1`），不是 V 的 db91.6；Codex 插件已替换成 V 的字节，改动涉及的 chunk 哈希名和 V 相同，补丁断言通过。
- `gateway call` 和 `config validate` 的部分来源未归因。

## 复现

`lab/candidate/cli-startup/`：`matrix.sh`（子命令矩阵）、`variants.sh`（修复变体）、`relay-ab.sh`（nice 微测 + 15 并发 A/B）、`patch.py`（补丁）。`vendor/`（`bundle.mjs` 生成）和 `v-codex-dist.tgz`（V 的 Codex dist）不进仓库，要先生成。

数据：`relay-ab-progress.jsonl`（A/B 原始）、`relay-micro-stdout.txt`、`vlab-matrix-stdout.txt`、`vlab-variants-stdout.txt`。
