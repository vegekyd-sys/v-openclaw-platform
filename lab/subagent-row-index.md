# 会话行选子 agent run 时不再扫整个注册表

状态：Mac 单测和等价测试通过；VLab candidate A/B 未做；未合入，未上 VLab 或 V。

## 问题

Gateway 建每一个会话行（会话事件快照、列表、状态）时，`buildSingleRowSubagentRunIndex` 要把内存里的整个子 agent 注册表扫两遍：

- `loadSubagentRunTreeFromSqlite` 先把注册表整份复制，每一轮 BFS 扫一遍；
- 行构建再扫一遍，挑出这个会话闭包里的 live run。

V 内存里保留着 1.3–1.6 万个 run。

| 来源 | 数据 |
|---|---|
| V 2026-11-01 profile | `buildSingleRowSubagentRunIndex` 自耗时 1.0 s / 47 s |
| VLab run2 /vds c10 profile（1 ms 采样） | 行扫描自耗时 224 ms + 树加载 `read` 自耗时 232 ms，约 10 回合合计 456 ms，约每回合 45 ms |

这两项正好就是这里去掉的两次扫描。V 上只读量过：建行时的 SQL 加解析不到 1 ms。所以单行成本的大头就是这类 CPU。

## 改法

注册表的 Map 子类本来就在每条修改路径上维护按子会话 key 的索引，这次再加三样：

- 三个索引：trim 后的子 key、原样的 requester key、owner key（有 controller 用 controller，否则用 requester）；
- 每个 run 建索引时用的 key 都记下来，删除时按记录的 key 删，不依赖条目当前的字段；
- 一个插入序号，让选出的 run 按 Map 的迭代顺序返回。

用到的地方有两处：

- 树加载用 requester 和 owner 索引跟随闭包，不再复制注册表；
- 行构建从索引里取候选，按序号排好，再走原来的判断。

结果和扫描一样：同样的 run，同样的顺序。

前提是 requester 和 controller 在 spawn 或注册时确定、之后不原地修改，这和现有子 key 索引依赖的前提相同。源码里给 run 设 `controllerSessionKey` 的地方全是 spawn 或注册时新建条目。原地整体替换条目的地方（`publishCommittedRecords`、快照恢复）替换的是同一个 run 的已提交形态。

- **源码：** openclaw-versa `versa/subagent-row-index-lookup-20261108` @1422a7978de，基于 `versa/port-backlog-20261029`。
  - 新测试 `session-utils.subagent-row-index.test.ts`：有内存和只有持久化两种情况下，对 5 个 key 比较 `buildSingleRowSubagentRunIndex` 开关两侧的输出，结果相同；并断言走的是按树读的路径，没有退回整表。去掉改动后，索引那个用例失败。
  - 现有测试：注册表 700/700 通过；gateway `session-utils*` 435/438 通过。失败的 3 个在 `display-position`，不带这次改动时同样失败。
- **开关：** `OPENCLAW_V_SUBAGENT_ROW_INDEX=0`，每建一行时读取，打开即恢复两次扫描。

## 验证

`lab/subagent-row-index.test.mjs`：

1. 两个文件的 plan 都锁定了 V 的原字节和发布字节；list 分块导入的名字，store 分块都有导出。
2. 把发布文件里的注册表 Map 和查找函数原样取出单独运行，随机做 4,000 次 set、替换、删除、同对象重设（含首尾带空格的子 key、空 controller），每 50 步拿查找结果和扫描判断比一次，run 和顺序全部一致。

微基准：Mac、合成 1.6 万个浅对象，每行 0.28 ms 降到 0.005 ms。合成对象比真实条目小得多，所以绝对值以 VLab profile 为准。

## 待做

- 共享测量台 A/B：`AB_ENVS=OPENCLAW_V_SUBAGENT_ROW_INDEX`，/vds 和 Worker 都跑，c10。两种 harness 都建行，所以都会受益。
- 上线前：versa 合入 port-backlog 线；捕获 PR 映射 source-map；按线上字节重建（V 原字节 store `4bc27059…`、list `a6d40fb5…`）。
