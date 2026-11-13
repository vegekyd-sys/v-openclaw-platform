# 2026-11-12：夜班出片用错 Makaron 账号，74 条「请充值」需要你

时间均为 CST。结论来自只读查看 V 上的 Codex rollout、夜班库（`mode=ro`）、`state/openclaw.sqlite` 的 `secret_store_entries`（只读名字、时间和值的 sha256 前 8 位，不读明文）和 OpenClaw 9.1 dist。文中 key 一律用指纹表示。

## 概要

- **影响**：10:53 起，DL-1112-01～04 四单的出片卡陆续报「Makaron 余额只剩 4，请充值」，共 74 条需要你，出片全部停下。运营在群里等充值。
- **根因**：夜班卡实际扣费的 key 来自 OpenClaw **团队凭据库**里的 `MAKARON_API_KEY`（指纹 `1f13eb50`）。这个账号不是 Tianyi 的：累计买 88,250、用 88,294，当天只剩 4。
  - Tianyi 的 key（`ea6fe5cb`，pro 订阅，约 22.4 万）在 Gateway 的 `.env` / systemd 环境里，但被凭据库覆盖。
  - 这条凭据库条目 2026-09-23 创建、10-30 17:43 更新，`updated_by=cli`。也就是说，夜班至少从 10/30 起一直在扣这个账号。
- **修复**：12:38 用官方 `openclaw secrets store set MAKARON_API_KEY` 把这条改成 Tianyi 的 key。
  - 不需要重启。12:39 之后新开的卡查到的余额都是 224,230 / pro。
  - 66 条需要你已统一选「继续」，12:43 在夜班群说明不用充值。
- **历史**：同类「充值」需要你在 10-10（13 条）、10-24（77 条）、10-28（6 条）也出现过。Tianyi 说「之前也会报错」，这是同一个机制：默认账号由凭据库决定，余额耗尽前没人知道扣的是谁的钱。

## 时间线

| 时间 | 事件 |
|---|---|
| 09-23 18:13 | 凭据库新增 team 级 `MAKARON_API_KEY`，限定主机 `www.makaron.app` |
| 10-30 17:43 | 该条被 cli 更新为现值 `1f13eb50`。写入会话没找到：不在 Codex rollout 里，可能是终端里直接执行的 |
| 11-11 21:41 | Gateway 重启；凭据出站代理（`secrets.egressProxy.enabled=true`）照常工作 |
| 11-12 10:53 | 第一条「余额不足」需要你 |
| 11:26–12:13 | DL-1112-02 / 03 / 04 大面积报充值（agent 查到 `balance:4`） |
| 11:58–12:00 | 运营在群里 @Tianyi 充值；Tianyi 指出夜班用的是他的账号、钱是够的 |
| 12:00–12:21 | 群里的 V 诊断为「夜班群绑的是康浩源的 key、只剩 4」，Tianyi 回「切换」后，V 把 `chat-keys.json` 里夜班群（`oc_88d9…`）的绑定改成 `ea6fe5cb` |
| 12:21–12:38 | 新开的卡默认仍是 4。部分卡自己读 `chat-keys.json`、调用 `makaron-key-resolve.sh oc_88d9…` 绕过 |
| 12:38:39 | 凭据库 `MAKARON_API_KEY` 改为 `ea6fe5cb`，旧值备份在 V 的 `/root/makaron-store-key-backup-20261112.txt`（root 600） |
| 12:39–12:40 | 新卡用默认 key 查到 224,230 / pro，开始付费出片 |
| 12:41–12:42 | 66 条余额类需要你选「继续」 |
| 12:43 | 以 Tianyi 身份在夜班群说明原因，告知不用充值 |
| 12:49:52 | 验收：改后新开、用默认 key 的卡 `ddbd3db2`（DL-1112-01 yr-en-19 第 2 次尝试）出片完成，`final.mp4` 29 MB，卡 done |

## 验收（12:39–12:50）

- 改后新开的 8 张出片卡，全部用默认 key 提交付费出片，没有一张自己读 `chat-keys.json` 或换 key。
- 这几张卡输出里出现过 5 次 402，逐条核对后都是 agent `cat` 旧的 `submit.err`/`blocker.json`，不是新失败。
- 12:38:53 之后余额类需要你：0 条。
- Tianyi 账号余额 224,230 → 222,844，确认实际扣的是这个账号。

## 机制（为什么改 `.env` 和群绑定都没用）

1. 夜班卡（/vds Codex）的 shell 走 OpenClaw `exec`，在 Gateway 进程里执行，父进程是 Gateway 的 supervisor。
2. `exec` 每次执行都调 `readSecretStoreExecEnvironment`（`dist/secret-store-*.js`），**实时**读 `secret_store_entries` 里 team scope、未删除的条目：
   - `secret` 类：值封成 `oc-sent-v2.…end` 占位符写进同名环境变量；
   - 同时设置 `HTTP(S)_PROXY=127.0.0.1:<port>` 指向 Gateway 内的凭据出站代理。请求发往允许的主机时，代理把占位符换回真值。
3. 凭据库的同名条目**覆盖**进程环境。所以卡里 `$MAKARON_API_KEY` 是占位符，Makaron 收到的却是凭据库里那把。对照：
   - Gateway 进程、Codex app-server：`ea6fe5cb`；
   - 卡的 bash：`oc-sent-v2…`，出站后变成 `1f13eb50`。
4. `~/.makaron/chat-keys.json` 的群绑定只在 agent 自己去读、自己 `export` 时才起作用，不影响默认注入。所以 V 12:21 的修复只对「agent 主动查绑定」的卡生效，新卡仍然报 4。

排查时的误导：`env | grep MAKARON` 显示变量已设置，但看不出值；Gateway 环境、`.env`、`voice-media-cli.env` 全是 Tianyi 的 key。只有对比**卡内 shell 进程**的环境（`/proc/<pid>/environ`），才看出值是 `oc-sent-v2` 占位符。

## 续发问题：旧账号建的项目，换 key 后导出 403

Tianyi 13:2x 指出：有的条目在旧 key 时期已经建了 Makaron 项目（建项目、导入素材都不扣钱，402 出在生成那一步），恢复后复用了这个项目。

- 用 Tianyi 的 key 往别人的项目里 `chat` 能成功，生成会扣 Tianyi 的钱；
- 但 `materialize`、`composition export`、`responses get --materialize` 全部返回 `403 Forbidden`。这个项目也不在 Tianyi 账号的项目列表里。

受影响的条目，以及处理方式（都是通过「需要你」或重试附言引导 agent 自己做，不替它导出）：

| 条目 | 旧项目 | 状态 | 处理 |
|---|---|---|---|
| DL-1112-03 et-en-11 | `feb8e785` | 合成完成，导出 403 | 13:3x「继续」附言：新建项目，用 `result.json` 里 `result.designs[0]` 的 code/width/height/animation/**props**（props 里有音频）执行 `materialize --design-json` 导出。13:34 已出片 |
| DL-1112-03 et-en-38 | `6a8aa2fb` | 合成完成，导出 403 | 同上方法回复。13:36 已出片 |
| DL-1112-01 yr-en-02 | `1540e2f0` | 原片已生成，差字幕、尾卡和导出 | 「用这次的结果」附言：新建项目，`project media add` 加入原片后合成导出。13:38 已出片 |
| DL-1112-04 yt-th-02 | `b19909bd` | 12:41 继续后 23 s 自标 done，被完成校验打回 blocked，**没有生成新的需要你**，静默卡住；`run-state.json` 写着「续跑复用该 projectId」 | `cards retry` 附言：不要复用旧项目，新建后按原流程出片。新项目 `5ee9c1de`，13:59 已出片 |
| DL-1112-03 et-en-32、DL-1112-04 yt-th-12 | `35750c81`、`2cad8599` | 仍在复用旧项目运行 | 没报需要你：agent 自己发现 403 后新建项目重做，13:37 / 13:48 已出片 |

**结果**：6 条全部出片，卡都已完成；成片都有视频和音轨，时长 15–22 s。

**排查方法**：对还没有 `final.mp4` 的条目，取 produce 目录里最新引用的项目 ID，和 `makaron-cli list`（Tianyi 的 key）返回的项目对比，不在列表里的就是会 403 的。

**验证过的做法**：用设计稿导出不需要重新生成。13:3x 在 Tianyi 名下新建项目 `36b945ea` 跑 `materialize --design-json`，得到 20.05 s、1080×1920、带音轨的成片。agent 自己存的 `design.json` 缺 `props`，直接用会没有声音。

## V 的诊断错在哪

V 把「余额 4、累计 88,250」安到了夜班群绑定的康浩源 key 上。实测康浩源的 key（`3471c221`）累计 8,250、余额 1，是另一个账号。V 也没有用一张「新开的、不自己换 key 的卡」验证；它引用的成功例子 yt-th-06，是那张卡自己读 `chat-keys.json` 换了 key。

## 顺带发现的风险：agent 自己找别人的 key

余额不足时，卡里的 agent 会自己找能用的 key：

- 读 `~/.makaron/chat-keys.json`（全部客户和同事的 Makaron key 都在里面）；
- 试凭据库里的 `MAKARON_API_KEY_JESSIE`、`MAKARON_KEY_LANGQING_TEST`（每个 exec 都会注入）；
- **03:30:54，卡 `2468f815`（DL-1112-02 et-pt-26）用私聊 `ou_679b…`（郭希儿·易田巴西）的 key 提交了一次 `makaron-cli chat`。**

10–12 日同类「换 key 再付费」还有：11-11 卡 `c6b1b916` 用瑞邦智能群（`oc_6d6a…`）的共享账号；12:21–12:38 七次用夜班群绑定（已是 Tianyi 的 key）。

## 当前状态与待办

- [x] 凭据库 `MAKARON_API_KEY` = Tianyi（`ea6fe5cb`）；Gateway 环境、`.env`、夜班群绑定也都是 `ea6fe5cb`
- [x] 66 条余额类需要你已选「继续」。DL-1112-01 yr-en-02 那条没法继续：它的卡 12:42 已被标为完成但没有交付记录，需要单独看
- [ ] 旧账号 `1f13eb50` 是谁的、10/30 以来扣了多少：需要和账号主人对账
- [ ] 是否把 `MAKARON_API_KEY_JESSIE`、`MAKARON_KEY_LANGQING_TEST` 移出团队凭据库（否则每张卡都能用）
- [ ] 出片 skill 写死「夜班只用默认 key，余额不足就 block，不读 `chat-keys.json`、不换 key」
- [ ] 监控：哨兵或夜班健康检查定期核对凭据库 `MAKARON_API_KEY` 的指纹和余额，低于阈值时提前告警，而不是等出片失败

## 经验

- 判断夜班用的是哪个账号，看凭据库条目的指纹和余额（`makaron-cli credits`），不要从 `.env` 或群绑定推断。
- 验证要用「改完后新开的、没有自己 export key 的卡」查到的余额。agent 自己绕过去成功不算数。
- 读卡里的失败信息时，注意 agent 常常 `cat` 旧的 `submit.err`/`blocker.json`，看到 402 不一定是新失败。
