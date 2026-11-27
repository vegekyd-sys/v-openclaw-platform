# V 存储整体方案：分层、自动扩容、清理与备份（2026-11-27）

状态：**方案稿，待 Tianyi 拍板**。本轮只读调研，没有改 V 上任何文件、定时任务或配置，没有发起扩容或购买。

数据来源：2026-11-27 12:50–14:30 CST 在 V 上只读测得（`ionice -c3 nice -n19`，只对具体子目录做 `du`），加上腾讯云只读 API（`Describe*`、`InquirePrice*`、云审计 `LookUpEvents`），以及 `v-storage-governance`、`openclaw-storage-lifecycle` 两个定时任务每天留下的记录。GB 指 1e9 字节，G 指 `du`/`df` 的 GiB。

相关文档：[v-disk-governance.md](v-disk-governance.md)（10/27 根分区治理）、[v-daily-image.md](v-daily-image.md)（系统盘每日镜像）。

---

## 决定与进展

- **2026-11-27 16:3x CST** Tianyi 认可方案，并定了两点：
  1. **V 自己拥有付款权限**，不另建 root-only 的身份。已在 CAM 新建自定义策略 `V-FinanceTrade`（内容只有 `finance:trade`），关联到 Gateway 使用的子用户。V 上用同一组凭据调用 `DescribeAccountBalance` 已经返回成功，账户余额 1042.86 元。因此第 4.2 节第 1 条不再适用：凭据仍放在 Gateway 的 env 文件里，靠花费上限和告警约束。
  2. 要有**持续的流转监控**：看热、温、冷三层的数据是不是真的在流动，成本是不是合理。实现见第 8 节的 `flow.py`。
- 费用中心里没有失败扩容留下的未支付订单：v1 的 116 次失败都在下单前就被拒了。
- 代码：`scripts/v-storage/`（`autogrow.py` v2、`flow.py`、`tc.py`、`policy.json`），单元 `systemd/v-disk-autogrow.*`、`systemd/v-storage-flow.*`，安装脚本 `scripts/install-v-storage.sh`（带 `--dry-run`），测试 `tests/v-disk-autogrow.test.py`（13 项）、`tests/v-storage-flow.test.py`（8 项）。在 V 上 dry run：下一档 640 GiB，补差价约 24 元。

---

## 0. 一页结论

1. **自动扩容从来没有成功过，从设计上就付不了钱。**数据盘是包年包月盘，扩容要补差价。`v-disk-autogrow` 用的 CAM 子用户有 `lighthouse:ResizeDisks` 权限，云审计里这一步权限校验是通过的；但这个子用户没有支付权限（调用余额接口时返回 `finance:trade` 无权）。11-18 那次 200→400G 是 Tianyi 在控制台付的 42 元。11-25 03:05 第一次真正触发扩容就失败了，之后每 30 分钟重试一次，到 11-27 12:35 已失败 116 次。失败告警本身也没发出去，后来告警调用被从脚本里删掉了。
2. **两块盘都在一周内会满。**根分区剩 37G，白天每小时掉约 0.7G。数据盘剩 50G（87%），过去 7 天每天 +6～7G，增长来自夜班成片。两块盘合计每天净增约 12～15 GB。
3. **硬盘钱其实不多，真正的成本是一次次停摆和人工清理。**数据盘高性能云硬盘 0.35 元/GB/月，400G 是 140 元/月；COS 归档约 0.03 元/GB/月，便宜 10 倍以上。即使所有数据都放在高性能盘上，1 TB 也只要 350 元/月。所以方案优先保证**全自动、不再手动处理**，省钱排第二。
4. **推荐的四层结构：**

   | 层 | 放什么 | 介质 | 单价（元/GB/月） |
   |---|---|---|---|
   | T0 系统盘 | 系统、运行时、在线数据库 | 套餐自带 SSD 540G，不能单独扩 | 已含在套餐内 |
   | T1 数据盘 | 会增长的温数据：Codex 会话、夜班近期项目、work 归档、已交付成品 | 高性能云硬盘，**修好的**自动扩容，加备份 | 0.35 |
   | T2 COS 冷归档 | 超过保留期的成片、旧项目、旧备份 | 新开一个普通 COS 桶（新加坡），按生命周期 标准→归档→深度归档 | 约 0.12→0.03→0.012 |
   | T3 备份 | 系统盘镜像、数据盘备份、冷归档的第二份 | Lighthouse 镜像 + 数据盘备份（备份点或 restic 到 COS） | 见第 7 节 |

5. **关于 Cloudflare Worker + R2 的直觉：我建议冷数据用 COS，不用 R2。**V 到同地域 COS 走腾讯内网，不占 60 Mbps 公网出口，流量免费，而且 COS 有归档和深度归档两档。R2 没有归档档位（最便宜 $0.01/GB/月，约 0.07 元），上传要走公网出口，和模型请求抢带宽。R2 加 Worker 适合「对外分享、被很多人下载」的成品：R2 出口免费，Worker 可以生成带签名的下载链接。它适合放在交付环节，不适合做冷归档。
6. **数据盘到今天还没有任何备份**：备份点配额是 0，没有快照。系统盘镜像只留 3 天。

---

## 1. 现状盘点

### 1.1 盘与资源

| 资源 | 类型 | 大小 | 计费 | 备注 |
|---|---|---|---|---|
| 实例 `lhins-89f5exr5`（V - Base） | Lighthouse 通用型 16C64G，60 Mbps | — | 包年包月，到期 2027-08-18，手动续费 | 套餐刊例价 1400 元/月；含每月 10 TB 流量，本期已用约 0.58 TB |
| 系统盘 `/dev/vda2` | CLOUD_SSD | 540G（ext4 532G） | 随套餐 | **不能单独扩容**，只能升级套餐（10/21 从 380 升到 540 就是这样做的） |
| 数据盘 `lhdisk-n2q8rj3e` → `/dev/vdb` | CLOUD_PREMIUM（高性能云硬盘） | 400G（ext4 394G） | 包年包月，按月自动续费，到期 2026-12-06 | 续费 140 元/月；**只能扩不能缩**；单盘上限 4000G，步长 10G；备份点配额 0 |
| 对象存储 `/lhcos-data` | **Lighthouse 轻量对象存储**（cosfs 挂载） | 用量很小 | 按量 | 不区分存储类型、**不支持生命周期**，单价约 0.022 USD/GB/月，比普通 COS 标准存储还贵 |
| 系统盘镜像 | Lighthouse 自定义镜像 | 3 份每日 + 1 份事故镜像 | 地域 5 个免费，超出 0.01 元/小时/个 | 免费额度剩 1 |

数据盘的挂载点：`/srv/openclaw-data/disk1`，另有 bind 挂载 `~/.cache/openclaw`、`~/.openclaw/nightshift/instances`、Workboard 备份目录、`workspace/.delivered-on-disk1-20261118`（只读）。

IO 负载（sar，11-26 全天）：vda 平均利用率 13%，峰值 35%；vdb 平均 2%。两块盘都远没到性能上限。

### 1.2 现有机制

| 机制 | 做什么 | 实测状态 | 问题 |
|---|---|---|---|
| `v-disk-autogrow.timer`（每 5 分钟） | 数据盘超过 85% 或可用少于 30G 持续 15 分钟后，每档 +100G，上限 600G | **11-25 起每次失败** | 见第 2 节；代码在 `codex/v-data-disk-autogrow` 分支（a3139c20），没合入 dev，V 上的版本 11-25 06:37 被人改过 |
| `v-daily-image.timer`（05:20） | 系统盘在线镜像，留 3 份 | 正常，每天成功 | 只能回到 1～3 天前；不含数据盘 |
| `v-storage-governance.timer`（04:00） | 校验 bind 挂载、清理夜班只读快照残留、清理包缓存 | 正常（11-07 修好后），但近 9 天 actions=[] | 只管缓存；水位到 critical 也不做别的 |
| `openclaw-storage-lifecycle.timer`（04:40） | 把 Workboard 备份打包传到 lhcos；每天对 `work`、`output-alt`、`~/.openclaw/agents`、`nightshift` 做一次 `du` 记账 | 正常 | 只归档 Workboard 备份。每天对 `agents` 和 210G 的 nightshift 做递归 `du`，本身就是一笔 IO |
| `v-session-archive.timer`（05:50） | 在库里把 7 天前的夜班子会话标记为归档 | 正常 | 只是逻辑归档，库文件不会变小 |
| systemd-tmpfiles | `/tmp` 3 天、`workspace/tmp` 按 cm:14d | 正常 | — |
| 夜班保留期 `NIGHTSHIFT_RETENTION_DAYS=3` | 完成 3 天后删中间媒体 | 正常 | **成片永久留在数据盘**，这是数据盘的主要增长 |
| `v-sentinel`（每 2 分钟） | 根分区 <60G、数据盘 <20G、6 小时速率预测 24 小时内写满、临时目录大文件 | 在报（disk_low_root 已持续触发） | 只报不处理；会话预算 makaron 68.3/51.5 GB，warn 模式，早就超了 |
| 手工：`/root/archive-to-data.sh` | work 里 14 天没动的目录 rsync 到数据盘，原位置留软链 | 11-23、11-27 各跑过一次（44G + 10G） | 不在 git 里，靠人记得跑 |

### 1.3 占用拆分

**系统盘（已用 474G，可用 37G）**

| 位置 | 大小 | 增长 | 访问模式 |
|---|---|---|---|
| `~/.openclaw/agents/makaron/agent/openclaw-agent.sqlite` | 51.1G | 约 +2～3 GB/天 | 热，在线库，随机读写 |
| `…/agent/codex-home/sessions/2026/` | 28G（11 月 22G、10 月 4.8G、9 月 1.6G） | +1.4～2.4 GB/天（11-23～26） | 按天分目录的 rollout；当月热，往前基本只有恢复旧线程时才读 |
| `…/agent/codex-home/thread_history_1.sqlite`、`state_5.sqlite` | 10.3G + 4.3G | 随会话增长 | 热 |
| `~/.openclaw/agents/makaron/sessions`（迁 SQLite 之前的遗留记录） | 14G | 0 | 冷；10/16 Tianyi 定「留在原目录」 |
| `~/.openclaw/agents/v-codex` | 7.2G | 0（10/22 起没有写入） | 冷 |
| `~/.openclaw/media`（inbound 15G） | 18G | 慢 | 7 天内温，之后基本冷 |
| `~/.openclaw/browser` | 9G | 慢 | 热（含登录态） |
| `workspace/work` | 75G | 每天新增项目，靠人工搬走 | 14 天内热，之后冷 |
| `workspace/tmp`、`media`、其他 | 54G | — | tmp 有 14 天规则 |
| `/srv/openclaw-data/output-alt`（`workspace/output` 的软链目标） | 51G | +1 GB/天 | 交付后基本冷 |
| `/srv/openclaw-data/disk/openclaw-storage` | 23G | 0 | 冷（5～6 月存量） |
| `/var`（containerd 7.7G、v-work-assets 备份 8.8G、v-voice-candidates 4.9G、日志 3.3G） | 27G | 慢 | 冷或可删 |
| `/home/openclaw` 其他（.cache 11G、src 9G、.local 7G…） | 约 50G | 慢 | 混合 |
| `/tmp` 11G、`/opt` 9G、`/usr` 9G、swap 文件 10G | — | — | — |

**数据盘（已用 326G，可用 50G）**

| 位置 | 大小 | 增长 | 访问模式 |
|---|---|---|---|
| `openclaw/nightshift-instances` | 185G（11 月 136G、10 月 44G、9 月 6G） | **+6.7 GB/天**（11-20～27） | 进行中热；完成 3 天后只剩成片，交付后冷 |
| `work-archive` | 69G | 随手工搬迁 | 冷，路径仍被软链引用 |
| `openclaw/delivered-output-20261118` | 41G | 0 | 冷，但 message 工具要能读（只读 bind 挂载） |
| `openclaw/output-alt` | 18G | 0 | 冷 |
| `openclaw/backups` 7.9G、`recovery` 4.7G、`cache` 1.4G | — | — | 冷或缓存 |

**增长曲线**（`openclaw-storage-lifecycle` 每天 04:4x 记录，GB）：

| 日期 | agents | nightshift（含数据盘） | output-alt | work | 根分区可用 |
|---|---|---|---|---|---|
| 11-01 | 71.1 | 122.1 | 58.3 | 42.7 | 72.9 |
| 11-10 | 77.6 | 109.9 | 64.6 | 72.5 | 79.9 |
| 11-17 | 100.1 | 130.5 | 82.2 | 95.8 | 60.9 |
| 11-24 | 109.9 | 175.4 | 49.0 | 80.1 | 75.3 |
| 11-27 | 123.8 | 210.7 | 53.8 | 77.3 | 43.7 |

agents 11-24～27 每天 +4.6 GB（库约 +2.5，Codex rollout 约 +2）。nightshift 每天 +5～7 GB。work 因为人工搬走所以看起来持平，实际每天新增 2～5 GB。

---

## 2. 现有机制的缺陷

### 2.1 自动扩容为什么失败

时间线：

- 11-18 Tianyi 在控制台把数据盘从 200G 扩到 400G，补差价 42 元（控制台报价页，Codex 会话）。同一天装上 `v-disk-autogrow`，策略是 400→500→600。
- 11-25 02:50 使用率超过 85%，15 分钟后（03:05）触发 `ResizeDisks(500)`，返回 `FailedOperation.ResizeDisksFailed`。
- 云审计记录这次调用：`errorMessage: "permission verify"`、`errorCode: 0`，也就是 CAM 权限校验通过，失败发生在之后的下单阶段。磁盘的 `LatestOperation` 仍然是 11-18 那次成功的扩容，说明失败的请求根本没进到磁盘操作。
- 用同一组凭据查账户余额，返回 `UnauthorizedOperation.CamNoAuth … (finance:trade)`。

结论：**包年包月盘扩容会生成一张补差价订单，要用账户余额支付。调用方是没有支付权限的子用户，所以订单无法支付，接口只报通用的 ResizeDisksFailed。**参数（盘 ID、500G、步长 10G、上限 4000G）、配额和盘的上限都不是原因。账户余额是否充足，这组凭据查不到，要 Tianyi 在控制台看一眼。

另外五个问题：

1. **失败重试没有退避**：每 30 分钟重新下一次单，到现在 116 次。请 Tianyi 到费用中心「订单管理」看看有没有一堆未支付订单需要取消。
2. **失败告警发不出去**：`openclaw message send` 返回 1，告警本身又抛异常。11-25 06:37 有人把告警调用从 V 上的脚本里删掉了。所以两天里没人收到任何通知，只有哨兵的「根分区不足」在报。
3. **V 上的代码和 git 分叉**：分支没合入 dev，V 上那份又被手工改过。
4. **凭据放在 agent 能读到的地方**：凭据从 `~/.openclaw/.env` 读取，openclaw 用户（也就是 V 的 agent）能读。要是给这组凭据加上支付权限，V 的 agent 就能花钱。
5. **策略太保守**：上限 600G、每次只扩 100G。按每天 +7G 的速度，600G 一个月就用完。

### 2.2 结构性问题

- **系统盘不能单独扩容**，而会增长的大头在系统盘上：在线库约 +2.5 GB/天、Codex 会话约 +2 GB/天、work 每天 2～5 GB。不论怎么清理，系统盘都会以每天 5～8 GB 的速度被吃掉。
- **数据盘只进不出**：夜班成片、work 归档、已交付成品搬上去以后就再也没离开过，没有任何一类数据有下一层可去。
- **清理靠人**：10/14、10/17、10/27、11/07、11/18、11/23、11/27 共 7 轮手工清理或搬迁，每轮都重新盘点一遍。
- **软链方案有隐患**：work 里留了 1385+967 个指向数据盘的软链。message 工具拒绝发送软链指向的附件（11-18 实测）。Codex 列线程时可能不跟随软链。
- **备份是单点**：数据盘零备份；系统盘镜像只有 3 天，事故第 4 天才发现就回不去；删除镜像的权限和 Gateway 用的是同一组凭据。
- **lhcos 选错了产品**：轻量对象存储没有归档档位和生命周期，比普通 COS 标准存储还贵。挂载参数是 `public_bucket=1`（匿名访问），要核实这个桶的读写权限是不是公开的。

---

## 3. 数据分类与去向

原则：**每一类数据只有一个归属层和一条明确的下一站**；任何删除之前，先归档并完成校验。

| # | 数据 | 现在在哪 | 去向 | 规则 |
|---|---|---|---|---|
| 1 | 操作系统、运行时、`/opt` 当前版本 + 上一版 | 系统盘 | T0 保留 | 旧发布版本只留最新 2 个，更早的删除 |
| 2 | 在线库：makaron 会话库、Codex `state`/`thread_history`、workboard、nightshift.sqlite、记忆库 | 系统盘 | T0 保留 | 不移动。源头减量另开线程（见第 9 节） |
| 3 | Codex rollout `codex-home/sessions/` | 系统盘 28G | **T1**：整个目录 bind 挂载到数据盘（不是软链） | 需要一次 Gateway 停机窗口；超过 180 天的月份再复制一份到 T2 |
| 4 | 遗留 `agents/makaron/sessions`、`agents/v-codex` | 系统盘 21G | **T1** bind 挂载，路径不变 | 尊重 10/16「留在原目录」的决定：路径不变，只换底层盘；COS 再存一份 |
| 5 | `workspace/work` 项目 | 系统盘 75G | 14 天没动 → T1（自动化现有脚本），180 天没动 → T2 | 软链改为每个项目一条 bind，或保留软链；T2 之后原位置留 `ARCHIVED.md` 说明取回方式 |
| 6 | `output-alt`（系统盘 51G + 数据盘 18G）、`/srv/openclaw-data/disk/openclaw-storage` 23G | 两块盘 | 30 天以上 → T2；整个目录挂到 T1 | 已交付清单能证实的直接进 T2 |
| 7 | 夜班实例 | 数据盘 185G | 进行中及完成 30 天内留在 T1；30 天以上的整项目打包进 T2，本地删除 | 由 v-nightshift 仓库实现（成片保留策略），这里只定规则 |
| 8 | 已交付成品 `delivered-output-20261118` | 数据盘 41G | T1 保留（message 工具要直接读）；COS 里已有 7.2G 副本，其余补一份到 T2 | 90 天后只留 T2 |
| 9 | 入站媒体 `~/.openclaw/media/inbound` | 系统盘 15G | 30 天以上 → T2 然后本地删除 | 不用官方 `attachments.ttlHours`（上限 7 天、要重启）；用自己的定时任务 |
| 10 | 发版/升级整库备份（`/var/lib/v-upgrade-*`、`/var/backups/*`） | 系统盘 | 直接写到 T1，文件名带到期日；7 天后自动删，需要长期保留的进 T2 | 治理 10/14、10/17、10/27 三次重犯的问题 |
| 11 | `v-work-assets` 9/30 备份 8.8G、`recovery` 4.7G | 两块盘 | T2 深度归档，本地删除 | 事故证据，长期保留 |
| 12 | 缓存：pnpm/npm、HF/whisper 模型、夜班只读快照残留 | 两块盘 | 原地，自动清 | 已有 governance；模型缓存不动 |
| 13 | `/tmp`、`workspace/tmp` | 系统盘 | 删除 | 已有 3d / cm:14d |
| 14 | 日志：journald、syslog | 系统盘 | 删除 | journald 限 2G；rsyslog 压缩或关掉重复的 syslog |
| 15 | dealclaw 容器镜像 7.7G、`v-voice-candidates` 4.9G、`/home/openclaw/src` 旧 worktree、浏览器 profile 旧备份 | 系统盘 | **待 Tianyi 确认后删除** | 列在第 6.2 节 |

目标水位：系统盘可用 ≥150G（约 25%），只放第 1、2 类和热的 work。数据盘可用 ≥ max(25%, 30 天增长量)。

---

## 4. 热数据：存储选型与自动扩容

### 4.1 选型

| 选项 | 单价 | 结论 |
|---|---|---|
| 高性能云硬盘 CLOUD_PREMIUM（现在的数据盘） | 0.35 元/GB/月；年付 83 折 | **T1 用它。**温数据的 IO 很低（vdb 平均利用率 2%） |
| SSD 云硬盘 CLOUD_SSD | 1.10 元/GB/月 | 只有在线库确实需要搬出系统盘时才用：单独一块 100～200G 的 SSD 数据盘，110～220 元/月 |
| 升级套餐换大系统盘 | 套餐差价 | 不推荐：贵，而且每次都要走变更配置 |
| CBS / CVM 云盘 | — | Lighthouse 实例挂不了 CBS，不适用 |

### 4.2 自动扩容 v2

1. **专用身份**：新建一个只用于扩容的 CAM 子用户。策略只允许 `lighthouse:ResizeDisks`、`DescribeDisks` 和 `InquirePrice*`（资源限定到这块盘），加上订单支付所需的最小财务权限（需要 Tianyi 在 CAM 里确认确切的策略名），以及只读查询余额。凭据放在 `/etc/v-disk-autogrow/credentials`（root 600），**不放进 openclaw 能读的任何文件**，Gateway 环境里那组凭据保持不变、不加支付权限。
2. **触发条件**：可用少于 max(25%, 未来 21 天的预计增长) 持续 15 分钟。增长速度取 7 天滑动值。每次扩到「可用 ≥ max(30%, 45 天增长量)」，按 10G 取整。不再固定 +100G。
3. **花钱上限**：上限 1200G（约 420 元/月）。每次扩容前先 `InquirePrice` 查价，单次超过 100 元或当月累计超过 200 元就停下来，等 Tianyi 批准。达到上限也停下来等批准。
4. **余额与配额预检**：每天 09:00 只读检查账户余额能否支付「下一次扩容 + 下次续费」，不够就提前 7 天告警。每天用 `DescribeDisksDeniedActions` 确认 ResizeDisks 不在被拒列表里。
5. **失败处理**：同一个错误码失败后按 1h、4h、24h 退避；第一次失败就告警，告警里带错误码和 RequestId。连续 3 次失败就停手，直到人工清除状态。
6. **扩文件系统**：云盘容量变化后执行 `resize2fs` 并核对块数（沿用现有实现）。
7. **告警通道**：走哨兵直连飞书的那条路（不经过 Gateway，见 `scripts/v-sentinel`），不用 `openclaw message send`。
8. **代码进 git**：`ops/v-disk-autogrow/`，从 `codex/v-data-disk-autogrow` 改写，单测覆盖支付失败、退避、上限、余额不足四条路径，在 dev 合入后用安装脚本部署，加进 `release-drift` 漂移哨兵。

**另一种做法（如果 Tianyi 不想给任何程序付款权限）**：autogrow 只负责「算好该扩多少、查好价、提前 7 天在飞书里发一张带价格的卡片」，由 Tianyi 在控制台点付款，付完由程序自动扩文件系统。代价是每次都要人点一下，但随着冷数据分流出去，大约每 1～2 个月才需要点一次。

---

## 5. 冷数据归档

### 5.1 COS 还是 R2

| | 腾讯云 COS（新加坡，同地域） | Cloudflare R2 |
|---|---|---|
| 存储单价 | 标准约 $0.016（≈0.12 元）、低频约 0.09 元、**归档约 0.03 元、深度归档约 0.012 元**/GB/月（刊例价，以控制台为准） | 标准 $0.015、低频 $0.01/GB/月；**没有归档档位** |
| V 上传 | **内网**（`cos.ap-singapore.myqcloud.com` 在 V 上解析到腾讯内网地址），流量免费，不占 60 Mbps 公网 | 走公网出口，和模型请求抢 60 Mbps；套餐内流量充足，不另收钱 |
| 取回 | 标准/低频立即可读；归档 1～5 分钟（快速）或 3～5 小时；深度归档 12～48 小时；按 GB 收取回费 | 立即可读，出口免费 |
| 最短存储期 | 低频 30 天、归档 90 天、深度归档 180 天 | 低频 30 天 |
| 生命周期 | 支持按天数转档位、过期删除、版本、对象锁定（WORM） | 支持过期删除、转低频 |
| 适合 | **冷归档、备份** | **对外分享、下载量大的成品**（配 Worker 发签名链接） |

结论：

- **冷归档和备份放普通 COS 桶**（新加坡，不放 lhcos）。原因是内网免费、有深度归档档位、能做对象锁定。
- **R2 加 Worker 留给交付环节**：如果以后客户要从链接下载大量成片，可以把「对外下载」放到 R2，用 Worker 签发有时效的链接。这跟冷归档是两件事，这次不做。
- 现有 lhcos 桶不再写入新数据；里面的东西迁到新桶以后，可以考虑退订。

### 5.2 桶与生命周期设计

- 桶 `v-archive`（新加坡，私有读写，开版本控制）：
  - 前缀 `archive/<类别>/<YYYY-MM>/…`：先以标准存储写入，30 天转归档，180 天转深度归档。归档类数据不设过期。
  - 前缀 `backup/…`：备份用，规则见第 7 节。开对象锁定，锁 14 天，任何凭据都删不掉锁定期内的对象。
- 写入凭据只允许 Put/Get/List/Head，**不允许 Delete**；删除和改生命周期只留给 Tianyi 的主账号。
- 小文件先打包：每个项目或每个月打成一个 `tar.zst`，避免几十万个小对象带来的请求费和取回慢。同时生成清单 `manifest.jsonl`（路径、大小、mtime、sha256），清单本身也存一份到 COS 标准层。

### 5.3 带宽

V 的 eth0 上有一条 55 Mbit 的 cake 整形（9/21 为了不让大上传饿死模型请求而加）。它对**所有**出站流量生效，包括去 COS 内网的流量。11-18 COS 迁移只有约 55 Mbit/s，原因就在这里。方案：在 cake 前给腾讯内网段（COS 内网地址段）加一条直通规则，内网上传就不受整形限制，也不会碰公网出口。这个改动单独提交、单独验证，在验证完之前，归档任务限速 20 MB/s，并且只在 02:00–07:00 跑。

---

## 6. 清理与保留策略

### 6.1 统一归档器 `v-archive`（新，进 git）

所有「搬走 + 删本地」都走同一个程序，不再每次写一次性脚本：

1. **选**：按第 3 节的规则从配置里挑候选（路径白名单、最后修改时间 mtime/ctime（不看 atime，11/07 已证实递归搜索会刷新 atime）、没有被进程打开（一次读完 `/proc/*/fd`）、不含指向别处的 `..` 软链）。
2. **打包**：`tar --xattrs` 并保留纳秒 mtime 和 chattr 保护位，再用 `zstd -T1` 压缩，`ionice -c2 -n7`（不用 `-c3`，数据盘上会被夜班 IO 饿死）。
3. **上传**：分片上传，带 Content-MD5；对比 COS 返回的 `x-cos-hash-crc64ecma` 和本地计算值。
4. **校验**：从 COS 下载回来，解包列表与本地清单逐行比对，每个包抽查 sha256。
5. **删除**：等 24 小时冷静期，期间路径没有再被写入，才删除本地；原位置留 `ARCHIVED.md`（写明对象路径和取回命令）。
6. **回执**：每批写 `/home/openclaw/backups/storage-maintenance/archive-<日期>.tsv`，同时上传到 COS。
7. **取回**：`v-archive restore <路径>`：先恢复对象（归档档位），再下载、校验、放回原路径。

### 6.2 保留期（建议值，需拍板）

| 类别 | 本地保留 | 之后 |
|---|---|---|
| 夜班实例（完成后） | 中间媒体 3 天（已有）；成片 30 天 | 进 COS 归档 |
| work 项目 | 14 天在系统盘 → 180 天在数据盘 | 进 COS 归档 |
| output-alt / 已交付成品 | 30 天 / 90 天 | 进 COS 归档 |
| 入站媒体 | 30 天 | 进 COS 归档 |
| Codex rollout | 全部在数据盘 | 超过 180 天的月份再复制一份到 COS |
| 发版/升级备份 | 7 天 | 自动删；需要长期保留的进 COS |
| journald | 2G | — |
| `/tmp`、`workspace/tmp` | 3 天、14 天（已有） | 删 |
| 系统盘镜像 | 7 份 | 见第 7 节 |
| 一次性可删（第一批，需确认）：dealclaw 容器镜像 7.7G、v-voice-candidates 只留最近 10 个、`/home/openclaw/src` 旧 worktree、`/opt` 旧版本、浏览器 profile 10/07 旧备份 | — | 删除（先 mv 到 trash 目录，3 天后删） |

---

## 7. 备份

| 对象 | 现状 | 方案 | 费用 |
|---|---|---|---|
| 系统盘 | 每日镜像留 3 份 | **留 7 份每日**（v-daily-image.py 改参数）。超出免费额度的每份 0.01 元/小时 | 约 +22～29 元/月 |
| 数据盘 | **零备份** | 方案 A：Lighthouse 云硬盘备份点，每天轮转 2 个点，恢复快，能整盘回滚。方案 B：每晚 restic 增量备份到 COS `backup/`（低频存储，保留 14 天每日 + 8 周每周），可以按文件取回 | A：400G 盘 2 个点询价 88 元/月；B：约 300G × 0.09 ≈ 27 元/月 |
| 冷归档 | 只有一份 | COS 开版本控制 + 对象锁定；归档本身是第二份（本地删除之前已经校验过） | 包含在 T2 内 |
| 删除权限隔离 | 镜像删除权限在 Gateway 的凭据里 | Gateway 那组凭据去掉 `DeleteBlueprints`；COS 写入凭据不给 Delete | 0 |

推荐数据盘用**方案 B**：便宜，能按文件取回，备份放在另一个产品里，盘坏了或被误删都能恢复。如果 Tianyi 更看重「一键整盘回滚」，就选 A，或者 A 和 B 都上。

---

## 8. 监控与告警（只在出问题时叫醒）

全部并入 `v-sentinel`，走直连飞书通道，同一问题 24 小时只报一次，恢复时报一次：

| 检查 | 阈值 | 动作 |
|---|---|---|
| 系统盘可用 | < 100G 预警，< 60G 告警（已有 60G） | 列出过去 24 小时增长最快的 3 个目录（读 lifecycle 的记账，不现场扫盘） |
| 数据盘可用 | 低于 autogrow 触发线而且 1 小时内没有扩容成功 | 告警 |
| 写满预测 | 按 7 天速率，系统盘 14 天内写满、数据盘 7 天内写满（扩容到上限后） | 告警 |
| autogrow | 第一次失败；连续 3 次失败停手；花费到上限等待批准 | 带错误码和报价的卡片 |
| 余额/续费 | 余额 < 下次扩容 + 下次续费；数据盘到期前 7 天 | 告警 |
| 归档任务 | 失败；校验不一致；48 小时没有成功运行 | 告警 |
| 备份新鲜度 | 系统盘镜像 > 36 小时；数据盘备份 > 36 小时 | 告警 |
| 会话预算 | 现在已超但只是 warn | 改成每周报一次趋势，不每天报 |

例行的成功和统计只写日志，不发消息。

### 8.1 流转监控 `flow.py`（已实现）

每天 09:30 跑一次，读的都是现成的数字：两块盘的 statvfs、在线库的文件大小、storage-lifecycle 早上 `du` 的分类大小、昨天一天的 Codex rollout 目录，以及各个搬运程序留下的回执（`work-archive-*.tsv`、`/var/lib/v-archive/receipts.jsonl`、governance 的 `deletions.jsonl`）。不会扫大目录。

- 每天往 `/var/lib/v-storage-flow/history.jsonl` 写一行：三层的用量、分类大小、当天各层之间搬走和删掉的字节数、月成本（数据盘用 autogrow 查到的真实续费价，COS 按各档位刊例价，镜像按超出免费额度的个数）。
- 出问题才告警（同一个问题 24 小时只报一次，恢复时报一次）：
  - 系统盘按 7 天的速度 14 天内会写满，告警里附上增长最快的三个分类；
  - 数据盘按 7 天的速度 14 天内会到自动扩容上限，这说明冷数据没有及时流走；
  - 在 `policy.json` 的 `movers` 里登记过的搬运程序 48 小时没有成功运行；
  - `drain` 里登记过、本该被搬走的分类在系统盘上每天仍涨超过 1 GB；
  - 月成本超过预算（默认 450 元）；
  - autogrow 30 分钟没有上报状态，或者报错、已暂停。
- **每周一发一条存储周报**：三层用量、7 天的速度、7 天的流转量、增长最快的分类、月成本与预算的对比。这是 Tianyi 要的「看流转是否健康」，可以在 `policy.json` 里用 `weekly_report` 关掉。
- 归档程序（P2）上线时，把它登记到 `movers`，把它负责的分类登记到 `drain`，监控就会开始盯着它。

---

## 9. 成本估算（元/月）

| 项 | 现在 | 方案稳态（3 个月后） | 不改的话 3 个月后 |
|---|---|---|---|
| 套餐（含系统盘 540G SSD） | 1400（刊例，已预付到 2027-08） | 1400 | 1400 |
| 数据盘高性能云硬盘 | 140（400G） | 约 210～280（600～800G） | 约 450～550（1.3～1.6T：每天 +12～15 GB 全落数据盘） |
| COS 冷归档 | ≈0（lhcos 用量很小） | 约 15～30（0.5～1 TB，大部分在归档/深度归档） | 0 |
| 数据盘备份 | 0 | 约 27（方案 B）或 88（方案 A） | 0 |
| 系统盘镜像 | 0 | 约 22～29 | 0 |
| **存储合计（不含套餐）** | **约 140** | **约 280～420** | **约 450～550，而且每月继续 +100 左右** |

另外，如果在线库的增长没有压下来，3 个月内系统盘也会满。到时要么升级套餐，要么单独买一块 SSD 数据盘放在线库（200G 约 220 元/月）。所以**源头减量**（会话库里内嵌的 base64 图片、整段老会话重写导致的写放大，见 `docs/v-disk-governance.md` 4.2 节）值得另开一条线。它省下的空间比任何清理都多。

---

## 10. 分阶段落地

| 阶段 | 内容 | 前提 | 回滚 |
|---|---|---|---|
| **P0 止血**（今天/明天） | ①Tianyi 在控制台把数据盘扩到 600G（补差价约 20 元，按到期日折算，以控制台报价为准），并取消失败留下的未支付订单（如果有）；②停掉 v-disk-autogrow.timer，免得它继续每 30 分钟下单；③第一批一次性删除（第 6.2 节最后一行，约 20G）；④在 Gateway 停机窗口里把 Codex rollout（28G）和遗留会话（21G）用 bind 挂载搬到数据盘；⑤`output-alt` 和 `openclaw-storage` 中超过 30 天的部分（约 60G）搬到数据盘 | Tianyi 付款 + 批准删除清单 + 允许一次重启 | bind 挂载：卸载后原目录还在（先复制、校验，再清空原目录，原目录内容在 trash 留 3 天） |
| **P1 自动扩容 v2** | 第 4.2 节：专用 CAM、退避、上限、余额预检、哨兵告警、进 git | Tianyi 建子用户并授权（或选「只报价不付款」那条路） | 停 timer；旧脚本留在 V 上作对照 |
| **P2 COS 归档** | 开 COS 桶、生命周期、`v-archive` 程序、cake 内网直通；第一批：v-work-assets、recovery、openclaw-storage、9～10 月夜班成片（约 100G） | Tianyi 开通 COS 桶（按量付费） | 本地删除前有 24 小时冷静期；删除后可从 COS 取回 |
| **P3 备份** | 每日镜像改 7 份；数据盘方案 A 或 B；凭据删除权限隔离 | 选 A 还是 B | 去掉 timer 即可 |
| **P4 保留期自动化** | 把第 6.2 节的规则做成 `v-archive` 配置并每天跑；夜班成片 30 天规则交给 v-nightshift 仓库；work 14 天规则替换 `/root/archive-to-data.sh` | 拍板保留期 | 把配置里的类别关掉 |
| **P5 源头减量** | 会话库增长、Codex rollout 体积（另开线程） | — | — |

每一步都遵守 AGENTS.md：先在本仓库分支开发、测试，候选验证后再由 Tianyi 批准合入 dev，从 dev 部署。

---

## 11. 需要 Tianyi 拍板或付费的点

1. **P0 付款**：数据盘扩到 600G（约 20 元补差价），以及在费用中心检查并取消未支付订单。也可以只扩到 500G。
2. **自动扩容要不要能自己付钱**：A 专用子账号 + 支付权限 + 花费上限（推荐）；B 只报价、发卡片，由人点付款。另外定上限（建议 1200G）和单次/当月花费上限（建议 100/200 元）。
3. **冷归档开普通 COS 桶**（按量付费，稳态每月几十元），lhcos 停止写入；同意冷数据不走 R2。
4. **数据盘备份**：方案 A（备份点 88 元/月）、B（restic 到 COS，约 27 元/月）或都要。系统盘镜像 3→7 份（约 +25 元/月）。
5. **保留期**（第 6.2 节）：夜班成片本地留 30 天、入站媒体 30 天、work 180 天后进 COS，是否同意。
6. **一次 Gateway 停机窗口**：把 Codex rollout 和遗留会话 bind 挂载到数据盘（路径不变）。
7. **第一批一次性删除清单**：dealclaw 容器镜像、旧语音候选、旧 worktree、旧 dist、浏览器旧备份。
8. **lhcos 桶的访问权限**：挂载用的是匿名方式，需要在控制台确认这个桶不是公有读写。
9. **源头减量**另开一条线，查清会话库每天 +2～3 GB 的来源。

---

附：本轮使用的只读命令与接口（便于复核）

- `df`、`lsblk`、`findmnt`、`systemctl cat/list-timers`、`journalctl -u v-disk-autogrow|v-storage-governance|v-daily-image`、`iostat`、`sar -d`
- 对具体子目录做 `ionice -c3 nice -n19 du -xh --max-depth=1`
- 腾讯云：`lighthouse DescribeDisks / DescribeInstances / DescribeDiskConfigs / DescribeDisksDeniedActions / InquirePriceRenewDisks / InquirePriceCreateDisks / DescribeInstancesTrafficPackages / DescribeBundles / DescribeDiskBackups / DescribeSnapshots`，`cloudaudit LookUpEvents`（EventName=ResizeDisks），`billing DescribeAccountBalance`（无权限）
- 价格参考：COS 存储类型与最短存储期 <https://cloud.tencent.com/document/product/436/53482>、取回 <https://cloud.tencent.com/document/product/436/53862>、流量 <https://cloud.tencent.com/document/product/436/53863>、国际站刊例价 <https://www.tencentcloud.com/pricing/cos>；Lighthouse 云硬盘价格 <https://cloud.tencent.com/document/product/1207/73452>、扩容计费 <https://cloud.tencent.com/document/product/1207/102432>、扩容限制 <https://cloud.tencent.com/document/product/1207/102433>；轻量对象存储 <https://www.tencentcloud.com/zh/document/product/1103/78314>、<https://www.tencentcloud.com/zh/document/product/1103/78319>；R2 <https://developers.cloudflare.com/r2/pricing/>
