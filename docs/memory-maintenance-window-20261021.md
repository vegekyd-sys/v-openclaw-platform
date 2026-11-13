# makaron 记忆库停机维护：向量表重建、缓存清理、compact（2026-10-21）

本文档供 V 升级到 16 核 / 64 GB / 540 GB 那次停机使用。窗口里要把 memory 相关的事一次做完：#447 上线、#448 安装、向量表重建、embedding 缓存清理、doctor compact。下面只写 memory 库这部分的步骤。#447 跟着 Gateway 重启生效；#448 不需要停机，可以在窗口前装好。

## 为什么要做

memory_search 热态从 10/04 的 0.8 s 回退到了 2.0 s（在 Gateway 外测的）。其中 KNN 从 0.25 s 涨到 0.9 s，原因有两个：

- **向量表有 36% 是空槽**。sqlite-vec（vec0，chunk_size=64）删掉一个向量后，它的槽不会被复用；KNN 是暴力扫描，空槽也要一起扫。V 上 65,792 个槽里只有 42,309 个向量。空槽是 indexer 整份重写文件造成的，#448 修好以后不会再增长，但已经存在的只能靠重建去掉。
- **embedding 缓存里有 14,065 条（约 0.93 GB）已经没有任何 chunk 在用**。缓存上限是 50,000 条，满了按 updated_at 淘汰最旧的，所以这些死条目会把还在用的条目挤出去。它们不影响搜索，但占空间，compact 也压不掉。

## 演练数据（VLab 副本：6.9 GB 库，32,174 个 3072 维向量，chunk_size 1024）

测试是 `lab/candidate/memory-vec-rebuild.test.mjs`，5/5 通过。

| 步骤 | 耗时 | 写锁 | 磁盘 | 结果 |
|---|---|---|---|---|
| 备份 vec 四张底层表 | 2.8 s | 无（ATTACH 写到另一个文件） | 备份文件 399 MB | — |
| 重建（单个写事务） | 71 s：暂存 26 s、写回 28 s、核对 5.5 s、提交 11 s | 整整 71 s | WAL 峰值 792 MB；额外峰值约 1.6 GB | KNN 20 组前 10 名的 id 和距离完全一致；槽位 33,792 → 32,768（向量数按块大小向上取整） |
| 回滚 `--restore` | 10.2 s | 10.2 s | — | 槽位、向量数、KNN 和重建前逐一相同 |
| 清理缓存 `--prune-cache` | 29 s（建 keep 表 10.6 s + 删除 18.6 s） | 18.6 s | WAL 29 MB | 删除 15,158 条，释放 956 MB 到 freelist；KNN 不变 |
| compact 估算（`VACUUM INTO` 另一块盘） | 131 s | — | 新文件 5.9 GB（原 7.3 GB） | KNN 不变 |

演练抓到两个 bug，都已修好：

1. sqlite-vec 的虚表可以改名，但它的底层表不会跟着改名，结果表就坏了。所以脚本不再改名，而是「暂存 → 删表 → 按原定义重建 → 写回」。
2. vec0 的 `vector_chunks00` 声明了一列名叫 `rowid` 的字段，它会遮住 SQLite 真正的 rowid，而 sqlite-vec 正是按真 rowid 打开向量 blob 的。所以备份和恢复都要把真 rowid 一起带上。

VLab 这张表本来就有 95% 的槽在用，所以演练测不出扫描变快多少。V 上只有 64% 在用，重建后 KNN 少扫约 36%，预计 0.9 s 降到 0.6 s 左右。

## V 上的预估

V 的向量数是 VLab 的 1.32 倍，chunk_size 是 64。

| 步骤 | 预计耗时 | 磁盘 |
|---|---|---|
| 全库备份（窗口前在线做） | 约 25 min（9/19 时 8.7 GB 用了 10.3 min） | 约 22 GB |
| 向量表重建 | 1–2 min（写锁全程持有，所以必须停机） | 备份约 0.8 GB，WAL 约 1 GB |
| 清理缓存 | 0.5–1 min | 释放约 0.93 GB |
| doctor compact | 15–20 min（9/19 时 8.2 GB 约 6 min，含完整性检查） | 峰值约等于 2 倍库大小，约 44 GB，写在 TMPDIR=/tmp（vda2） |
| Gateway 冷启动 | 5–10 min（compact 后文件身份变了，要做一次整库完整性检查） | — |

**磁盘**：现在系统盘只剩约 51 GB 可用，compact 的峰值加上全库备份放不下。所以 compact 必须等扩到 540 GB 以后再做。

## 顺序建议

先重建向量表，再清缓存，最后 compact。这两步释放出来的页都在 freelist 里，compact 一次就能全部还给磁盘。如果先 compact，后面两步释放的空间就要等下一次 compact 才能收回。

每一步做完都要量一次。在 Gateway 外用 `--db … --extension …` 的报告模式就行，它会输出 slots、vectors、live 和 KNN 扫描耗时 scanMs，量四个点：窗口前的基线、重建后、清缓存后、compact 后。compact 前后都量，是为了分清 KNN 变快是哪一步带来的。

## 步骤清单

下面的常量假定脚本已经装到 `/opt/v-sentinel/v-memory-vec-rebuild.mjs`。所有命令都以 openclaw 身份运行，用 Gateway 同一份代码：

```
DB=/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite
VEC=/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/node_modules/sqlite-vec-linux-x64/vec0.so
NODE=/opt/node-v22.23.1/bin/node
RB="sudo -u openclaw $NODE /opt/v-sentinel/v-memory-vec-rebuild.mjs --db $DB --extension $VEC"
BAK=/var/backups/openclaw-memwindow-20261021     # 先 mkdir，属主 openclaw
```

### A. 窗口前（Gateway 在线）

1. 全库备份，用在线 backup API，不需要停机：
   `sudo python3 /opt/v-sentinel/v-memory-indexer-run.py --cli backup sqlite create --agent makaron --repository $BAK`
   记下输出的备份路径和大小。
2. 记录基线：`$RB` → 保存 JSON（slots / vectors / scanMs）。
3. 确认 #448 已经装好，并且 indexer 的 journal 里有 `DB91 integrity epoch from the running Gateway`。

### B. 停机（在关机前完成，并且要保证开机后不会自动拉起）

4. `systemctl stop openclaw-gateway-memory-snapshot.timer openclaw-storage-lifecycle.timer openclaw-heartbeat.timer`。memory-snapshot timer 带 `Requires=` gateway，不停的话会把停着的 Gateway 拉起来（9/19 踩过）。
5. `systemctl stop v-memory-indexer v-memory-vector-pin`
6. `systemctl stop openclaw-gateway`（夜班会随着自动暂停）
7. 把以上 unit 在开机时的自动启动暂时关掉（`systemctl disable …`，记下关了哪些），然后关机升级。
8. 开机后确认没有任何进程打开这个库：`sudo lsof $DB` 应该是空的。

### C. 维护（库不被任何进程打开）

9. **重建向量表**：`$RB --backup $BAK/vec-backup.sqlite --apply`
   - 期望输出：`knnIdentical: true`，没有 `rolledBack`；`after.vectors == before.vectors`；`after.slots == ceil(vectors/64)*64`（约 42.4k，原来是 65,792）。
   - 如果脚本报 `rolledBack`，事务已经回滚，库原样未动。把输出贴给开发，然后跳到第 11 步。
10. 量一次：`$RB` → 记录 scanMs。
11. **清理缓存**：`$RB --prune-cache`。期望删除约 14,000 条、释放约 900 MB。
12. **compact**：
    `sudo python3 /opt/v-sentinel/v-memory-indexer-run.py --cli doctor --session-sqlite compact --session-sqlite-agent makaron --json`
    期望 `integrityCheck: ok`、`reclaimedBytes` 大于 0。失败时它会干净地回滚（9/19 VLab 两次空间不足都是这样）。
13. 量一次：`$RB` → 记录 slots 和 scanMs（应该和第 10 步一致或更好）。

### D. 起服务（顺序很重要）

14. 恢复第 7 步关掉的自动启动。
15. `systemctl start openclaw-gateway`。#447 的文件要事先由发版流程装好，等它 ready（这次要做整库完整性检查，会比平常慢）。
16. Gateway ready 之后再 `systemctl start v-memory-indexer`，这样 indexer 能拿到新的 epoch，几秒就能 watching。如果先启动它，它会自己去做整库完整性检查。
17. `systemctl start v-memory-vector-pin`，锁住新的向量页；再启动第 4 步停掉的 timers。
18. 验收：
    - `$RB`：slots 和 scanMs 正常；
    - indexer 的 journal 里有 epoch 那一行，并且有一次 `sync`；
    - 在会话里用 memory_search 搜 3 次，结果正常，耗时比基线短；
    - Gateway 日志里没有 host timing gap 或 thaw。

### 回滚

- **重建出错**：脚本会自动回滚，不需要人工处理。
- **重建已经提交，但事后发现问题**：在停机状态下执行 `$RB --backup $BAK/vec-backup.sqlite --restore`。演练耗时 10 s，恢复后槽位和 KNN 跟原来一模一样。
- **清理缓存**：不需要回滚。缓存只是用来省 embedding 调用的，删掉的条目以后需要时会重新算一次。
- **compact 失败**：doctor 会自己回滚，库保持原样。
- **任何一步出现不明问题**：停 Gateway，用 A1 的全库备份整库换回。memory 索引也可以用 `memory_index_chunks.embedding`（每个向量都存了一份 JSON）重新生成。

## 相关

- `scripts/v-memory-vec-rebuild.mjs`：报告 / 重建 / 回滚 / 清理缓存四种模式。
- `lab/candidate/memory-vec-rebuild.test.mjs`：VLab 演练。
- #447：关键词检索和 KNN 并行。
- #448：indexer 只重写变了的 chunk，并复用 Gateway 的完整性证明。
