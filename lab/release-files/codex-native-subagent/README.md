# Codex 原生子 agent：工具中继跨父回合保留 + 结果送回父会话（2026.9.1）

## 现象（生产 V，2026-10-02 00:15 CST）

飞书群 `agent:makaron:feishu:group:oc_d0fdd37a…`，`/vcodex`（codex runtime，gpt-6.1-sol）。

| 时间 | 父线程 `01a0f83e…` | 子线程 `01a0f83f…`（`/root/vscale_parent_flow`） |
|---|---|---|
| 00:15:17 | `spawn_agent` | |
| 00:15:32 | `sessions_yield` → 回合中断（yield 的正常形态） | |
| 00:15:26–00:16:18 | | 6 次工具调用全部成功（yield 后保留的中继在工作） |
| 00:16:39–00:16:56 | 用户追问，开始新的父回合，没有 yield，正常结束 | |
| 00:17:05 起 | | 每次 exec / send_message 都是 `Command blocked by PreToolUse hook: Native hook relay unavailable`；Gateway 记 `nativeHook.invoke … native hook relay not found` ×4 |
| 00:18:16 | | 回合以文字汇报“被阻断”正常结束 |

任务行 `08d81abb…`：`status=succeeded`，投递失败，`error = In-process gateway dispatch requires a gateway request scope or instance binding (method: agent).`。父会话没有被唤醒；00:25 用户再问时，Codex 把子线程的结束通知塞进父线程这一回合，`delivery_status` 才被改成 `delivered`。所以 `delivered` 并不代表父会话被唤醒过。

## 根因

### 1. 子 agent 的中继被下一个父回合顶掉

- 中继 id 每个会话一个：`buildCodexNativeHookRelayId(agentId, sessionKey)`（codex 插件 `thread-lifecycle-*.js`）。
- 上游设计：父回合 `sessions_yield` 成功后，如果持有直属子线程的 claim，回合结束时 core 不注销这个中继（`shouldRetainAfterForegroundClose`），子线程的 PreToolUse 继续用发起回合的权限过 hook。00:15:33–00:16:18 子线程能工作，靠的就是这一点。
- 下一个父回合开始时，会以同一个 id 再注册一次中继。core `registerNativeHookRelayInternal` 会先 `unregisterNativeHookRelay(relayId)`，把正在为子线程保留的那份注册直接替换掉，新注册里没有子线程的 claim。新回合没有 yield，结束时中继被注销，子线程的 hook 命令仍指向这个 id，于是得到 `not found`。
- 上游 9.7 之后整套 Tasks runtime 已重写（`6652f7eac8d` 删除了 Tasks），没有可直接回移的修复，也没有配置项能控制这一行为。

### 2. 被拦光的子 agent 记为 succeeded

监控（`native-subagent-monitor-*.js`）按 Codex 子线程回合的状态记账。子线程把每个失败都写进了回复，回合本身是 `completed`，所以记成 `succeeded`，`terminal_summary` 就是那段失败汇报。这是如实记账，问题在于中继断了，不在状态映射。修复中继之后，这种情况不再出现，所以不改状态映射。

### 3. 结果送不回父会话

上游的设计路径：子线程结束 → 监控 `processCompletion` → 父回合已结束（owners=0）→ `deliverAgentHarnessTaskCompletion` → 在父会话发起一个 `announce:codex-native:…` 回合，即“唤醒父会话”。

这个调用要求 Gateway 上下文来源二选一：task scope 上绑定的 resolver，或者当前所在的 Gateway 请求 scope。

- task scope 在 `embedded-agent` 里创建，resolver 取自 `admittedRunContext`。飞书入站回合只有渠道准入证据带上 resolver 时才会有，V 上这次是空的。
- 监控运行在共享 Codex 客户端的通知回调里，没有请求 scope。CLI/RPC 回合不一样：客户端是在 RPC 里启动的，回调会继承 RPC 的请求 scope。所以只用 CLI 测试时投递总是成功的，暴露不了这个问题。

两者都没有，`resolveInProcessGatewayDispatch` 就报出上面那句错误。监控随后按 5 s 到 300 s 的间隔重试 6 次，每次都失败。

`sessions_spawn` 的完成通知没有这个问题：`registerSubagentRun` 在缺少 resolver 时，会回落到 `activateSubagentRegistry` 登记的 Gateway 生命周期 resolver（`fenceScheduledGatewayContextResolver`）。

## 改动（`patch-codex-native-subagent.mjs`，幂等，锚点必须唯一）

| 文件 | 改动 |
|---|---|
| codex 插件 `thread-lifecycle-DAcEJ_Om.js` | 记录哪些中继 id 正为 yield 后的子线程保留。保留期间，新的父回合改用回合级 id（`<会话 id>-t<时间><序号>`）注册，不再顶掉旧注册。子线程继续使用发起它的那个回合的中继和权限；父线程的 hook 配置在每次 resume 时都会指向本回合的中继。子线程结束后 claim 归零，core 注销旧中继，`onDispose` 清掉登记，之后的回合恢复使用会话 id。 |
| core `subagent-registry-C24yr_PF.js` | `activateSubagentRegistry` 把 sessions_spawn 已在用的生命周期 resolver 发布到 `globalThis[Symbol.for("openclaw.v.scheduledGatewayContextResolver")]`。 |
| core `plugin-sdk/agent-harness-task-runtime.js` | task scope 没有 resolver，或 resolver 已拿不到 Gateway 时，改用上面那个生命周期 resolver 投递（`inheritRequestScope:false`）。原有路径不变。 |

刻意不改的：
- 托管的起点仍是 `sessions_yield`（上游规则）。父回合不 yield 就结束时，子线程照旧在 10 s 后失去中继。
- 子线程的工具权限不转交给后来的回合。曾考虑过“新回合接管子线程 claim”的做法，但那样群里后发言的人会把自己的权限带给别人发起的子线程，因此放弃。
- 第二个父回合仍不能对上一回合的子线程 `sessions_yield`（返回 “No pending child completion is owned by this turn”）。这是上游的所有权规则，完成通知照样会唤醒父会话。

上线时两边都要打：codex 插件位于 V 的 `~/.openclaw/npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex`，core 位于 `/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core`。都需要重启 Gateway。插件目录由 npm 管理，重装或升级插件后要重新打补丁，`/vds` 的补丁也是这样。

```sh
node patch-codex-native-subagent.mjs --codex <@openclaw/codex 目录> --core <core 目录> --check   # 只检查
node patch-codex-native-subagent.mjs --codex <@openclaw/codex 目录> --core <core 目录>           # 写入
```

## 验证（candidate，`lab/candidate/codex-native-subagent.mjs`）

起点字节与 V 一致：脚本先断言 3 个 codex 文件和 2 个 core 文件的 sha256 等于 V 上的值。模型用 `/vds`（Codex harness + DeepSeek），没有复制 ChatGPT OAuth。V 的 `/vds` 补丁 5 会关闭 DeepSeek 的原生 multi_agent，测试里只对 candidate 恢复这一项，让测试走 `/vcodex` 在用的原生子线程路径。

场景与生产一致：
1. 父回合 `spawn_agent` + `sessions_yield`。子线程先 `sleep 75`，再对一个随机文件做 `sha256sum`，把哈希写进文件并汇报。这个哈希不出现在任何提示词里。
2. 子线程 sleep 期间来一条追问：父线程自己用 exec 读取一个随机 token。
3. 之后没有任何人发消息，等子线程完成，看父会话是否自己回复带哈希的消息。
4. 再来一回合，确认父线程自己的工具仍然可用。

`NSA_DROP_SCOPE_RESOLVER=1`（仅测试）按 V 的条件投递：task scope 不带 resolver，投递时也不在请求 scope 内。

### 结果（提交 `5c61a35`，工作区干净，2026-10-02 02:2x CST）

| plan | candidate | 子线程工具 | 哈希文件 | 父会话自己醒来 | 任务行（第 3 回合前） | 父线程工具（回合 2/3） |
|---|---|---|---|---|---|---|
| `codex-native-subagent-baseline-noscope`（V 字节） | `candidate-c5a00212-386f-41e0-b58d-81d56dfa91b8` | 2 次 `Native hook relay unavailable`，Gateway `not found` ×2 | 缺失 | 否 | succeeded / pending / `In-process gateway dispatch requires … (method: agent).` | ✓ / 被迟到的子结果占用 |
| `codex-native-subagent-relay-only`（只打插件） | `candidate-f59b2caa-352b-4289-a45b-cb5c189480a9` | 0 拒绝 | 正确 | 否 | succeeded / pending / 同上错误 | ✓ / ✓ |
| `codex-native-subagent`（全部修复，V 式投递） | `candidate-e76cc8d5-b133-437c-b6f4-e07fe575a316` | 0 拒绝 | 正确 | 是，安静后 75 s：`PARENT_GOT NSA_HASH 8fe61978…` | succeeded / delivered | ✓ / ✓ |
| `codex-native-subagent-cli-scope`（全部修复，CLI 正常路径） | `candidate-3f8137ec-ff3a-4539-8609-5ab5fb28c619` | 0 拒绝 | 正确 | 是，70 s | succeeded / delivered | ✓ / ✓ |

- 基线逐项复现生产：子线程在追问回合结束后被拒，任务仍记 succeeded，投递报同一句错误，父会话不醒。
- 只打插件的那一组，子线程能干活，但结果仍送不回父会话。这说明唤醒靠的是 core 那一半；反过来，基线说明子线程能否干活取决于插件那一半。
- 基线和只打插件的两组，在第 3 个用户回合之后，任务都被改记为 `delivered`：Codex 把子线程的通知塞进了这个新回合。这与 V 在 00:25 的情况相同。所以“delivered”不能作为父会话被唤醒的证据，判定一律以第 3 回合之前的状态为准。
- 父线程在回合 2 走的是回合级中继 id，自己的 `cat` 照常成功，说明父线程的 hook 跟着本回合的中继走。回合 3 时子线程已经结束，回到会话 id，同样成功。

## 未覆盖

- 真实飞书投递：candidate 没有渠道。唤醒回合已在父会话的记录里出现，但是否发到群里，要等上线后用飞书验收。
- `/vcodex`（ChatGPT）本身：同一个 harness、同一套中继和监控代码，只是模型不同。没测是因为 candidate 不能刷新共享 OAuth。
- 父回合正常结束（不是被 yield 中断），而新回合恰好落在 10 s 延迟注销窗口内的情形：代码里在授予托管时就登记了 id，但 e2e 测试走不到这条分支（yield 总会中断回合）。
