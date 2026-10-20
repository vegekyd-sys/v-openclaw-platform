# v-session-relay 2.0

一个对话（私聊、群、Task Room）里的 V 用原生 `sessions_send` 把事交给另一个对话的 V：请求以「📨 来自「…」的请求 #code」可见地出现在对方聊天里，对方在那里像收到真人消息一样流式地做；同一轮交出的几件全部有结果后，发起方只被叫醒一次、汇报一次。设计见 `docs/inter-session/design.md`（§2.b–§2.d、§3.10、§4–§8，§13 的修订优先）。

**入口仍只有原生 `sessions_send`**。核心补丁 v3（`lab/release-files/sessions-send-relay/`，WP2）在读目标历史之前调用 Gateway 方法 `vrelay.send`；本插件只在 Gateway 进程里跑账本和引擎。插件缺席、`DISABLED` 或发起方不受支持时，核心照常走 v2。

## 组成

| 模块 | 做什么 |
|---|---|
| `core/contracts.js` | 冻结的常量、ID、校验（WP0；与 dist 补丁共享的字面量都在这里） |
| `core/ledger.js` | `$OPENCLAW_STATE_DIR/v-session-relay/v2/`：`sends/ batches/ chains/ runs/ archive/ LOCK DISABLED`；单写者、异步原子写、CAS、先落盘后副作用 |
| `core/policy.js` | 边分类（delegate / followup / ask）、LEAF、WAIT_CYCLE、REPLY_TO_REQUESTER、深度、扇出、预算、排队满 |
| `core/queue.js` | 每个会话一条队列：ask > wake = collect > request，同类先到先做 |
| `core/engine.js` | `send / wait / get / list / cancel`、pump、全局上限 4、BUSY 退避、批次封口与唤醒、W(S) 续接、后台收尾（collect）、inline 领取与退回 |
| `core/recovery.js` | §6.3 重启恢复，四层防重复唤醒；在跑的请求 / 收尾回合只跟随核心的恢复回合或报中断，绝不重跑；看起来楔死的会话先观察一段时间，看核心是否认领 |
| `core/routes.js` `core/labels.js` | 会话在哪、走桥还是 agent、聊天里有谁、链根身份规则、§7.1 标签 |
| `core/copy.js` `core/visible.js` | §7、§8 全部文案；可见正文的隐私裁剪、隐去密钥、渠道长度上限、markdown 转义 |
| `core/requests.js` | 组装 StartRequest（请求 / 提问 / 收尾 / 唤醒） |
| `core/transports/bridge.js` `agent.js` | 渠道入站桥（完整卡片体验）；没有桥时用 Gateway `agent`（deliver:true）+ 渠道 `outbound.sendText` 发可见请求 |
| `core/tasks.js` | 往 `taskRegistryBridge.extraSources` 提供「会话请求」后台行 |
| `core/guard.js` | `before_tool_call` 轮询闸：已交出任务的回合里 `sleep ≥ 15 秒`（认 `5m`、`2h` 这类单位）、`timeout NN`、`while…sleep` 和第二次起读对方历史一律拦下（只拦，不改参数） |
| `core/host.js` `index.js` | 一个进程一个引擎（`register()` 会被调用三次）；worker 子进程（`VLAB_WORKER_CHILD=1`）不起引擎，只在 `workerGuard` 打开时注册轮询闸 |

Gateway 方法：`vrelay.send`、`vrelay.wait`（operator.write）、`vrelay.get`、`vrelay.list`（operator.read，`counts.running` 含在跑的唤醒和收尾回合，v-self-restart 的闲置门用它）、`vrelay.cancel`（operator.admin，只给运维）。

## 与其他包对齐的约定（各包评审报告给出的接口事实）

- **`vrelay.send` 从不抛错。** 核心看到抛出的错误文本匹配 `unknown method: vrelay.send|missing scope: operator.admin` 时会认定插件缺席，改走 v2，同一件事就发了两次。所以引擎和 host 都兜住异常：已经落盘的请求照常回 `accepted`（恢复会把它做完），还没落盘的回 `{status:"error"}`，错误文本里去掉这两句。
- **幂等 = 同一个 `idempotencyKey` 且同一条内容。** provider 可能复用 toolCallId，同一回合里两条不同的发送会算出同一个键。键相同但内容（发起方、目标、正文）不同时当作新请求受理，并记一条 warn；每次重试仍找回各自的记录。
- **`vrelay.wait` 遇到非 inline 的记录**（inline 调用被内容去重到一条异步请求上，`inline.until=0`）立刻回 `expired`，note 用「同样的请求 #code 已在进行，结果会自动回来」。它的结果由批次唤醒交回，所以即使它已撤回也不在这里报 `failed`。
- **`senderIsOwner === null` 按非 owner 处理**：principal 不是 owner，没有 owner 名字，agent transport 用 operator.write；即使 senderId 恰好是 owner 的 id，在目标聊天里也不会以 owner 身份出现（改用合成 id）。
- **轮询闸**按 accepted 表里的 resolvedKey 和 displayKey 两种键匹配 `sessions_history` / `session_status` 的 sessionKey，不区分大小写（钉钉的 key 是小写），也认键尾（`main`、`feishu:group:oc_x`）。
- **开跑不设超时。** 飞书、企微的 `bridge.start` 可能在聊天队列里等最多约 10 分钟才回 busy 或 started；引擎一直等，绝不提前放弃重试（否则同一回合可能跑两次）。锚点在受理时最多同步等 5 s，之后在后台继续，不会在途中再发；只有发送报 transient 失败才用同一个 idempotencyKey 重发。飞书按 uuid 去重；钉钉、企微、Telegram 和 agent transport 不能去重，所以一条其实已送达却报失败的锚点（例如企微自己的 15 s 超时）会出现两次，带同一个 #code。这是至少一次语义，只对这些不幂等的渠道可接受。开跑在外的这段时间里，目标会话有回合结束（多半就是它排在后面的那个），即使随后答复是 BUSY 也不再退避，马上重试。
- **桥调用在干净的异步上下文里进行。** `start` / `post` / `edit` 一律在引擎创建时（服务启动）的 `AsyncLocalStorage.snapshot()` 里执行，不继承调用方的上下文：`vrelay.send` 可能在某条 Telegram 更新的处理帧里被调用，lifecycle 事件来自真人的回合；合成回合如果挂在那个帧上，失败会把那条更新标成 failed-retryable，让发起方的回合重跑。
- **「会话请求」后台行**：数据源函数同步、只读内存、从不调用 `listActive`；sessionKey 不区分大小写；请求一到 `result_ready` / `failure_ready` 就去掉这一行（不等 `handed_back`），唤醒回合的卡片不会再显示它；变化时按 T 的写法用 `queueMicrotask` 加 try/catch 通知 listeners，`kind:"v-a2a"`。引擎自己的 listener 忽略 `v-a2a` 通知。
- **W(S) 的后台过滤**只等 subagent / acp 以及 exec / 生图 / 视频 / 音乐任务，排除 `taskKind:"sessions_send"`（含 `v-a2a:` 行）和 cron（`runtime` 或 `taskKind` 为 cron）。
- **钉钉**：会话记的投递渠道是 `dingtalk-connector`，桥的键是 `dingtalk:<acct>`（V 上账号是 `__default__`；没有账号的会话走 `dingtalk:default`，桥两个键都注册）。`route.channel` 一律用桥的渠道名 `dingtalk`；agent transport 另用 `route.deliveryChannel`（`dingtalk-connector`）找出站适配器、填 `agent` 的 channel。`commands.ownerAllowFrom` 里的 `dingtalk-connector:<staffId>` 也算钉钉的 owner。桥没给群名时，用会话条目的 subject / displayName 填 `route.label`，桥把它当群名传给核心，群会话的标签就不会被改成 id。
- **RunOutcome 只有一条规则**（与各桥一致）：`ok`（completed）和 `error`（failed）照用；其他（`aborted`，或者没有可用的 status，即核心没给终态）只有交出过非错误的 final（文字或媒体）才算 `ok`，否则是 `aborted`。桥、agent transport、丢了 done 的回合和恢复都走 `requests.normalizeRunOutcome`。

## 配置

只写 Gateway 主配置（worker 配置由它自动推导，插件会被加载进每个 worker，但在 worker 里什么都不启动）：

```json
{
  "enabled": true,
  "config": {
    "ownerName": "Tianyi",
    "agentNames": { "v-codex": "Codex" },
    "workerGuard": false,
    "limits": { "maxConcurrentRequestTurns": 4, "sharedVisibleChars": 200 }
  }
}
```

`limits` 的全部键和默认值见 `core/contracts.js` 的 `DEFAULT_LIMITS`。`role` 仍可写（兼容旧配置），但不再起作用。`ledgerDir` 默认是 `<stateDir>/v-session-relay/v2`。

## 止血与回滚

1. 立即止血：在账本目录建 `DISABLED`（约 1 秒内生效），之后的 `sessions_send` 走 v2；在途的请求照常收尾。
2. 停用插件：先把配置里的插件改成 `enabled: false`（会触发 worker 换代），再删目录（记忆 deleted-plugin-dir-breaks-worker-config）。
3. `LOCK` 被另一个活着的进程持有时引擎不启动并记 error，`vrelay.send` 返回 fallback（防止 candidate 与共享 VLab 共用一个目录）。

## 测试

```sh
node --test tests/v-session-relay.test.mjs          # CI 入口：import plugin/tests/ 下全部 *.test.mjs
cd apps/v-session-relay/plugin && node --test 'tests/*.test.mjs'
```

- `engine`：全部 phase、FIFO 类别、全局上限、批次、W(S) 续接、后台收尾、inline 领取 / 过期 / 竞态 / 退回、BUSY、路由不符改走 agent、楔死、撤回、排队超时。
- `recovery`：§6.3 每个分支（进程内模拟崩溃后用同一目录重启）。
- `crash-injection`：真子进程在 13 个落盘点 `VSR_CRASH_AT=<phase>`（含 `before:<phase>`）退出，再起一个进程恢复；断言每批最多一次唤醒、结果不丢、飞书锚点不重复、开跑过的回合不重跑、每个 MessageSid / runId 只用一次。
- 测试世界（`fixtures/harness.mjs`）像核心和 worker 一样拒绝重复使用的 MessageSid / runId，任何测试里出现就失败。
- `policy`、`ledger`、`routes`、`guard`、`copy`、`host`（三次 register、worker 判定、方法 scope、经 agent transport 的端到端）。
- `interface-alignment`：上一节的每条约定各有一组测试。
- `candidates`：`lab/candidate/` 里引用本插件文件的计划和脚本都指向存在的文件；1.x 的 `session-relay*` 候选脚本已删，只留 `session-relay-native*`（只打 v2 核心补丁，文件头标为历史参考）。

候选测试与共享 VLab 验收见设计 §10（WP10）。`VSR_TEST_START_DELAY_MS` 让引擎在开跑前多等一会儿（F3b 竞态用）。

## 已知限制

- agent transport（R1 的 Telegram / 钉钉 / 企微、无渠道会话）只有可见请求和最终出站，回复里没有媒体；它没有 G 守卫，忙的目标靠预检避开，避不开时排在当前回合之后。
- 插件内用 `callGatewayFromCli` 能否拿到 `operator.admin`（A5）未经实测；拿不到时自动降为非 owner 身份运行并记 warn。
- /vcc 原生 Bash 的 sleep 拦不到（§8.7 第 5 条）。
