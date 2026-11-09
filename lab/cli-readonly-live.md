# CLI 读设备身份不再整库复制状态库（cli-readonly-live）

状态：候选验证完成，**未合入、未上线**，等 Tianyi 批准。

## 现象

V 上 `openclaw status` 每次 31–60 s、写 5.9 GB；`nodes list` / `nodes status` 9–41 s、写 5.3 GB（2026-11-09 实测）。对应的 Gateway RPC 本身很快。

## 根因

CLI 连 Gateway 前要读本机设备身份和设备令牌。这两处读状态库走的是「保留旁文件」的只读入口 `withExistingOpenClawStateDatabaseArtifactPreservingReadOnly`（`openclaw-state-db-readonly-C7txILW9.js`）：

1. 只要本进程没开写句柄，它就调 `prepareSqliteReadOnlyLocationSyncInProcess`，在 `~/.cache/openclaw/openclaw-sqlite-readonly-<pid>-*/` 里**按字节复制整个状态库**：先复制 WAL，再复制主库（V 上 593 MB），再复制一遍 WAL，两份 WAL 不一致就判定「复制期间被改了」。
2. V 的 Gateway 一直在往 WAL 追加，复制一份 593 MB 要好几秒，期间 WAL 几乎必然变化。于是删掉这个目录、**换新目录从头再来，最多 10 次**。这就是一次命令里出现约 10 个不同快照目录的原因（不是 `sqlite.backup()`，那条是异步入口，CLI 这几条命令没走）。
3. 每条命令读几次：

| 命令 | 调用方（候选 trace） | 次数 |
|---|---|---|
| `nodes list` / `nodes status` | `readStoredDeviceIdentityReadOnly` ← `resolveDeviceIdentityForGatewayCall`；`loadDeviceAuthTokenReadOnly` ← `loadStoredOperatorDeviceAuthToken` ← `callGatewayWithScopes` | 2 |
| `status` | 上面两处（经 `probeGateway`），再加 `GatewayClient.selectConnectAuth` | 3 |

4. 快照目录在进程内清理，`kill -9`、OOM、超时都会留下一整份库的副本。

上游 main 已重写这一层（每个同步作用域只取一份快照、复用镜像、Postgres 等），但仍然是复制，且依赖大量新模块，无法回移。

## 改法

源码：`vegekyd-sys/openclaw-versa` 分支 `versa/port-cli-readonly-live-20261109`（8e1a007ce88，基于 `versa/port-backlog-20261029` 远端 tip b61c13eb1a3）。dist 补丁 `lab/patch-cli-readonly-live.mjs` 按 V 字节构建（`lab/build-cli-readonly-live.mjs`），两个文件都是 npm 9.1 原样字节。

1. **活库直读**（`openclaw-state-db-readonly-C7txILW9.js`）：同时满足以下条件时，直接用只读 SQLite 连接读活库，不复制：
   - 本进程没有该库的写句柄（有写句柄时原本就复用它）；
   - 文件头是 WAL 模式，`-wal` 和 `-shm` 都已存在，三个文件都是普通文件、属主是当前 euid；
   - 没有 `-journal`。

   只读连接使用已有的 `-wal`/`-shm`，不做 checkpoint，关闭时也不删旁文件，所以旁边不会多出任何文件。上游担心的「只读打开也会创建缺失的 WAL」只在旁文件缺失时发生，这种情况仍走快照。root 跑 CLI（属主不同）也仍走快照，避免留下 root 属主的旁文件把 Gateway 锁死。同一进程里用活连接读的做法上游已在 `withOpenClawStateDatabaseReadOnly` 使用（「CLI metadata reads can overlap a live Gateway」）。
   开关：`OPENCLAW_V_LIVE_WAL_READS=0` 恢复原来的快照路径。
2. **残留回收**（`sqlite-readonly-location-BvtpsFvn.js`）：
   - 快照目录名里的 pid 改成「读者进程」：隔离 worker 子进程通过 `OPENCLAW_SQLITE_SNAPSHOT_OWNER_PID` 继承父进程 pid，所以目录名里的 pid 活着就说明还有人在用。
   - 每个进程第一次在某个 staging 根目录分配快照时，删除「属主进程已不存在、且目录超过 10 分钟没变」的 `openclaw-sqlite-readonly-<pid>-*`。10 分钟是为了防 pid 命名空间不同（沙箱里的 pid）误判。属主不是当前用户的目录不碰。

## 候选证据

VLab candidate，真实 9.1 dist 字节（runtime 中这两个文件与 V 的 sha256 相同），状态库副本撑到与 V 相当的 591 MB，命令通过只读 RPC 连共享 VLab Gateway。「有写入」= 另开一个进程每 50 ms 往同一个库写 8 KB，模拟 V 上一直在写 WAL 的 Gateway。write_bytes 来自 `/usr/bin/time` 的 `%O`（含子进程）。原始输出见 `docs/evidence/cli-readonly-live-20261109/`。

| 场景（每条 3 次） | 修复前 | 修复后 |
|---|---|---|
| 有写入，`nodes list` | 38.9–45.7 s，5.7 GB，10 次整库复制 | 0.93–1.39 s，0–9 MB，0 次复制 |
| 有写入，`nodes status` | 48.1–48.4 s，5.7 GB，10 次 | 0.91–0.94 s，0 MB，0 次 |
| 有写入，`status` | 48.5–50.0 s，5.8 GB，10 次 | 2.84–3.63 s，0–5 MB，0 次 |
| 无写入、无旁文件，`nodes list`（1 次） | 19.4 s，2.3 GB，2 次 | 16.1 s，2.3 GB，2 次（仍走快照，见下） |
| 无写入，`status`（1 次） | 16.1 s，1.7 GB，3 次 | 3.7 s，0 MB，0 次（`status` 自己先建了旁文件） |

- 三条命令的输出与修复前一致（`paired` 2、`nodes` 2、`status` 22 个键），退出码都是 0；状态目录里的文件列表在命令前后没有变化。
- **修复前有写入时，第一次读（设备身份）就把 10 次尝试用完而失败**，trace 里只有 1 次 `prepare…InProcess`、10 次复制，第二次读根本没发生。`resolveDeviceIdentityForGatewayCall` 会吞掉这个错误返回 `null`，所以 V 上这些命令其实是**不带设备身份**、只用共享 token 连 Gateway 的。这和 V 上「一次命令约 10 个目录、5.3–5.9 GB」完全对得上。修复后 CLI 回到设计路径，带设备身份和设备令牌连接，共享 VLab Gateway 接受。
- 167 MB 原始副本、无写入时：`nodes list` 2 次复制（身份、令牌），`status` 3 次（再加 `GatewayClient.selectConnectAuth`），见 `trace-stdout.txt`。
- 回收：`OPENCLAW_V_LIVE_WAL_READS=0` 强制走快照，`kill -9` 正在复制的 CLI，留下 `openclaw-sqlite-readonly-<它的 pid>-*`；把目录时间改成 1 小时前，下一个走快照的 CLI 把它删掉，同时留下属主已死但只有几秒的 `-young` 目录（年龄门槛生效）。
- fork 测试（Node 22.23.1）：`openclaw-state-db-readonly` 6/6、`sqlite-readonly-location` 51/51（1 skip 为原有）、设备身份/令牌/归属 62/62、`gateway-backed-exit.process`（上游 #123674 用来保证「只读 RPC 不改状态目录」的进程级测试）33/33，tsgo core 通过。platform：`node --test lab/cli-readonly-live.test.mjs` 4/4。

## 夜班服务这条路径（2026-11-09 只读核对）

- 夜班 `nightshift-workboard.service` 的基础单元写的是 7.1，但 drop-in `91-openclaw91.conf` 把 `NIGHTSHIFT_OPENCLAW_ENTRY` 覆盖成了 `/opt/openclaw-2026.9.1-v/openclaw/dist/index.js`（`systemctl show` 确认），所以实际跑的是旧 PATH 那份安装，**不是 7.1，也不是 core**。快照写进 `XDG_CACHE_HOME=/home/openclaw/.openclaw/nightshift/.cache`。
- 走 CLI 的调用：`OpenClawFeishuNotificationSender` 用 `node <entry> message send … --json` 发飞书通知，`execFile` 超时 20 s。11/09 14:38–14:41、15:17–15:22 两批通知各重试了多次，每次都失败（journal: `Night Shift notification … failed`），时间和那 7 份残留副本对得上：复制一份 593 MB 撑不过 20 s，CLI 被 SIGTERM 杀掉，目录留下。`workboard-gateway-adapter` 的 `gateway call` 只在注入 runner 时才用 CLI；常驻 RPC 客户端在夜班进程内 import 同一份安装的 `plugin-sdk/gateway-runtime.js`，每次重连时 `GatewayClient.selectConnectAuth` 也会读一次设备令牌。
- **本 PR 的发布计划只装 core 的 dist，覆盖不了夜班。** 旧安装里这两个文件的 sha256 与 core 完全相同（`07b28e22…`、`4a17b3a1…`），有两种做法，二选一：
  1. 把夜班 drop-in 的 `NIGHTSHIFT_OPENCLAW_ENTRY` 改指 core（`/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/index.js`），与 11/09 把 `/usr/local/bin/openclaw` 改指 core 的方向一致（推荐，改动属于夜班仓库 `v-nightshift` 的部署配置）；
  2. 或者把同样两个 release 文件也装进 `/opt/openclaw-2026.9.1-v/openclaw/dist/`（`before` sha 相同，可直接复用；但 promote-to-v / parity 不覆盖这份安装，属于手工改主机）。
- 已经留下的副本，修复后由下一次快照分配回收（属主已死且超过 10 分钟）；夜班走活库直读后基本不再分配快照，所以已有残留仍需一次性手工清理（11/09 已清）。

## 没覆盖的

- V 本机未跑（按要求 V 上只读）。VLab 的 churn 写入者是模拟，V 的 Gateway 写入节奏不同；修复后路径不复制，与写入节奏无关。
- `core/dist/worker/worker.mjs`（9/4 构建的压缩包）里内联了一份同样的代码，本补丁不改它。Worker 进程持有写句柄时走复用路径，是否会走到快照尚未确认，列为后续。
- root 身份跑 CLI 仍是旧路径（慢但安全）。
- 无写入者、旁文件不存在时（Gateway 停着）仍复制，但不会重试，代价有界。

## 复现

```sh
node --test lab/cli-readonly-live.test.mjs
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner cli-readonly-snapshot --plan <before|after plan>
```

候选脚本：`lab/candidate/cli-readonly-snapshot/`（`measure.sh` 撑库到 V 的大小、开 churn 写入者、跑三条命令并统计 trace、耗时与 write_bytes；`SWEEP=1` 演示 `kill -9` 残留与回收）。
