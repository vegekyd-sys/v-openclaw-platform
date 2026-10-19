# Bounded sharing reads candidate

Status: rebuilt on V's live bytes on 2026-10-17 (see "Rebase on V's current bytes"
below); the original three-arm comparison is kept as history. Not on V, not on shared
VLab. Shared Gateway integration acceptance remains pending.

## Problem and scope

The live sharing lookup performs one exact native read per selected session.
The existing bulk-cache alternative avoids those reads when the full metadata
cache is valid, but a cold cache or another SQLite connection's COMMIT rebuilds
all session metadata even for a small selected page. A prior native A/B found
clear small-page regressions; fewer SQL statements alone did not prove improvement.

This candidate changes only the synchronous `sessions.list` sharing phase:

- Use the existing canonical resolver to discover the requested lookup keys and
  all candidate stores. Resolve real matches and cross-store duplicates through
  that same resolver after loading; the planning pass does not authorize access.
- Prepare a request-local cache for both the live warm-exact and existing bulk
  cache modes. This does not require deploying the previous sharing policy chunk.
- Reuse a valid native metadata snapshot without filling a missing/stale cache.
- Otherwise read only requested nodes and their participants in chunks of 400,
  using the original JSON/owner/participant projection and canonical checks.
  Nodes and participants share a native deferred SQLite read transaction.
- Preserve missing, invalid-row and transcript-window tombstone handling, and
  the original caller's read-error degradation. A persisted row with no parsed
  cached entry must go through the original invalid/tombstone validation.

The cache is constructed and consumed in the same synchronous phase after the
async session-selection stage. Point mutation authorization, its revalidation
after awaits, member reads, aliases, role policy and event broadcast are unchanged.
There are no schema migrations, scheduler, concurrency, admission or FTS changes.

## Review and replay

`patch-session-sharing-bounded-reads.mjs` contains all transformations.
`session-sharing-bounded-reads-plan.json` binds the four release chunks to their
captured predecessor SHA256 values. Capture baseline code with official
`vlab.mjs read-code`, then run the build script against that captured directory;
never patch the shared runtime in place.

Local checks:

```sh
npx --yes --package=node@22.23.1 node --test \
  lab/session-sharing-bounded-reads.test.mjs \
  lab/exact-sharing-lookup.test.mjs \
  lab/canonical-scan-path-cache.test.mjs
```

Native replay uses `session-sharing-bounded-reads-candidate.json` through the
official candidate runner, only after the shared owner clears the disk budget.
It does not require a lease and does not start a Gateway or call a model. The
snapshot script copies selected metadata tables with full JSON and real native
schemas, not transcripts or credentials. Source/copy table hashes must agree.

The candidate compares live exact reads, the previous dev bulk-cache variant,
and bounded reads on the same private snapshot at 25/100/500/2000 selected rows,
with warm/cold metadata, the native list prelude, and a real external COMMIT
between prelude and sharing. It also compares native permission results and
member revocation after await, native alias ownership, rollover proof rejection,
and repeated page reads while an independent SQLite writer keeps committing.
Each comparison must resolve all requested real rows and match complete native
targets; zero/empty results are not a pass.

This is sharing-stage evidence. It cannot establish complete RPC latency,
Feishu delivery, model/tool time, or responsiveness with twelve business agents.

## Native result (2026-10-17)

Candidate `candidate-c1c9cc2b-59aa-4269-a955-05a22569c57b` used runtime
`1496f7d693b00056d3777c777aa6fe23d13f2e6308885593f515bcdac9c93d7e` and
input `fba4cc17166cd1bf12ffb3bc394ae769256dd4c008afa027ca1f78c3e19a7c0f`.
The source metadata snapshot contained 4254 native sessions (173371392 bytes).
All 32 three-arm comparisons resolved every selected real row and agreed on full
targets and permission projections. 1522 permission projections, native alias
ownership, member revocation after await, rollover, missing rows and a corrupt-row
valid-sibling fallback passed. The shared Gateway PID/config/runtime stayed unchanged.

Sharing-stage measurements (milliseconds, two separate samples per static regime):

| Page / regime | Current live exact | Unpromoted dev bulk | Bounded |
| --- | ---: | ---: | ---: |
| 25, cold | 16–28 | 715–752 | 8.5–10.7 |
| 25, prelude + external COMMIT | 17.9–22.5 | 734–763 | 15.8–22.7 |
| 500, cold | 351–493 | 797–924 | 159–175 |
| 500, prelude + external COMMIT | 350–419 | 809–851 | 184–198 |
| 2000, warm | 1279–1285 | 58–70 | 152–195 |
| 2000, prelude + external COMMIT | 1319–1370 | 863–962 | 599–622 |

In the cold bounded arm, native node rows materialized exactly matched the selected
page size (25/100/500/2000); warm arms read zero node rows. No measured bounded page
fell back to per-row or whole-store reads. The native list prelude is additional
time and is reported separately in the data; this table is not full RPC latency.

A genuinely independent SQLite connection repeatedly updated a native-created
private session's normalized timestamp and JSON, outside the selected page, during
six reads per arm. All arms returned identical page contents and observed real
data_version changes. Median sharing time: live/bulk/bounded was 30/740/6ms at25,
410/833/172ms at500, and 1172/789/484ms at2000. Observed writer rates ranged about
108–117 commits/s; there is no business-throughput conclusion from this small test.

The bounded design retains a deliberate tradeoff: large purely warm pages are
slower than the unpromoted bulk-cache alternative (which has clear cold/churn
regressions), while remaining substantially faster than the current live exact
reader. One 25-row inter-stage-COMMIT sample was22.72ms versus22.49ms live; this
is not a claim that every individual sample improved. No twelve-business-agent
or user-visible delivery acceptance is implied.

Sanitized exact measurements and assertion results are checked in at
`lab/experiments/session-sharing-bounded-20261017.json`. Runtime chunks/test inputs
remain the same as the tested implementation commit; later evidence documentation
does not change candidate inputs.

## Rebase on V's current bytes（2026-10-17/18）

#403 合入 dev 时的 4 个发布文件按旧字节构建。之后 #404 改了 entry、#418 改了
sessions-read，直接按旧产物发布会整文件覆盖掉 #404 的子代理按 key 读和 #418 的
lifecycleOnly 分支。现在用同一个补丁脚本在 V 线上字节上重建：

| 文件 | before（= V 线上，`ssh v` db91.6 core/dist） | after |
| --- | --- | --- |
| session-accessor.sqlite-transcript-state-Cz9g7S9v.js | 792b1c75…（未变） | 2583a789… |
| session-accessor.sqlite-entry-BlklNPKQ.js | a15b1426…（含 #404） | 789fca01… |
| session-utils-store-Dlphca2N.js | 26adfeba…（未变） | b566c7e9… |
| sessions-read-C6mAMxyQ.js | 36c5a27b…（含 #418） | 2d2d0fb1… |

补丁只新增，不删 V 上已有的任何行；`oc64-session-races-v2`、
`subagent-lazy-session-store-v1`、`v-workboard-sweep-light-v1` 都保留，单测锁定。
`session-sharing-bounded-reads.test.mjs` 还从仓库里 #404、#418 的发布文件重放补丁，
结果必须与这 4 个文件逐字节相同。

### Candidate A/B（真实 sessions.list 处理器）

`session-sharing-rebase-candidate.json` → `candidate/session-sharing-rebase-ab.mjs`。
A 臂是 candidate runtime 原样（断言 4 个文件 = V 线上字节），B 臂是它的硬链接副本，
只替换这 4 个文件；两臂各自起进程，读同一份私有元数据快照（makaron 4301 个会话，
不含 transcript 和凭据）。直接调用 `sessions.list` 处理器，用原生 diagnostics
timeline 的 span 边界计时和计数 SQL。

Candidate `candidate-a4ab58da-00c2-41a1-b726-a5e77f7119f6`，输入
`f5bf23ff0272e16846c3de1c03785d2711ec7f63453f0101cc283a9dad4db525`，runtime
`7a796c8c…`（共享 VLab = V + #383，#383 不涉及这 4 个文件），共享 Gateway PID 不变，
零模型调用，零共享写入。结果明细在 `experiments/session-sharing-rebase-20261017.json`。

**结果一致性**：9 种调用方（管理员、带 profile 的管理员、两个真实创建者、fixture
owner、alias、member、外人、无 profile 的只读）× 7 种参数（limit 50、全量、
lifecycleOnly、involvingMe、ownerFirst、offset、configuredAgentsOnly），加 7 个
“另一连接在选行之后、共享解析之前提交”的用例（把 shared 改成 draft、撤销 member、
无关提交）。共 70 个用例，两臂各跑两轮，逐行摘要完全相同（只排除响应外层的 `ts`
时钟）。覆盖到 admin/owner/member/viewer 四种角色，外人看不到 draft，中途撤销触发了
原生的行修复重查（sharing span 两次）。

**性能**（每格 10 个样本的中位数；sharing = 原生 `gateway.sessions.list.sharing`
span，同步、即主线程占用；节点行 = 该 span 内读出的 session_nodes 行数）：

| 场景 | V sharing | 重建 sharing | V 节点行 | 重建节点行 | V 整个处理器 | 重建整个处理器 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| admin, 25 行，安静 | 604 ms | 8.4 ms | 4301 | 25 | 1278 ms | 635 ms |
| admin, 500 行，安静 | 619 ms | 127 ms | 4301 | 500 | 1365 ms | 863 ms |
| admin, 全量 834 行，安静 | 656 ms | 205 ms | 4301 | 834 | 1494 ms | 965 ms |
| admin, 25 行，中途提交 | 639 ms | 11.1 ms | 4301 | 25 | 1347 ms | 647 ms |
| admin, 全量，中途提交 | 690 ms | 220 ms | 4301 | 834 | 1515 ms | 995 ms |
| admin, 25 行，持续写入 | 653 ms | 7.8 ms | 4301 | 25 | 1386 ms | 672 ms |
| admin, 全量，持续写入 | 684 ms | 226 ms | 4301 | 834 | 1490 ms | 1006 ms |
| 外人, 全量，持续写入 | 709 ms | 219 ms | 4301 | 833 | 1524 ms | 1006 ms |
| admin, 全量 lifecycleOnly | 0（跳过） | 0（跳过） | 0 | 0 | 786 ms | 760 ms |
| 真实创建者, 全量 lifecycleOnly（有过滤，不走轻路径） | 660 ms | 220 ms | 4301 | 833 | 1455 ms | 971 ms |

在 V 现在的代码里，共享解析每次调用都会重读整库 4301 行，与页大小无关。重建后只读
所选页。lifecycleOnly 的管理员调用在两臂都不进入 sharing、不调用 placement，结果
相同；带过滤的调用方传了 lifecycleOnly 也照常走完整路径，这和 #418 的设计一致。
持续写入用另一个 SQLite 连接每 5 ms 提交一次，写法与原生访问器相同（JSON 和
`entry_valid=1` 在同一事务内）。

**不覆盖**：只测了处理器本身，没有起 Gateway、渠道和模型；VLab 机器上的绝对时间不能
直接换算成 V；没有覆盖并发 RPC。共享 Gateway 集成验收和上 V 需要单独授权。
