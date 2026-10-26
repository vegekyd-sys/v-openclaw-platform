# release 包（WP12）工作记录

> 2026-10-20 20:30 CST 起 · 分支 `isc/release`（worktree `.claude/worktrees/isc-release`，基于 `claude/cross-session-task-coordination-f7789a` @a1860fd4）
> 范围：设计 §11 WP12 + §13.1 回滚。本包按分工**不跑 candidate**；没有往任何聊天发消息，没有写 V 或共享 VLab，ssh 只做只读核对。

## 交付

| 项 | 文件 |
|---|---|
| 组件 `session-relay` | `scripts/lib/runtime-components.mjs`（+ 测试） |
| promote-to-v 接入 | `scripts/promote-to-v.mjs`（+ 测试） |
| 共享 VLab 发版工具 | `lab/shared/files.mjs`（+ 测试） |
| 配置脚本 | `scripts/configure-v-session-relay.mjs` plan / apply / revert（+ `scripts/configure-v-session-relay.test.mjs`） |
| 发版 plan | `lab/inter-session.plan.json`，生成器 `lab/build-inter-session-plan.mjs`，测试 `tests/inter-session-plan.test.mjs` |
| 文档 | `docs/inter-session/README.md`（用户说明）、`docs/inter-session/pr-body.md`（PR 草稿，e2e 结果留空） |

## 只读核对（2026-10-20 20:30–21:06 CST，`ssh v` / `ssh vlab91`，只读、不打印配置值）

| 对象 | 结果 |
|---|---|
| V 主配置 `plugins` 的结构（只打印 id 与路径） | 有 `plugins.allow`（76 项），不含 `v-session-relay`；`entries` 和 `load.paths` 都没有它（21:06 复核） |
| V 的 Gateway 环境、扩展目录 | 没有 `OPENCLAW_STATE_DIR`（状态目录是 `/home/openclaw/.openclaw`）；`extensions/` 归 openclaw、0755，里面有 wecom 等 6 个插件，**是自动扫描目录**；`/var/backups/v-config` 已存在 |
| 共享 VLab 的生效配置 | `OPENCLAW_CONFIG_PATH=…/state/shared-vlab-20260909-v3/openclaw.json`（不是 `state/openclaw.json`）；`plugins.allow` 75 项、不含本插件；`runtime/extensions/` 为 0700 lab-db91-parity，不在自动扫描范围 |
| vlab91 上的共享发版工具 | `tool/files.mjs`、`server.mjs`、`lifecycle.mjs` 与仓库 HEAD 逐字节相同（`files.mjs` = `abaea339…`），即下面缺陷 1 的旧版 |
| V（21:06） | 仍没有 `extensions/v-session-relay/`；`/opt/v-sentinel`、`/opt/node-v22.23.1/bin/node` 存在（README 的上线命令用到） |

9.1 源码（`~/openclaw-versa` tag `v2026.9.1`）核实：
- `plugins.allow` 非空时，不在里面的插件一律 `not in allowlist` 停用（`config-activation-shared.ts:217`）；`entries.<id>.enabled:false` 优先于一切（`:181`）。所以插件文件先装到 V 的自动扫描目录也不会加载。
- `plugins.entries` / `plugins.allow` 里的未知 id 只是警告，`{enabled:false}` 条目连警告都没有（`validation-plugin-config.ts:281-298`）；`load.paths` 指向不存在的目录是错误（`discovery.ts:1149` + `validation.ts:269`），这就是先 revert、后删目录的原因。
- 同一路径既在 `load.paths` 又在自动扫描目录时，按入口文件去重，先到的配置路径生效，不报重复（`discovery.ts:765`）。
- 插件只要不用受信任运行时的 API（state store、ingress queue）就不需要 `trustedOfficialInstall`；本插件不用（`loader-UHuBXZwI.js:4629`）。

## 找到并修复的缺陷

每一条的回归测试都先在修复前的代码上跑过，确认失败。

1. **共享 VLab deploy 不能建新目录**（`lab/shared/files.mjs`）。`installFiles` 对每个文件先 `stat` 父目录；这个 plan 的 19 个插件文件都在 `extensions/v-session-relay/` 下，旧代码 deploy 时 ENOENT，回滚后留下要人工处理的 `pending.json`。stage 阶段查不出来（新文件的 before 为空，照样通过）。修复：按最近的已有上级目录建缺失目录（权限、root 时属主一致）；rollback 删掉变空的目录，但不删顶层目录。测试：`lab/shared/files.test.mjs` 新用例；旧代码报 `ENOENT … stat '…/extensions/v-session-relay'`。vlab91 上的工具副本需要另外更新（README 上线第 1 步）。
2. **加组件后每次 promote 都会在捕获一步失败**（`scripts/lib/runtime-components.mjs`、`scripts/promote-to-v.mjs`）。`captureRuns` 会对 V 上还不存在的 `extensions/v-session-relay` 跑 `capture-production-runtime.mjs`，`cd` 失败。修复：组件标 `absentOk`，`presentCaptureRuns` 跳过 V 上没有目录的可选组件。测试：`runtime-components.test.mjs`「a promotion before the session relay release skips its capture」。
3. **parity 会因缺失目录崩溃**（`parityPairs`）。运行时组件的目录 `hashTree` 用 `cd` 进去，不存在就抛错。修复：`absentOk` 组件的 pair 标 `optional`（缺失 = 空树，仍然 blocking：只在一边存在就是漂移）。测试：「session relay parity: absent on both hosts is aligned …」。
4. **promote-to-v 的 undo 在 V 的自动扫描目录里留下空插件目录**。修复：install 把新建的目录（root 0755）记进 undo.json，undo 删掉变空的目录，有别的文件就保留。测试：`promote-to-v.test.mjs` 两个新用例；旧代码上第一个失败。
5. **流程缺口：共享 VLab 的配置哈希**（未改服务器代码，留给 Tianyi 决定）。`server.mjs` 在 stage 时记 `configSha`，deploy、accept、rollback 都核对；激活插件必须改配置，之后 accept 和 rollback 都会被拒。配置脚本因此有 `revert --undo`（按字节还原 apply 之前的文件，配置变过就拒绝），README 和 PR 草稿写了两种顺序，推荐「先 accept 再激活」。

## 验证（离线）

| 命令 | 结果 |
|---|---|
| `node --test scripts/configure-v-session-relay.test.mjs` | 11/11 |
| `node --test tests/inter-session-plan.test.mjs` | 9/9（含用本 plan 模拟共享 VLab deploy/rollback、promote install/undo） |
| `node --test scripts/lib/runtime-components.test.mjs scripts/promote-to-v.test.mjs lab/shared/files.test.mjs` | 14/14、11/11、9/9 |
| `node platform/cli.mjs audit` | errors 0，offlineFiles 326 |
| 全量 offline（catalog 全部 2804 个测试，超时放宽到 300 s） | 2803/2804；唯一失败是 `scripts/node-async-context-frame.test.mjs` 的 execArgv 用例，本机 Node 24.1 的已知问题，与本包无关（CI 用 Node 22） |
| `bash tests/vlab-static.sh` | 通过（含 `scripts/scan-secrets.sh`） |

## 没有跑的场景

- 所有 candidate 场景（F1–F17、TR、R2、C-stock、C-fallback、S-tail）：按分工由其他 e2e 包跑，结果填进 `pr-body.md` 的表。本包用 `tests/inter-session-plan.test.mjs` 离线模拟了 plan 在两个安装器上的行为，没有在真实 Gateway 上验证插件加载。
- `configure-v-session-relay.mjs` 没有在 V、共享 VLab 或 candidate 上执行过，`openclaw config validate` 对它写出的配置没有实跑；只在离线测试里对 V 形状的配置验证了改动范围。第一次真实执行应在共享 VLab 激活时（README 上线第 3 步），先跑 `plan` 看 diff。

## 剩余风险

- 插件目录在 V 上处于自动扫描目录：只要 V 还有 `plugins.allow`，promote 之后、apply 之前它不会加载。有人删掉整个 allowlist 的话，下次重启它会以默认配置自己加载。
- 共享 VLab 的配置哈希问题需要 Tianyi 选顺序；vlab91 的 `files.mjs` 需要授权替换，否则 deploy 失败。
- promote-to-v 装新文件时目录与文件归 root（0755 / 0644）。9.1 的插件属主检查允许 root，与 V 上其他扩展归 openclaw 不同，但不影响加载。
- `revert --undo` 依赖 undo 文件里保存的整份原配置（root 0600、`/var/backups/v-config/`，不进 git）。
