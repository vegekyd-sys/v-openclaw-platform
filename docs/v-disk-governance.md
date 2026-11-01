# V 硬盘治理（2026-10-27）

Tianyi 10/27：「前几天刚升级好机器，有 200 多 G，现在又只有 54G 了」。本文记录根分区这几天被什么吃掉、哪些能清、怎么防止再涨满。
数据全部是 10/27 17:40–18:30 CST 在 V 上只读测得（`ionice -c3 nice -n19`，会话库只读文件头和按 rowid 抽样，没有整表扫描）。

## 1. 增长曲线

`/dev/vda2` 10/21 22:35 从 380G 扩到 532G（ext4 在线 resize）。下表是 `v-storage-governance` 每天 04:00 记下的根分区用量（GB = 1e9 字节）：

| 时间 | 已用 | 当天新增 |
|---|---|---|
| 10/22 04:01 | 374.7 | 扩容后剩 172.6 |
| 10/23 04:03 | 406.1 | +31.5 |
| 10/24 04:00 | 443.7 | +37.6 |
| 10/25 04:01 | 445.6 | +1.9 |
| 10/26 04:03 | 442.1 | −3.5 |
| 10/27 04:03 | 452.9 | +10.7 |
| 10/27 17:40 | ≈ 496 | +43（已扣掉白天删的 7.3 GB `/tmp/b.wav`） |

数据盘 `/dev/vdb`（197G）同期在 66%–75% 之间，夜班 3 天保留期在起作用，这次不是它。

## 2. 谁写的

按「10/20 之后写入、现在仍在盘上的文件」逐日、逐目录汇总，再对大户逐个核实：

| 来源 | 现在占用 | 新增时间 | 说明 |
|---|---|---|---|
| `workspace/tmp/chenjie/` | **71 GB** | 10/21 17 G、10/23 22 G、10/26 3 G、10/27 30 G | V 帮 chenjie 把飞书里的视频压缩包用 lark-cli 下载到 `rar/`（43 GB），再解压到 `videos/`（28 GB，803 个 mp4），然后上传 CDN 做展示页。`site/*.html` 里 843 处引用的都是 `cdn.makaron.app`。压缩包和解压结果是同一份内容存两遍，原件也还在飞书消息里。10/27 17:2x 同一个 7.4 GB 的 `tianchen.zip` 被两条并行命令同时下载，峰值占了两份空间，之前失败的下载还留下 5 个 `.tmp` 残片（5.6 GB）。 |
| 10/21 升级备份 | 28 GB | 10/21 | `/var/lib/v-upgrade-maintenance/20261021/openclaw-agent.before-memory-maintenance.sqlite`（24.2 GB，升级前整库）+ `/var/backups/openclaw-memwindow-20261021`（3.7 GB，记忆向量库 4 份）。 |
| makaron 会话库 | 30.2 GB | 10/21 24.2 → 10/27 30.2 | 每天约 +1 GB，是 10 月上旬（+0.375 GB/天）的近 3 倍。freelist 只有 35k 页（0.14 GB），是真数据不是碎片。见第 5 节。 |
| `workspace/_work/` | 18 GB | 10/20–10/22 | 6 个按日期命名的客户项目（jianhua、bohui、weinuo、jiepai）。 |
| `workspace/work/interview-yunrong`、`yunrong-film` | 12.7 GB | 10/21–10/27 | 客户项目。 |
| v-codex 会话库 | 6.5 GB | 最后写入 10/22 02:45 | 之后没有任何写入。 |
| 模型缓存 | +4.6 GB | 10/20–10/24 | `faster-whisper-large-v3` 在 `~/.cache/whisper` 和 `~/.cache/huggingface/hub` 各有一份同样的 3.1 GB blob。 |
| 夜班只读快照残留 | 3.8 GB | 10/17–10/26 | `~/.openclaw/nightshift/.cache/openclaw/openclaw-sqlite-readonly-<pid>-*` 10 个，创建它们的进程都已退出。OpenClaw 只在进程正常退出时清理，进程被杀就留下。 |
| 日志 | 5.7 GB | 持续 | journald 3.7 GB（默认上限），rsyslog 又存一份（`syslog.1` 1.1 GB 未压缩）。 |

其余大目录是存量，这几天没怎么变：`agents/makaron/sessions` 14.4 GB（5–9 月遗留聊天记录）、`workspace/work` 36.5 GB、`/srv/openclaw-data/output-alt` 55 GB（`workspace/output` 的软链目标，9 月 37 GB、10 月 17 GB）、`/srv/openclaw-data/disk/openclaw-storage` 23 GB（workspace 里 artifacts/outputs 等软链的目标，5–6 月为主）、`~/.openclaw/media` 12.8 GB、`/var/backups/v-work-assets` 9.4 GB、`/opt` 11 GB。

## 3. 清理清单

### A. 可以直接删：不含用户数据，可再生（约 16 GB）

| 目标 | 大小 | 依据 | 做法 |
|---|---|---|---|
| `workspace/tmp/chenjie/rar/` 下 5 个 `.*.tmp`（`.tianchen.zip.{1158257075,3697169039,4060288575}.tmp`、`.br_pt.rar.100648155.tmp`、`.us_en.rar.1443042895.tmp`） | 5.6 GB | lark-cli 下载失败留下的残片，没有进程打开（逐个查 `/proc/*/fd`），对应文件都已完整下载 | 删前再查一次 fd |
| `~/.openclaw/nightshift/.cache/openclaw/openclaw-sqlite-readonly-*`（10 个） | 3.8 GB | 目录名里的 pid 全部已不存在；内容是 Gateway 库的只读副本 `database.sqlite` + 拷贝中间文件 `first` | 删前确认 pid 仍不存在 |
| `~/.cache/whisper/.../faster-whisper-large-v3/blobs/69f7…` | 3.1 GB | 与 `~/.cache/huggingface/hub/` 下同名 blob 是同一内容（HF 用内容哈希命名） | 校验 sha256 后改成硬链接，不删 |
| `/var/log/syslog.1` 和 journald 超出 2 GB 的部分 | 约 2.8 GB | 与 journald 重复；journald 归档 | `gzip syslog.1`；`journalctl --vacuum-size=2G` |
| `/tmp` 下超过 7 天且没有进程打开的文件 | 0.9 GB | 同 10/14 的做法 | 一次读 `/proc/*/fd`，不用 `lsof +D` |

### B. 需要 Tianyi 确认（可能是用户数据或回滚手段）

| 目标 | 大小 | 建议 |
|---|---|---|
| `workspace/tmp/chenjie/rar/` 已解压的压缩包（不含上面的 .tmp） | 37.7 GB | 等 chenjie 这批做完（`tianchen.zip` 17:44 刚下完、还没解压）后删除已解压的包。原件还在飞书消息里，需要时可重新下载。 |
| `workspace/tmp/chenjie/videos/` | 27.8 GB | 展示页引用的是 CDN。逐个核对 CDN 上有同名同大小的文件后删除；或保留到 chenjie 确认验收。`jpai` 和 `jpai_flat` 是两份相同内容（各 1.2 GB）。 |
| `/var/lib/v-upgrade-maintenance/20261021/openclaw-agent.before-memory-maintenance.sqlite` + `pr451452-fixture.sqlite` | 24.7 GB | 10/21 升级的整库回滚备份，升级已经验收。系统盘每日镜像只保留 3 天，删掉后就回不到 10/21 的库。建议删除；要留就用限速方式传到 COS（cosfs 走公网出口，要限速，否则挤占模型请求）。 |
| `/var/backups/openclaw-memwindow-20261021/` | 3.7 GB | 同一次升级的记忆向量库备份，建议删除。 |
| `~/.openclaw/media/inbound/`（7–10 月） | 10.7 GB | 打开官方保留期（见 4.3）后会自动清掉 7 天前的部分。代价是旧会话里引用的图片和文件就打不开了。 |
| `workspace/tmp/` 其他目录（非 chenjie）超过 14 天的部分 | 1.4 GB（超过 7 天为 4.9 GB） | V 的临时目录，大多是夜班和单次任务的中间产物。 |
| `/srv/openclaw-data/output-alt/` 9 月的产出 | 37 GB | V 的输出目录，多数已交付。建议超过 30 天的迁到 COS 或删除，需要逐个确认是否已上传。 |
| `~/.openclaw/browser/openclaw/user-data.bak-20261007-0959` | 1.3 GB | 10/07 浏览器 profile 备份，含登录态。 |
| v-codex 会话库 | 6.5 GB | 10/22 之后没写入。是聊天记录，先确认这个 agent 是否还在用，再决定是否归档。 |
| `/var/backups/v-work-assets/work-assets-20260930T073713Z.tar.gz` | 9.4 GB | 9/30 误删事故之后的 work 资产备份。建议保留，可以迁到 COS。 |

如果 B 里的前 4 项和 media 都批准，加上 A，能腾出约 120 GB，根分区回到约 68%。

### C. 不能动

makaron 会话库（在线写入）、`codex-home/*.sqlite`、`agents/makaron/sessions` 遗留目录（Tianyi 10/16 定保留原地）、`workspace/work/` 和 `_work/`（客户资料，9/29 误删过一次）、`nightshift.sqlite`、`state/`、`workboard.sqlite`、`/srv/openclaw-data/disk/openclaw-storage`（workspace 软链的目标）、`/opt` 下的发布版本（回滚用）、正在使用的模型缓存。

### 删除方式

- 可回滚的先移走：A 里的 `.tmp` 和快照残留可以直接删；B 里的批准项先 `mv` 到同盘的 `/srv/openclaw-data/trash-20261027/`（同一个文件系统，`mv` 不复制数据），留 3 天没人要再删。
- 每一批写清单（路径、大小、inode、sha256 或 mtime），放到 `/home/openclaw/backups/storage-maintenance/`，跟 10/14、10/17 的做法一致。
- 白天只做 `mv` 和小文件删除；大文件 `rm` 本身很快，但 COS 上传、sha256 校验这类读写要放到夜里，并限速。

## 4. 防止再涨满

### 4.1 磁盘告警：本 PR

哨兵原来只在根分区剩 15 GB 时告警。按 10/27 的速度，这只能提前几个小时。本 PR 在 `scripts/v-sentinel/sentinel.py` 里加了三条：

- 余量线：根分区剩不到 60 GB，或数据盘剩不到 20 GB。数据盘只在 `/srv/openclaw-data/disk1` 确实是独立挂载时才判断，否则 `df` 报的是根分区。
- 写满预测：按过去 6 小时可用空间下降的速度，预计 24 小时内写满，连续 2 次采样才报。
- 临时目录大文件：`/tmp`、`/var/tmp`、`workspace/tmp` 里 1 小时内出现超过 4 GB 的文件，每 30 分钟扫一次，在 V 上约 1 秒。按 inode 去重，`.x.tmp` 改名成 `x` 不会重复报。

验证：用假数据驱动 `main()` 跑了 12 个场景（正常、低于余量线、持续期间不重复、恢复、写满预测、清理后恢复、大文件只报一次、改名不重复、两次扫描之间不扫、数据盘未挂载），全部通过。`disk_space()` 和 `find_big_new_files()` 在 V 上只读跑过一次：两块盘都能识别，非挂载点返回空，找到 `tianchen.zip`。
上线以后第一次采样就会报「根分区只剩约 54 GB」，这是真实状态，不是误报。

部署注意：V 上的 `sentinel.py` 比 dev 旧，缺 `fd71f3c1`、`7e2f9200` 两个已合入 dev 的 inter-session 提交。从 dev 部署会一起带上它们。

### 4.2 会话库：官方磁盘预算

现在是 `session.maintenance.mode=warn`、`maxDiskBytes=48gb`。哨兵量到 makaron 是 45.2 / 51.5 GB（88%），`budget_near` 已经报过。按每天 1 GB，大约 11/03 超过预算。warn 模式下超了也不会清理，盘照样涨；enforce 模式会删历史，Tianyi 10/15 选过不丢数据。所以官方预算在这里只能当容量线用，要 Tianyi 选一个：

1. 调大到 64gb，继续 warn：不丢数据，盘每天照涨约 1 GB。
2. 源头减量（另开线程）。抽样发现两个问题：
   - 近 5 天写入的 40 万条转录事件里，有整段 7–9 月的老会话被重新插入，每个会话的全部 seq 都换了新 rowid。抽到的 4 个会话是 20–90 MB，其中一个 85 MB、1.8 万条事件的会话在 10/26 晚被整段重写过。这首先是写放大问题，会不会推高净增长还要查。
   - 记忆索引一份向量存三遍（7.3 GB，见 `docs/incidents/2026-10-15-feishu-ingress-stall.md`）。
   - 要看清净增长落在哪张表，需要 dbstat。生产库上开长读事务会让 WAL 暴涨（10/15 12 分钟涨到 2.17 GB），只能夜里分块做，或者拿 10/21 那份整库备份对比后再删它。

### 4.3 入站媒体：官方保留期

9.1 有官方开关 `attachments.ttlHours`（`server-start` 里读取）。设置后，Gateway 每小时清理 `~/.openclaw/media/` 下除 `playback-transcode`、`outgoing` 以外所有子目录里超过保留期的文件。上限 168 小时（7 天），只在 Gateway 启动时读取，要重启才生效，交给 Monitor 排期。不设置时只清 outbound。`workspace/media/inbound`（6.9 GB）不在 `~/.openclaw/media/` 下，这个开关管不到。

7 天对聊天记录里的图片来说偏短。如果 Tianyi 要 30 或 60 天，就不能用官方开关，要自己写定时任务。

### 4.4 临时目录

- `workspace/tmp`：加一条 tmpfiles 规则 `e /home/openclaw/makaron-openclaw/.openclaw-local/workspace/tmp - - - 14d`，由已有的 `systemd-tmpfiles-clean.timer` 每天执行。按 atime/mtime/ctime 里最新的那个算年龄，最近碰过的都会留下。要 Tianyi 批准，因为 chenjie 这类任务把正式素材也放在 tmp 里。
- `/tmp`：已经是 30 天。超过 7 天的只有 0.9 GB，问题出在单个超大文件，所以靠 4.1 的大文件告警，不必改保留期。
- V 的 workspace 规则（AGENTS.md，需要 Tianyi 同意才能改）：同一个文件只下载一次，不要并行重试；压缩包解压后删掉；音视频转码不要无故升采样率。

### 4.5 夜班

数据盘上的项目已经有 3 天保留期（v-nightshift#11，10/20 起 `NIGHTSHIFT_RETENTION_DAYS=3`）。根分区上只有快照残留。`v-storage-governance` 本来就会清理 `openclaw-sqlite-readonly-*`，但有两个漏洞：
- 只扫 `~/.cache/openclaw`，不扫夜班的 `~/.openclaw/nightshift/.cache/openclaw`（夜班服务设置了自己的 `XDG_CACHE_HOME`）；
- 目录里有 OpenClaw 拷贝时用的中间文件 `first`，被判成 `unrecognized-content` 跳过。所以 `~/.cache/openclaw` 下那 5 个残留每天都被跳过。

`v-storage-governance` 的源码在 `codex/storage-governance-20260906` 分支的 `storage/`，没进 dev，要另外改。另外，这个服务只要水位不是 normal 就 exit 2，9/28 起几乎每天都显示「失败」，但没有人收到通知。4.1 的告警补上了这个缺口。

### 4.6 发版备份

这类问题已经出现三次：10/14 删过 15 GB 语音发版整库备份，10/17 删过 3 份共 28.7 GB，这次又是 28 GB。建议约定：发版的整库备份放在数据盘或 COS 上，文件名带到期日，验收后 3 天删掉。也可以让 `v-storage-governance` 对超过 7 天、大于 1 GB 的 `/var/lib/v-*`、`/var/backups/*` 告警。

### 4.7 日志

在 `journald.conf.d` 里设 `SystemMaxUse=2G`，rsyslog 改成轮转时压缩，或者停掉与 journald 重复的 `syslog`。能省约 3 GB，优先级低。
