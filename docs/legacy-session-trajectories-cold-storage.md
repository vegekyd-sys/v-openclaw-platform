# 遗留会话运行轨迹的冷存储与取回

> **当前状态（2026-10-16 01:04 CST）：已撤回，sessions 目录原样未动。**
>
> Tianyi 01:0x 决定「不要移了…这是一个重要的聊天记录，就把它留在里面」。到这时，已经删掉原件的 627 个文件（演练批 20 个和 `2026-09-a` 的 607 个）全部从 vdb 搬回了原位置。每个文件的 sha256、大小、纳秒 mtime、权限、属主都按清单核对过，627/627 一致。
>
> 核对结果：
> - sessions 目录顶层是 29,496 个文件、16,209,718,862 字节，和动手前测的完全一致；
> - 规划清单里的 19,419 个文件全部在原位，元数据都没变。
>
> vdb 和 COS 上的副本先**留着，等 Tianyi 决定**，见下面「留下的副本」。下面的流程和脚本作为以后的参考保留。

最初的计划是：把 9.1 升级前遗留在生产 V `agents/makaron/sessions/` 里的**运行轨迹**原样搬到冷存储，腾出 session 磁盘预算。每个文件留两份经过 sha256 校验的副本，可以按会话 id、月份或文件名逐个取回。

此前 Tianyi 的决定（10/16 00:4x）：「只有一份的聊天记录，就别删 留着」。所以范围是：

- **计划搬走的**：`.trajectory.jsonl`、`.trajectory.jsonl.gz`、`.trajectory-path.json`、`.trajectory.jsonl.deleted.*`。
- **原地不动，也不压缩**：聊天转录 `.jsonl`、删除或重置时留下的归档（`.jsonl.deleted.*` 等）、checkpoint、所有 `.zst` canonical 归档、`skills-prompts/`。

脚本在 [`scripts/legacy-trajectory-archive/`](../scripts/legacy-trajectory-archive/)，V 上的副本在 `/srv/openclaw-data/disk1/legacy-sessions-archive/bin/`。

## 存放位置

| 位置 | 内容 | 用途 |
|---|---|---|
| `/srv/openclaw-data/disk1/legacy-sessions-archive/trajectories/<原文件名>` | 原样的文件，属主、权限、mtime 都不变，目录结构保持平铺 | 主副本，恢复快。vdb 不计入磁盘预算，**但 vdb 没有备份** |
| `/lhcos-data/openclaw-archive/v-zkda/legacy-sessions-trajectories/<批次>.tar.zst` | 每批一个 tar（PAX 格式，mtime 精确到纳秒，数字属主）再用 zstd 压缩 | 冗余副本，放在 COS 对象存储 |
| 同上目录下的 `<批次>.manifest.tsv`、`<批次>.receipt.json` | 每个文件的清单和该批的校验回执 | 查找、核对 |
| `/srv/openclaw-data/disk1/legacy-sessions-archive/work/` | 规划结果 `plan-20261016.json`、每批的清单、回执、删除日志 | 审计 |
| `/srv/openclaw-data/disk1/legacy-sessions-archive/RESTORE.md` 和 COS 目录下的 `RESTORE.md` | 本说明 | |

权限：vdb 上的归档目录是 root:openclaw 0750，文件保持原样 openclaw:openclaw 0600；COS 上的对象是 root 0600。这些文件是用户对话的运行记录，不要放宽权限。

清单的列（TSV，第一行是表头）：`name kind month size mtime_ns mode uid gid sha256`。`month` 是文件 mtime 所在的月份（CST）。

批次名是 `rehearsal-20261016`，以及 `<YYYY-MM>-<a|b|c…>`，每批原始大小不超过 1 GB。

## 取回

都在 V 上以 root 执行。`restore.sh` 不会覆盖已有文件，还原后会对照清单校验 sha256。

```bash
sudo /srv/openclaw-data/disk1/legacy-sessions-archive/bin/restore.sh find <会话id>
sudo /srv/openclaw-data/disk1/legacy-sessions-archive/bin/restore.sh find 2026-07
sudo /srv/openclaw-data/disk1/legacy-sessions-archive/bin/restore.sh restore <文件名>
sudo /srv/openclaw-data/disk1/legacy-sessions-archive/bin/restore.sh restore <文件名> --from cos
sudo /srv/openclaw-data/disk1/legacy-sessions-archive/bin/restore.sh restore <文件名> --to /tmp/somewhere
```

- `find` 的输出列：`批次 文件名 类型 月份 大小 sha256`。参数可以是会话 id、文件名的一部分，或者月份。
- `restore` 默认从 vdb 复制，并还原回原来的 sessions 目录；`--from cos` 改为从 COS 的 tar 包里解出。
- 只是查看内容的话，用 `--to` 放到别处，不要放回 sessions 目录。

**整月还原**（例如 7 月，从 vdb）：

```bash
sudo bash -c 'A=/srv/openclaw-data/disk1/legacy-sessions-archive; for m in /lhcos-data/openclaw-archive/v-zkda/legacy-sessions-trajectories/2026-07-*.manifest.tsv; do awk -F"\t" "NR>1{print \$1}" "$m"; done | while read -r n; do $A/bin/restore.sh restore "$n"; done'
```

**没有脚本时手工还原**：

```bash
sudo cp -a /srv/openclaw-data/disk1/legacy-sessions-archive/trajectories/<文件名> /home/openclaw/.openclaw/agents/makaron/sessions/
sudo bash -c 'zstd -dc /lhcos-data/openclaw-archive/v-zkda/legacy-sessions-trajectories/<批次>.tar.zst | tar -x -C /tmp/restore --numeric-owner -p --same-owner -- <文件名>'
```

还原后用 `sha256sum` 和清单里的值核对。

`.trajectory-path.json` 里记录的是原来的绝对路径。把它和对应的 `.trajectory.jsonl` 一起还原回原目录，指针就重新有效。

## 怎么判定哪些文件可以搬

见 `plan.py` 的文件头注释。一个文件只有同时满足下面所有条件才搬：

1. 是上面四种轨迹类型之一，不是 `.zst`，是 sessions 目录顶层的普通文件，只有一个硬链接。
2. 运行时自己的引用规则不认为它被引用。这条规则照搬 disk-budget 的 `resolveReferencedSessionArtifactPaths`：顶层 `sessionFile`（或默认的 `<sessionId>.jsonl`）及其 trajectory、pointer，再加 `compactionCheckpoints[*].pre/postCompaction.sessionFile`。
3. 文件名里的会话 id 不是任何条目的当前会话（`current_session_id` / `entry.sessionId`），也不在 `session_windows` 或 `session_transcript_archives` 里。
4. 文件名里的会话 id 没有出现在任何条目的 `compactionCheckpoints` 中。这些 checkpoint 的转录要原地保留，同一会话的轨迹也跟着留下。
5. mtime 和 ctime 都在 14 天以前。

库是按 rowid 分块读的，每块一个独立的短读事务。V 的库上不要开长读事务：10/15 一次 dbstat 让 WAL 涨到了 2 GB。

**`usageFamilySessionIds` 等字段里出现过 id 的文件照样搬了**。原因：
- 用量分组读的是转录（jsonl 或 SQLite），不读轨迹。
- 轨迹导出只跟随条目自己的 `sessionFile`，而现在所有条目的 sessionFile 都是 `sqlite:` 标记。
- 每个这样的文件在 `plan-20261016.json` 里都有 `db_mentions` 字段，记录 id 出现在哪些字段。

**用量统计不受影响**。`session-cost-usage-*.js` 的 `listUsageCountedTranscriptFileStats` 只统计主转录 `.jsonl` 和 `.jsonl.reset|deleted.*`，并且显式排除 `.trajectory.jsonl`；`.trajectory.jsonl.deleted.*` 解析出的会话 id 不是主转录，同样不计入（`artifacts-*.js` 的 `parseUsageCountedSessionIdFromFileName`）。worker.mjs 里是同一份逻辑。

## 每批的流程

`run_batches.sh` 用 `systemd-run` 单独跑，Nice=19、IO best-effort 7，ssh 断了也不受影响。任何一步失败就停下，原文件保持不动。

1. `copy_verify.py`，以 20 MB/s 限速：
   - 每个文件读一遍，边读边算 sha256，写到 vdb 的 `.partial`，fsync，再恢复属主、权限和时间，最后改名为正式文件名。
   - 从页缓存里丢掉这个副本后从磁盘读回，比对 sha256、大小、mtime、属主和权限。
   - 原文件在复制前后的 size、mtime、ctime 必须一致。
   - 原文件读完后也从页缓存丢掉，免得把 agent 库的热页挤出去。
2. `cos_pack.py`：
   - 从 vdb 的副本打 tar.zst，用 `zstd -t` 自检。
   - 以 2 MB/s 写入 COS。COS 挂载走的是公网端点，和模型请求共用整形过的出口。
   - 回读时绕开页缓存，先比对整包的 sha256，再逐个比对成员的 sha256、大小、权限、属主和纳秒 mtime。
   - 全部通过后写回执。
3. 重跑 `plan.py`。文件必须仍在最新的可搬清单里，也就是仍未被引用、仍超过 14 天未改。
4. `remove_sources.py`，先 dry run，再 `--apply`。删除前逐个检查：
   - COS 回执覆盖了这份清单；
   - vdb 副本的元数据一致，并且现在重新读一遍的 sha256 仍然一致；
   - 原文件没有变过，也没有被任何进程打开。

两种操作都带同一个 liveness 保护：如果 Gateway 在 5 分钟内的 liveness 延迟超过 8 次，或者有一次超过 15 s，就暂停；连续 30 分钟都不恢复就退出。这个阈值是相对背景值定的：10/15 23:24 到 10/16 00:13，在任何操作之前，50 分钟里有 27 次，最大 9 s。

## 执行记录（2026-10-16）

| 时间（CST） | 动作 | 结果 |
|---|---|---|
| 00:53 | 只读规划 | 可搬 19,419 个文件、7.01 GB（6 月 2,906 / 7 月 9,369 / 8 月 6,531 / 9 月 612 / 5 月 1）。原地保留：非轨迹文件 9,468 个，`.zst` 871 个，checkpoint 会话的轨迹 269 个（0.55 GB），会话 id 仍在库里的 22 个 |
| 00:53 | 动手前测预算 | 33.40e9 / 51.54e9 = **64.81%** |
| 00:54–00:56 | 演练：四种类型各 5 个，共 20 个 | 复制、COS 回读、全量解压比对，0 差异。原件删除后，又用 `restore.sh --from cos` 原位还原一个、比对一致后再删一次 |
| 00:58 | `2026-09-a`：607 个，0.27 GB | 44 s 完成，COS 包 8.0 MB，预算降到 64.28% |
| 00:59–01:03 | `2026-06-a`：2,897 个，0.88 GB | vdb 复制并校验完成；正在以 2 MB/s 上传 COS 时按 Tianyi 的要求停止，**这批原件没有删过** |
| 01:03 | 撤回 | 627 个已删原件从 vdb 还原，按清单核对 627/627 一致；目录回到 29,496 个文件、16,209,718,862 字节；预算 64.86%（库和 WAL 自身的增长） |

执行期间（00:57–01:04），Gateway 的 liveness 延迟有 4 次，最大 6.8 s，没有超出背景水平，保护也没有触发暂停。

演练中发现并修好的一个问题：Python `tarfile` 默认把 mtime 当浮点数写进 PAX 头，纳秒会被截断（…806 变成 …700），内容不受影响。现在改为写入精确的 `秒.纳秒`，COS 回读时也比对 mtime。

## 留下的副本（等 Tianyi 决定）

| 位置 | 内容 |
|---|---|
| `/srv/openclaw-data/disk1/legacy-sessions-archive/trajectories/` | 3,524 个文件，1.147 GB：演练批 20 个、`2026-09-a` 607 个、`2026-06-a` 2,897 个，和原件逐字节相同。原件现在都在 sessions 目录里，所以这些是重复的 |
| `/srv/openclaw-data/disk1/legacy-sessions-archive/work/` | 规划结果、清单、回执、删除日志；`2026-06-a.tar.zst`（863 MB，打包完整，`zstd -t` 通过，没有回读校验过） |
| `/lhcos-data/openclaw-archive/v-zkda/legacy-sessions-trajectories/` | `rehearsal-20261016` 和 `2026-09-a` 两批完整的 tar.zst，加清单和回执；`2026-06-a.tar.zst.partial`（183.5 MB，上传到一半，不完整，不能当副本用） |

COS 桶从公网匿名访问返回 403，不是公开桶。

全部清掉的命令（需要 Tianyi 同意）：

```bash
sudo rm -rf /srv/openclaw-data/disk1/legacy-sessions-archive
sudo rm -rf /lhcos-data/openclaw-archive/v-zkda/legacy-sessions-trajectories
```
