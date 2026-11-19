# 发布产物：spawn broker + Workboard 覆盖索引（2026-11-19）

两处 Gateway 主线程修复的上线产物，按 V 当前线上字节重建。归因、A/B 结果见 `docs/experiments/concurrency-40-sessions-20261118.md`。
interactive-priority 补丁这次不上，不在产物里。

## 文件

| 目标（`<release>/core/dist/`） | V 现版 sha256 | 新版 sha256 | 源码 |
|---|---|---|---|
| `supervisor-BuLJGQyc.js` | `3dcf2b54a8baaa337cbf96989e0ac4106bc010c96482cbf0c4c4f6265f7fdd11`（npm 2026.9.1 原版） | `3fca1a79be535e4558f56f9d3e2efc364b62f405a07d2e1a19da8661b9d943e5` | `versa:4b3ec9b69c8` |
| `sqlite-store-CH-caj1l.js` | `d06ee044d85a76f19c5fa034b019f934735027afab56934d9d2c9aa5c2633c34`（= `lab/release-files/workboard-sweep-bounded/`） | `9ff2826f52d522b5122e1542a3adb3b306d20bc13d673d4988050d5bef1e4168` | `versa:5fed775dabf` |
| `v-spawn-broker.mjs`（新文件） | — | `4d365d79b8b526dfd388cf49b10e05a8b56bc6eacc6f606adcfb91b4d90e3a21` | `versa:4b3ec9b69c8` |

- 生成方式：`node lab/build-spawn-broker-workboard-index.mjs <V dist 原件目录>`。V 现版是 2026-11-19 从 `/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist` 只读拷出来的。脚本会先核对原件的 sha256，再应用 `lab/patch-spawn-broker.mjs` 和 `lab/patch-workboard-hotpath-index.mjs`，最后写出 `lab/spawn-broker-workboard-index.plan.json`。
- 与 V 现版的 diff 只有两处：
  - supervisor 多了一行 `import { spawnViaBroker } from "./v-spawn-broker.mjs"`，relay 的 `spawn(...)` 改成 `(useWindowsJobAnchor ? null : await spawnViaBroker(...)) ?? spawn(...原样...)`；
  - sqlite-store 在 `ensureWorkboardSchema` 的列迁移之后多了一条 `db.exec("CREATE INDEX IF NOT EXISTS ...; CREATE INDEX IF NOT EXISTS ...")`。

  `lab/spawn-broker-workboard-index.test.mjs` 会核对这一点：把补丁文本退回去，得到的就是 V 现版的 sha。
- 源码在 vegekyd-sys/openclaw-versa#1（分支 `versa/spawn-broker-workboard-index`，未合入 versa/main）。

## v-spawn-broker 在 V 上的运行方式

- **装在哪**：`<release>/core/dist/v-spawn-broker.mjs`，和 supervisor chunk 放在同一目录（supervisor 用 `./v-spawn-broker.mjs` 引用它）。不需要单独的 unit。
- **谁拉起**：Gateway 自己。第一次 exec 走 relay 时，Gateway 用同一个 node fork 一次 `node <dist>/v-spawn-broker.mjs --v-spawn-broker`（带 IPC），之后一直常驻。日志里会出现 `[v-spawn-broker.1] {"event":"start",...}`；它丢失时记 `{"event":"lost",...}`，下一次 exec 会自动重启它。broker 的 stdout/stderr 继承 Gateway 的，所以在 Gateway 的 journal 里能看到。
- **生命周期**：broker 是 Gateway 的子进程，在同一个 cgroup 里，内存计入 Gateway 的 MemoryHigh/MemoryMax，约 40 MB RSS。Gateway 的 IPC 一断它就 `exit(0)`，relay 随即看到父进程消失，走原来的 parent-loss 清理，和以前 Gateway 退出时的行为一样。V 的 unit 是 `KillMode=mixed`：stop 时 SIGTERM 发给 Gateway，最后 SIGKILL 整个 cgroup，broker 也在其中。**不需要改 systemd。**
- **worker 进程**：vlab-worker 也从 `core/dist` 加载 supervisor。如果某个 worker 自己跑 exec，它会在第一次 exec 时起一个自己的 broker（每个约 40 MB），这些 broker 跟随 worker 的 IPC 退出。
- **超时行为（按 #625 验收意见改过）**：
  - 单次 spawn 5 s 没回应，只让这一次回退到直接 spawn，**不杀 broker**。broker 迟到起出来的那个 relay 还没收到 start 消息，会被立即杀掉。
  - 连续 3 次超时后，后续都直接 spawn；等到没有任何代起的 relay 依赖它时，才替换 broker。
  - 只有 broker 自己退出或 IPC 断开，才会连带它代起的 relay（这时 relay 被报告为 SIGKILL）。
- **什么情况不走 broker**：
  - 带 secret input 的 exec（stdio 里是数字 fd）；
  - Windows；
  - detached；
  - `OPENCLAW_V_SPAWN_BROKER=0`。

  这些情况都按原样直接 spawn。

## 关掉的开关

`OPENCLAW_V_SPAWN_BROKER=0` 在每次 spawn 时从 Gateway 的 `process.env` 读取，Gateway 运行中改不了它的环境，所以要通过 drop-in 设置再重启：

```
# /etc/systemd/system/openclaw-gateway.service.d/96-spawn-broker-off.conf
[Service]
Environment=OPENCLAW_V_SPAWN_BROKER=0
```

然后 `systemctl daemon-reload` 并重启 Gateway（走 `scripts/v-self-restart` / promote 流程）。关掉后，已经起来的 broker 不会再收到新任务，Gateway 下次重启时它就消失了。这是不回滚字节、只关 broker 的轻量开关；Workboard 索引不受影响。

## 回滚

1. 把三个文件恢复为 V 现版：
   - `supervisor-BuLJGQyc.js` → `3dcf2b54…`（npm 原版，或本次 promote 前的备份）；
   - `sqlite-store-CH-caj1l.js` → `d06ee044…`（`lab/release-files/workboard-sweep-bounded/sqlite-store-CH-caj1l.js`）；
   - 删除 `v-spawn-broker.mjs`（留着也无害，没人引用）。

   按发布流程用 `promote-to-v` 的回滚完成。
2. 重启 Gateway。
3. 两个索引会留在 `workboard.sqlite` 里。旧代码不认识它们，但也不受影响：SQLite 只多维护两个索引，查询结果不变。如需删除，在 Gateway 停着时执行 `DROP INDEX IF EXISTS workboard_cards_board_agg_idx; DROP INDEX IF EXISTS workboard_cards_lifecycle_link_idx;`。不删也可以。

## 验证（本地）

- `node --test lab/spawn-broker/v-spawn-broker.test.mjs lab/patch-spawn-broker.test.mjs lab/patch-workboard-hotpath-index.test.mjs lab/spawn-broker-workboard-index.test.mjs`
- 用 V 现版字节加三个新文件拼出的 9.1 dist 副本做冒烟：
  - anchored-shell exec 5 次全部经 broker（`brokered=5`），stdout、stderr、退出码都正确；
  - `OPENCLAW_V_SPAWN_BROKER=0` 时全部直接 spawn；
  - Workboard store 打开两次，两个索引各只建一次。
- 索引在 V 规模库上的建立耗时：见下节。

## 索引在真实规模库上的建立耗时（2026-11-19，VLab 上的 V 副本）

副本取法：V 上以只读事务打包 `workboard.sqlite` 和 WAL，流到 VLab 临时目录，测完已删除。规模 658 MB，26,319 张卡，notes 平均 6.3 KB，表本身 291 MB；两个新索引此前都不存在。node v22.23.1，SQLite 3.51.3。两条语句在同一个 `BEGIN IMMEDIATE` 里执行：

| 页缓存 | board_agg_idx | lifecycle_link_idx | 总计（含提交） |
|---|---|---|---|
| 冷（`posix_fadvise DONTNEED`） | 18.2–18.9 s | 0.17–0.24 s | **18.4–19.2 s** |
| 热（先 `cat` 一遍） | 88–91 ms | 119–149 ms | **0.24–0.26 s** |

- 冷缓存贵的原因：被索引的列排在 notes 之后，第一个索引必须顺着溢出页把整张表读一遍。第二个索引建时表已经在缓存里。
- 索引大小：`board_agg_idx` 852 KB，`lifecycle_link_idx` 10.0 MB，库文件增长 11.3 MB。
- 效果：热缓存下聚合查询 73–77 ms → 5.8–8.6 ms。
- **只付一次**：`IF NOT EXISTS` 在索引建成之后几乎不耗时，冷热都一样。代价只出现在上线后第一次打开 Workboard 库的那个进程里，通常是 Gateway 启动时，在主线程上并持有写锁。
- V 上通常是热的：Gateway 重启不会清页缓存（V 有 61 GB 内存，约 39 GB 是缓存），Workboard 也一直在读写。只有整机重启或内存紧张把页面挤出去，才会落到冷缓存那一档。

**上线步骤（建议）**：在重启 Gateway 前，在 V 上把库读进页缓存，这只是读，不改库：

```
sudo -u openclaw sh -c "cat /home/openclaw/.openclaw/plugins/workboard/workboard.sqlite* > /dev/null"
```

这样第一次打开时只卡约 0.25 s。若不做这一步而恰好是冷缓存，会在启动时卡约 18 s，且只卡这一次。
若要在代码层彻底消除这一次性开销，可以把建索引挪到后台连接：先只读预热，再在写事务里建，写锁只占约 0.25 s。这需要另改源码和补丁，这次没有做。
