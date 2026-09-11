# V 语义检索与磁盘瘦身修复 — 2026-09-11

状态：线上数据布局修复完成，当前真实语义检索已恢复。防复发代码补丁未合入 dev、未部署；首次完整性检查慢仍未优化。

## 最终结果

- 发布时 32,131 条向量、394,825,728 字节全部 SHA256 一致，原生 top-12 余弦排序一致；发布前后 revision 均为 2811120。最长分批写锁 397 ms，续做增量写锁最大 8 ms，原子切换事务 232 ms。
- 原向量表及底层存储保留为 `memory_repair_rollback_vec_20260911`。发布后自然增量同步继续工作：最终向量数与记忆块数均为 **32,144**，505 个存储块全部采用 64 条布局。
- 修复后的生产库纯语义检索 **2.226 s / 1.996 s**，均返回向量候选；只在独立验收进程内禁用混合检索，生产设置不变。
- 真实 Gateway `/tools/invoke` → `memory_search` 两轮 **6/6 成功**，不再返回 disabled/unavailable；存在 vectorScore 大于零且 textScore 为零的结果，证明不是仅靠关键词命中。未向飞书或企微发送测试消息。

| 请求 | 第一轮端到端 | 第二轮端到端 |
| --- | ---: | ---: |
| 分批启动、避免数据库争抢 | 5.746 s | 12.544 s |
| 视频配音与背景音乐 | 11.171 s | 13.628 s |
| 代码修复与开发分支 | 10.513 s | 4.179 s |

- 清理约 **106 GB 过期占用**，另清除本任务 **2.38 GB 演练副本**。同期其他部署产生了新备份，不能把清理量当成净空闲增量。
- 最终系统盘 **54 GiB 可用 / 86% 使用**，数据盘 **53 GiB 可用 / 72% 使用**；开始时系统盘约 16 GiB 可用 / 96% 使用。
- 未删除正式 Memory、Session、workspace、业务媒体。已删除的过期副本不可直接恢复；完整备份、独有历史数据库及原生产向量表保留。
- Gateway PID **2479252**、NRestarts=0；本次未重启 Gateway、未改应用配置，最终近六分钟日志未见 memory 同步或数据库锁错误。

### 尚未优化：首次完整性检查

首次调用 Gateway 工具入口时，database-open:default 耗时 144,188.7 ms，其中 integrity 占 144,159.9 ms，导致外层 25 s / 45 s 诊断请求超时，并触发原生短暂冷却。检查和冷却结束后，上述六次真实工具调用均成功。

未禁用完整性检查、未延长生产 memory_search 的 15 秒时限、未增加关键词兜底。不能用当前热态成功宣称冷启动也已修复；上述耗时是抽样结果，不是未来请求的时延保证。

## Scope and authority

User requested restoration of real semantic retrieval and disk-space relief, and explicitly allowed moving data and deleting useless backups. Keyword fallback was rejected and is not part of this repair. No application-code merge or deployment is authorized by that request: the preventative source patch remains on `codex/memory-search-repair-20260911` pending explicit dev-merge approval.

## Findings and rehearsal

- Existing embeddings are 3072-dimensional FP32. Default sqlite-vec chunks hold 1024 vectors in a 12 MiB blob; native KNN on the live database repeatedly exceeded the 15-second search deadline, while compact copies completed much faster. No evidence justified deleting memory or regenerating embeddings.
- Full copies using 64-vector chunks (768 KiB blobs) preserved all 32,207 fixture embeddings byte-for-byte (SHA256) and native top-12 cosine ranking.
- Initial table-rename rehearsal failed safely. This sqlite-vec build renames the virtual declaration but not its shadow tables; both declaration and four shadow tables must move in one transaction. Earlier same-layout rename results are not sufficient evidence.
- Corrected rehearsal verified fresh connections, an already-open connection, and prepared insert/delete statements against the new 64-slot storage. No Gateway restart was needed for that rehearsal.
- Semantic-only manager retrieval against the corrected private copy took 3.155 s and 2.484 s for a paraphrased startup-ramp question. Production settings were not changed for this probe.

## Production operation safeguards

`lab/repack-memory-vector-storage.mjs` acquires the native reindex lease, stages native inserts in batches of 16 with bounded write holds and passive checkpoints, checks source revision and metadata, hashes every vector, verifies native ranking, and publishes under workspace and generation leases. The original virtual table and its shadow storage are retained for rollback. It never invokes a full memory reindex or changes embedding models.

Run in a dedicated systemd cgroup: MemoryMax 512 MiB, MemoryHigh 384 MiB, no swap, CPU 20%, disk read 20 MB/s and write 10 MB/s on each relevant device. First attempt could not acquire the native reindex lock and exited before modifying the index. Second attempt staged and verified the candidate but exited safely before publication because the standalone workspace-lock state provider was not initialized. Native plugin-state initialization was then configured and all three lock layers verified. Resume rehearsal corrected one changed, one missing, and one stale fixture vector, and passed full hash/rank/swap verification. Production resume reconciled intervening index changes before successful publication.

## Storage completed

- Removed a 5.7 GB abandoned temporary reindex database after verifying it was not in use and the current index was intact.
- Removed superseded incomplete/online upgrade backups and two failed pre-deployment Night Shift backup directories; complete successful rollback points and all same-day backups were retained.
- Retired two failed Night Shift snapshots from the system disk. Their unique historical databases were copied to the data disk and SHA256-verified; payload paths, sizes and mtimes matched retained current data. Inventories were saved before removal.
- Approximately 106 GB of obsolete allocated storage was removed across both disks. Concurrent deployments created additional backups, so this is not a net-free-space measurement.
- Sessions, live memory, workspace and business media were not deleted. Removed obsolete backup copies are not directly recoverable; retained complete backups and the archived historical databases remain available.
- Detailed receipts reside under `/var/lib/v-storage-governance/`, the data-disk `backups/storage-maintenance/retired-nightshift-failures-20260911/`, and `memory-repair-probe-20260911/`. Credentials and memory content are not included in this report.

## Preventative source patch (not merged or deployed)

`patch-memory-vector-chunks.mjs` sets a bounded power-of-two chunk size when creating future vector tables (64 for 3072 dimensions). Healthy existing indexes are left alone. The builder checks the source SHA and rejects the shelved fallback candidate. Eight unit tests pass, including dimension validation, existing-index preservation, reset failure, source-drift rejection and absence of fallback changes.

Tests: 8/8 unit tests, syntax checks of the generated artifact and maintenance/acceptance scripts, and staged diff checks passed. No shared VLab or production application-code deployment was performed. The preventative patch requires explicit dev-merge approval; a future full reindex using old creation code can otherwise restore the default 1024-slot layout.

Successful production receipt: data-disk `openclaw/memory-repair-probe-20260911/production-small-repack-receipt-1789120885805.json`. Audit receipts were retained after deleting private rehearsal database copies. Automatic rollback requires unchanged revision; since live indexing has continued, any manual rollback must first reconcile newer index changes, not blindly switch the old table back. No memory content or credentials are saved in this report.
