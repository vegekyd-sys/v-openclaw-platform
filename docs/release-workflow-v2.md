# V 发版流程 v2：从"打补丁"到"推版本"

状态：提案
体检时间：2026-09-23 01:2x CST
体检对象：生产 V（`VM-8-2-ubuntu`）、共享 VLab（`VM-0-4-ubuntu` / `vlab91`）、`vegekyd-sys/v-openclaw-platform`

---

## 0. 一句话结论

"每次发版都是准备一个补丁包上去打"不是习惯问题，是**结构上没有别的选择**：生产 V 上跑的 75 个
被改过的运行时文件里，有 32 个在整个仓库里找不到对应字节。也就是说**今天没有任何构建过程能重建
生产**，所以只能拿着补丁上去对着线上改。

先把"生产可重建"这件事补上，"worktree → dev → main、main 就是线上"才是可达的；否则改分支策略
只是把同一个手工补丁换了个地方放。

下面每个数字都是这次实测的，取证命令附在第 7 节。

---

## 1. 现状体检：四个断层

### 断层一 — 发布产物不是构建出来的，是手工改出来的

生产 gateway 实际跑的是：

```
/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/index.js
V_RELEASE_VERSION=v2026.9.1-db91.6
```

拿它和同机上的 9.1 基线 `/opt/openclaw-2026.9.1-v/openclaw/dist` 逐字节比：

| 项 | 数量 |
| --- | --- |
| runtime 目录文件总数 | 8613 |
| 两边都有、字节不同 | **61** |
| 只有生产有（新增文件） | **14** |
| 补丁面合计 | **75** |
| 其中字节能在仓库里找到的 | 43 |
| **仓库里完全找不到的** | **32** |
| 另有：历史补丁留下的 `.bak`/`.predeploy-*` 残留 | 20 |

完整清单在 `release/captured/v2026.9.1-db91.6/manifest.json`（`alsoInRepo: null` 的就是找不到的那些），
典型的有 `run-session-target-D4dx7X-Q.js`、`talk-DkFuKRod.js`、`session-accessor*`、`db91-read-ahead.mjs`、
`versa-cron-shared-management-v1.mjs`。

**这 32 个文件只存在于那台机器上。** 机器没了它们就没了；想回滚到"上周那个版本"也无从谈起。

顺带查出来一件事：作为对照基线的 `/opt/openclaw-2026.9.1-v/openclaw/dist` **自己也带着 12 个
`.bak` 残留**，所以它并不是干净的上游 9.1。上面这 75 个是"相对那个已经被动过的基线"的差异，
**相对真正的上游只会更多**。

### 断层二 — "不可变发布目录"在原地被改

`db91-release-v2026.9.1-db91.6/` 建于 2026-09-15 08:33，但目录里有 **12 个 dist 文件在它创建之后
被改过**：

```
2026-09-17 11:45  session-sharing-BlMqwMBH.js
2026-09-17 21:42  tasks-DNVtnKlS.js / task-summary-qdovVAE7.js
2026-09-18 21:32  dreaming-phases-C5ItPb99.js / memory-core-host-engine-sessions-CAnvQ_5o.js
2026-09-22 22:16  builtin-openclaw / dispatch-from-config / openclaw-tools /
                  question / realtime-session-harness / talk-DkFuKRod.js
```

外加 **13 个 `.bak` / `.pre-*` 残留**留在同一个目录里（`vlab-shared-instance-traps` 第 8 条已经证明
过：这类残留本身会进整目录指纹，把发布通道堵死）。

后果是 release ID `v2026.9.1-db91.6` 和它记录的 git commit `f9f4a4b`（2026-09-15）**已经不描述线上
跑的东西**。release 目录里确实带了一份 `source/` 的 git checkout，HEAD 干净指向 dev 上的 `f9f4a4b` ——
但那只覆盖 platform 仓库这一半，core 的 dist 被改了 12 次，checkout 一无所知。

### 断层三 — systemd 层也在叠补丁

`openclaw-gateway.service` 有 **25 个 drop-in**，其中 **5 个各自完整覆盖 ExecStart**：

```
90-openclaw91.conf                          → /opt/openclaw-2026.9.1-v/openclaw
zzzzz-db91-process-global-writer-v2.conf    → …db91.2/core
zzzzzz-db91-memory-fts-v3.conf              → …db91.4/core
zzzzzzz-db91-writer-transaction-scope-v5.conf → …db91.5/core
zzzzzzzz-db91-state-db-fastpath-v6.conf     → …db91.6/core   ← 当前生效
```

谁生效靠**文件名前面加几个 `z`** 决定。还留着一个 `zzzzzz-db91-memory-fts-v3.conf.staged` 残留。
下一次发版的动作是"再加一个 z"。

好消息：这次核对过 `systemctl show -p ExecStart` 和实际进程 cmdline 一致，暂时没有"改了 unit 没重启"
的埋雷。但这个结构注定迟早会有。

### 断层四 — `main` 已经不代表任何东西

| | commit | 日期 |
| --- | --- | --- |
| `origin/main` | `a59a02d` | **2026-08-23** |
| `origin/dev` | `e2ea468` | 2026-09-19 |
| 生产 core 对应 | `f9f4a4b`（在 dev 上） | 2026-09-15 |
| 生产 Night Shift 对应 | `d962aea`（在 dev 上） | 2026-09-18 |

`main` 落后 dev **1032 个提交**，而且**有 1 个提交不在 dev 上**（已经分叉了）。

好消息：查过了，那个孤立提交 `a59a02d` 加的两个文件（`scripts/apply-workboard-owner-concurrency-patch.mjs`
和它的测试）在 dev 上都存在，而且 dev 的版本是它的**严格升级版**（`d96ccbe fix(workboard): upgrade prior
owner concurrency patch`）。所以 **main 可以安全地重置到 dev，没有内容损失**。

### 附带发现 — dev 本身也没有闸门

`main..dev` 的 1032 个提交：

| 方式 | 数量 |
| --- | --- |
| 走 PR 合入 | **6** |
| 本地 `git merge codex/xxx` 直接合 | 197 |
| 直接提交在 dev 上（无分支） | 437 |

`AGENTS.md` 写着"Develop changes on a dedicated branch and worktree"，实际执行率约 3%。

CI（`.github/workflows/vlab-static.yml`）只在 `pull_request` 和 `push: main` 触发。**推 dev 不跑 CI，
而 main 从 8/23 起没动过** —— 等于这条 CI 对日常开发基本不生效。

### 附带发现 — 生产在跑的代码，有一部分连 GitHub 都没上

`~/vlab-dev` 的本地 `dev` 比 `origin/dev` **多 73 个未推送的提交**，其中包含小何 H5 语音、
`/vds`、`codex/talk-owner-terminal` 这几条线 —— 而这些**已经部署在生产 V 上**
（对应 dist 里 2026-09-22 22:16 那批改动）。

也就是说：生产正在跑的一部分代码，它的源码提交只存在于一台 Mac 上，既不在 GitHub，也不在任何服务器。
这比"main 落后"严重一个量级，所以它被排成 P0 的第 0 件事。

另有 20 多个只在本机的分支，其中一半还停在 `a59a02d`（8/23 的 main），是历次 worktree 留下的空壳。

### 附带发现 — 体检过程中，生产被原地改了一次

01:35 做第一次哈希、01:55 做第二次，中间 20 分钟里生产的 release 目录变了：

```
改动  ./control-ui-DhD7PO_6.js
新增  ./control-ui/assets/volcengine-rtc-4.68.1.esm.js
新增  ./control-ui/assets/volcengine-rtc-managed-room-client.js
新增  ./control-ui/assets/control-ui-boot-chat-DWTSrxxk-rtc-v4.js
```

没有 tag、没有 release ID、没有 PR。这不是在举例说明问题 —— 这是在写这份文档的过程中真实发生的一次。
第 4.4 节的哨兵正是为了让这种事在一小时内被点名。

### VLab 和 V 的差距，现在就在漂

两边都自称 2026.9.1：

| 项 | 数量 |
| --- | --- |
| 共同 dist 文件 | 6749 |
| **字节不同** | **23** |
| 只有 VLab 有 | **15** |
| 只有 V 有 | 0 |

数据侧更明显：VLab 的生产数据镜像是 **2026-09-10 01:27 做的一次性 overlayfs 快照**（lower 15G），
**没有任何刷新定时器**，到今天 13 天没更新，upper 层已经累积 294M 的独立写入。

叠加 `vlab-fidelity-gap` 里已经量化的硬件差距（VLab 4 核 15G + CPU 配额封顶 vs V 8 核 30G 无配额），
"VLab 过了"这句话现在能证明的范围比大家默认以为的小很多。

---

## 2. 已经做对的那条线：Night Shift

这件事不需要从零发明 —— **仓库里已经有一条合格的发布线**，只是没被推广：

```
/home/openclaw/releases/nightshift-workboard/<commit-sha>/    ← 按 commit 命名
/home/openclaw/releases/nightshift-workboard/current  →  d962aea   ← 原子符号链接
                                        current/RELEASE_COMMIT = d962aea…   ← 自证身份
```

`scripts/package-nightshift-release.sh <commit>`（2026-10-02 起在 `vegekyd-sys/v-nightshift`，由它的 `scripts/ship.sh` 调用）用 `git archive` 从 commit 构建，写入
`RELEASE_COMMIT`，输出 tarball 和 sha256。`d962aea` 确实在 `origin/dev` 上。

**这就是目标形态。** core 那条线要做的，是被拉到同一个模型里来。

Night Shift 线唯一的欠账是没清理：**89 个发布目录、3.9G**，而生产根分区已经 88%（剩 44G）。

---

## 3. 目标状态

### 3.1 分支模型（回答你的问题）

```
claude/xxx · codex/xxx        一个变更一个 worktree + 分支
        │  PR（强制）+ CI 必过 + review
        ▼
      dev                     集成分支。VLab 只部署 dev 上的 commit
        │  发版 PR（dev → main），正文带 manifest + VLab 验收证据
        ▼
      main                    = 生产 V 正在跑的东西
        │  合入后打 tag
        ▼
   tag v2026.9.1-db91.7       tag 名 == 线上 V_RELEASE_VERSION
        │
        ▼
      部署                     从 tag 构建产物 → 原子切 current → 哨兵确认无漂移
```

四条硬规则（要靠机器执行，不靠自觉）：

1. **dev 和 main 都开分支保护**，禁止直接 push，必须 PR。这一条直接消灭 437 次直接提交。
2. **CI 触发改成 `pull_request` + `push: [dev, main]`**。
3. **main 上每个 commit 必须有 tag**，tag 名就是线上的 `V_RELEASE_VERSION`。
4. **`origin/main` 的 HEAD 必须能重建生产**（见 3.2），由哨兵每小时校验（见 4.4）。

紧急热修允许先上后合，但必须当天补 PR 到 dev 再挑到 main —— 这是 `merge-before-deploy` 已经定过的规矩，
这里只是给它一个可检查的落点。

### 3.2 产物模型：唯一发布单位是 commit，不是补丁包

仓库里放一份 `release/manifest.json`（跟着 main 走）：

```jsonc
{
  "release": "v2026.9.1-db91.7",
  "openclaw": {
    "upstream": "2026.9.1",
    "fork": "github.com/<private>/openclaw-versa",
    "commit": "<fork sha>"            // 源码化的补丁
  },
  "runtimeFiles": [                    // 尚未源码化的存量，按字节固定
    { "target": "dist/db91-read-ahead.mjs", "source": "runtime/db91-read-ahead.mjs", "sha256": "…" }
  ],
  "nightshift": { "commit": "d962aea…" },
  "node": "22.23.1",
  "configSchema": "…",
  "systemd": { "dropIn": "systemd/gateway/10-release.conf" }
}
```

`scripts/build-release.sh <tag>` 从 manifest 产出一个 tarball + sha256，**同一个 tag 必须产出同一个 sha**。
部署只接受这个 tarball，不接受任何单文件。

---

## 4. 要改的六件事

### 4.1 先把生产捞回仓库（前置，其他都依赖它）—— **已落地**

2026-09-23 已完成第一次捞取：`release/captured/v2026.9.1-db91.6/`，75 个文件 5.2M，
`scripts/capture-production-runtime.mjs` 生成，`scripts/verify-release-reproducible.mjs` 双向校验
（仓库侧 0 缺失、线上侧 0 漂移）。**"生产不可重建"这件事到此为止。**

接下来把这 75 个按来源分两类消化：

- **能在 openclaw 源码里表达的**（`run-session-target`、`session-accessor` 这类）→ 进 fork，一个补丁
  一个 TS commit。
- **本来就是我们自己的运维脚本**（`db91-read-ahead.mjs`、`versa-cron-shared-management-v1.mjs` 这类
  preload/旁路模块）→ 进仓库 `runtime/`，由 manifest 按 sha256 引用。

这一步不追求优雅，先把"生产不可重建"变成"生产可重建但不优雅"。
消化进度就看 manifest 的 `counts.capturedOnly`：**它要归零。**

### 4.2 fork 线推上去，成为唯一产物来源

这条已经验证过一层（`openclaw-upgrade-strategy-source-fork`）：本机 `~/openclaw-versa` 分支
`versa/2026.9.5` 构建通过、打包通过，在 `vlab91:/srv/versa-rehearsal` 上 9.1→9.5 迁移 1s、回滚 29s
逐字节一致。

**但它现在只在本机、没 push** —— 一台 Mac 就是单点。第一步就是推到私有仓库。

之后：4.1 里源码化的补丁一个一个 rebase 上去，`pnpm build` 出 dist，`build-release.sh` 打包。
到这一步，"补丁包"这个概念就消失了 —— 产物是从 tag 构建的。

### 4.3 发布目录真正不可变 + drop-in 归零

```
/opt/openclaw/releases/v2026.9.1-db91.7/     部署后 chmod -R a-w，属主非部署用户
/opt/openclaw/current  →  releases/v2026.9.1-db91.7     原子符号链接切换
```

ExecStart **固定写 `/opt/openclaw/current/dist/index.js`，以后永不改**。

25 个 drop-in 合成 **1 个由仓库生成的 `10-release.conf`**（其余环境变量按需合并进去，仓库里有源文件）。
"再加一个 z" 这个反模式从此没有入口。

切换前要处理 `vlab-companion-units-stop-with-gateway` 那条：`Requires=` gateway 的伴随单元
（VLab 的 `nightshift-vlab-production-mirror`）会被带停不自动拉起，部署脚本要显式重启并探活。

### 4.4 漂移哨兵（**性价比最高的一条，建议第一个做**）

V 上已经有常驻哨兵的机制（`v-on-host-sentinel`，systemd 每 2 分钟、告警直发飞书不经过 Gateway）。
加一个 `scripts/v-drift-check.sh`，每小时跑，检查四条：

1. 当前 gateway 进程的 ExecStart == manifest 声明的路径；
2. release 目录整目录指纹（逐文件 sha256 **含文件名**，`.bak` 残留也算）== manifest 清单；
3. `RELEASE_COMMIT` / `V_RELEASE_VERSION` 对应的 commit 在 `origin/main` 上；
4. drop-in 目录的文件集合 == 仓库里声明的集合。

任一不符 → 飞书告警，写清楚**哪个文件、什么时候被改的**。

这条上线之后，**"上去打个补丁"这个动作会在一小时内被点名**，不需要靠纪律维持。它同时也是整件事的
度量：**漂移告警连续 30 天为 0 = 流程真的正规化了**。

它还是只读的，今天上线零风险。

### 4.5 VLab 数据定期从 V 重建

你提的"定期做 V 的备份给 VLab"值得做，但要说清它买到的是什么：

**能修的**：数据体量、文件形态、累积垃圾这一类失真。`gateway-memory-findings` 里 9/16 那次生产大卡
（15.4GB sessions 目录触发全量扫描）在 VLab 上**从构造上无法复现**，就是这类。

**修不了的**：资源、并发、内存曲线、长时稳定性。VLab 是 4 核 15G + CPU 配额封顶，V 是 8 核 30G 无配额；
同样 4 轮重负载，VLab GC 后驻留 399MB、生产 1031MB。这类结论 **VLab 只能证伪不能证真**，数据同步
改变不了。

建议做法：

- **每周一次**（周日 04:00 低峰）从 V 做一致性快照 → 推 VLab → 重建 overlayfs 的 lower 层，
  upper 层丢弃。VLab 还有 75G，生产 state 16G 量级，留 2 份够用；保留策略要写死，别重演
  `vlab-candidate-baseline-disk`（每 release 1.4G 撑爆磁盘挡住所有人 stage）。
- **快照内容**：agents sqlite、sessions、memory 索引、nightshift 数据。
  **不含**凭据、token、飞书/企微配置 —— 这是 `v-release-protocol` 的硬边界，VLab 必须用自己的。
- **sqlite 用 `.backup` 或停写后 `cp --reflink`**，不要热拷。
- **配套（同样重要）**：VLab 验收报告改成**机器生成**，自动带上本次的硬件规格、数据快照日期、覆盖边界。
  `vlab-fidelity-gap` 里已经指出过：问题不是没人知道差距，是这条纪律没有传导到验收表述里，
  之后普遍简写成"回归通过"。

另外建议**把两种 VLab 用途分开**，别再混用共享实例：

| 用途 | 实例 | 数据 |
| --- | --- | --- |
| 功能 / 回归验收 | 共享 `db91-parity` | 每周重建的生产快照 |
| 升级 / 回滚演练 | 独立实例（`versa-rehearsal` 那种，9/22 已跑通） | 每次从快照重建，用完即焚 |

`vlab-shared-instance-traps` 里记的那些"把共享实例弄挂、堵死所有人发版"的事故，基本都来自两种用途
挤在一个实例上。

### 4.6 清理欠账

- Night Shift：89 个发布目录 3.9G，生产根分区已 88%。保留最近 10 个 + 当前 + 上一个已知良好。
- `/opt/openclaw-experiments/` 3.9G，14 个历史 db91 release 目录（含 2 个 `failed-preflight` 残留）。
  归档到 `/opt/openclaw-backups` 或删，只留 current 和 last-known-good。
- 13 个 `.bak`/`.pre-*` 残留 + 1 个 `.conf.staged`，在 4.3 切换时一并清掉。

---

## 5. 分期落地

### P0 — 本周，完全不动生产

| # | 事 | 判据 |
| --- | --- | --- |
| 0 | **先把 `~/vlab-dev` 上 73 个未推送的 dev 提交推上 GitHub** | `git log origin/dev..dev` 为空 |
| 1 | ✅ 把生产 75 个补丁文件全量捞回仓库，补齐缺失的 32 个 | ✅ `verify-release-reproducible.mjs` 仓库侧 0 缺失、线上侧 0 漂移 |
| 2 | 漂移检查接进 V 上已有的 `v-sentinel`（独立的每小时 timer，不挤 2 分钟那条） | 人为改一个线上文件，1 小时内收到飞书告警 |
| 3 | dev / main 开分支保护；CI 触发加 `push: [dev, main]` | 直接 push dev 被拒 |
| 4 | `git tag main-archive-20260923 a59a02d`，然后把 main 重置到 dev | main == dev；`git diff a59a02d main` 无内容损失（已核对，dev 是严格升级版） |
| 5 | fork `~/openclaw-versa` push 到私有仓库 | 不再是单点 |

P0 做完，"生产可重建 + 漂移可检测 + main 有意义"三件事就位，后面才有地基。

### P1 — 两周内

| # | 事 | 判据 |
| --- | --- | --- |
| 6 | `release/manifest.json` + `scripts/build-release.sh` 落地 | 同一个 tag 连续构建两次，sha256 相同 |
| 7 | core 改成 `releases/<tag>` + `current` 符号链接；25 个 drop-in 收敛成 1 个 | ExecStart 指向 `current` 且以后不再变 |
| 8 | **走一次完整的 dev → PR → main → tag → 构建 → 部署**，内容可以很小 | 全链路通；哨兵在部署后报 0 漂移 |
| 9 | 清理 Night Shift 89 个发布目录和 `/opt/openclaw-experiments` 历史 | 根分区回到 80% 以下 |

第 8 条是核心：**先把链路走通，再往里放真东西。** 第一次不要挑重要的变更来走。

### P2 — 一个月内

| # | 事 | 判据 |
| --- | --- | --- |
| 10 | 每周 V → VLab 数据快照流水线 | 快照日期自动出现在验收报告里 |
| 11 | VLab 验收报告机器生成，强制带覆盖边界 | 报告里不再出现裸的"回归通过" |
| 12 | 4.1 里的补丁逐个源码化进 fork | `runtimeFiles` 列表单调递减 |
| 13 | 升级列车：跟上游最多落后 1–2 版，用独立实例演练 | 9.5 上线，演练脚本可重跑 |

---

## 6. 这套东西怎么改变你的体感

今天发一次版：手工准备补丁包 → 核对线上 sha（对不上要重建）→ stage → deploy → 祈祷没覆盖别人的修复
（`release-artifact-rebase-trap` 记过一次真实的静默回退）。

P1 之后：

```bash
# 一个变更一个 worktree，PR 进 dev（CI 自动跑）
# VLab 上部署 dev 的某个 commit 验收
gh pr create --base main --head dev          # 发版 PR，正文贴验收证据
git tag v2026.9.1-db91.7 && git push --tags
scripts/build-release.sh v2026.9.1-db91.7    # 可重复构建，出 sha256
scripts/deploy-v.sh v2026.9.1-db91.7         # 原子切 current，失败切回
# 哨兵确认 0 漂移
```

回滚 = 把 `current` 切回上一个 tag。"线上跑的是哪个版本" = `cat /opt/openclaw/current/RELEASE`，
而且它一定能在 `origin/main` 上找到。

---

## 7. 取证命令（可复跑）

```bash
# 生产实际在跑什么（unit 声明 vs 实际进程，两者都要看）
ssh v 'systemctl show openclaw-gateway.service -p ExecStart --no-pager'
ssh v 'ps -eo pid,etimes,args | grep "openclaw.*gateway" | grep -v grep'

# 补丁面：生产 runtime vs 同机 9.1 基线
ssh v 'cd /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist && \
       find . -type f \( -name "*.js" -o -name "*.mjs" \) | sort | xargs sha256sum' > v.sha
ssh v 'cd /opt/openclaw-2026.9.1-v/openclaw/dist && \
       find . -type f \( -name "*.js" -o -name "*.mjs" \) | sort | xargs sha256sum' > base.sha
join <(awk '{print $2" "$1}' v.sha | sort) <(awk '{print $2" "$1}' base.sha | sort) \
  | awk '$2!=$3{print $1}'                      # → 59

# 发布目录被原地改过几次
ssh v 'find /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist \
       -type f -newermt "2026-09-15 09:00" -printf "%TY-%Tm-%Td %TH:%TM  %p\n" | sort'

# V vs VLab 漂移
ssh vlab91 'cd /srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw/dist && \
            find . -type f \( -name "*.js" -o -name "*.mjs" \) | sort | xargs sha256sum' > vlab.sha

# 生产 core 对应的 platform commit
ssh v 'd=/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/source; \
       git -C $d -c safe.directory=$d log -1 --format="%H %ci %s"'

# 分支纪律
git log --oneline origin/main..origin/dev --merges | grep -c "Merge pull request"   # 6
git log --oneline --no-merges --first-parent origin/main..origin/dev | wc -l        # 437
git -C ~/vlab-dev rev-list --count origin/dev..dev                                  # 73 未推送

# 捞取与校验（前两条读生产，只读；第三条不联网）
node scripts/capture-production-runtime.mjs --host v --release v2026.9.1-db91.6 \
  --runtime /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist \
  --base /opt/openclaw-2026.9.1-v/openclaw/dist --upstream 2026.9.1 \
  --sourceCheckout /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/source \
  --out release/captured/v2026.9.1-db91.6
node scripts/verify-release-reproducible.mjs \
  --manifest release/captured/v2026.9.1-db91.6/manifest.json --host v --unit openclaw-gateway.service
node scripts/verify-release-reproducible.mjs \
  --manifest release/captured/v2026.9.1-db91.6/manifest.json

# VLab 数据镜像的新鲜度
ssh vlab91 'sudo stat -c "%y %n" /srv/vlab-production-mirror/labs/instances/db91-parity/\
nightshift-fullmirror-20260910/lower/nightshift'
```

---

## 8. 相关记忆

`openclaw-upgrade-strategy-source-fork`（fork 线的地基，已验证一层）、
`vlab-fidelity-gap`（保真度差距的量化）、
`release-artifact-rebase-trap`（冻结产物的静默回退）、
`vlab-shared-instance-traps`（共享实例事故清单）、
`merge-before-deploy`（先合再上）、
`vlab-companion-units-stop-with-gateway`（重启带停伴随单元）、
`vlab-candidate-baseline-disk`（磁盘保留策略）、
`v-on-host-sentinel`（哨兵机制）。
