# DeepSeek 把工具调用写成带空格的 DSML 文本（2026-11-07）

## 1. 现场

用只读 FTS 查了 V 的 makaron 会话库：2026-10-24 到 11-07 的 14 天里，有 14 条 deepseek-flash 回复（PI，`openai-completions`）的正文里带 DSML 标记，`stopReason=stop`。涉及 7 个飞书私聊/群和 1 个 cron。用户看到的是这样一段：

```
<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="exec">
<｜｜DSML｜｜ parameter name="command" string="true">cd /home/openclaw/.openclaw/nightshift/instances && python3 - <<'EOF' …</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>
```

工具没有执行，回合在这里结束。V 上见过的标签只有 `<｜｜DSML｜｜ calls|invoke|parameter>` 和对应的闭合标签，标记后面都带一个空格。

## 2. 原因

两层：

1. **9.1 的 DSML 语法**（`@openclaw/ai` 里的 `deepseek-dsml-grammar`）认识双全角竖线，但不认识标记后的空格，也不认识 `calls` 这种包装。所以工具恢复和可见文本过滤都没匹配上。上游 #169728（910a2c1b308，10/12）修的正是这个形式。
2. **前置说明**：14 次里有 6 次在标记前面写了一句说明，例如「我先检查一下刚才伟诺入表失败的原因。」。DSML 调用总是以 `finish_reason: stop` 结束，而 `finalizeOpenAICompletionsToolCalls` 只在「没有任何可见正文」时才把 stop 提升为 toolUse，否则就把工具调用整个丢掉。上游也是这个规则。即使修了第一层，这 6 次仍然只会显示那句说明，工具不执行。

## 3. 改动（V 的 `@openclaw/ai` 打包文件 `openai-completions-stream-DZjwK8vp.mjs`，before = V 当前字节）

- **`dsml-spaced-calls-v1`**：回移上游 #169728。
  - 每个标记都增加「带空格」的变体；`calls` 与 tool_calls/tool_call/function_calls 并列。
  - 工具恢复和文本过滤共用同一张包装表，文本过滤另外保留 tool_use_error。
  - 直连调用也过滤 DSML 文本，但不在直连里恢复工具。
- **`dsml-prefaced-calls-v1`**：V 扩展，上游没有。
  - 只有同时满足两个条件才把 stop 视为工具回合：所有工具调用都来自已闭合的 DSML 块；最后一个工具调用之后没有可见正文。
  - 前置说明作为文字保留。
  - 原生 tool_calls 仍按上游规则处理（有正文 + stop 时丢弃）。

源码：`vegekyd-sys/openclaw-versa` 分支 `versa/port-dsml-spaced-calls-20261107`：
- `efb1a6c2748`：cherry-pick 910a2c1b308。保留 9.1 的语法辅助函数，不带 Gemma 恢复器；测试改用 9.1 直连参数，并加了 V 样本回归。
- `47f392f4aa1`：V 扩展。
- `packages/ai/src/transports/` 全部 886 条测试通过。撤掉扩展后，前置说明用例失败，另外两条（正文在后、原生调用）仍通过。

平台：
- `lab/patch-dsml-spaced-calls.mjs`、`lab/release-files/dsml-spaced-calls/`、`lab/dsml-spaced-calls.plan.json`。
- 离线测试 `lab/dsml-spaced-calls.test.mjs` 5/5，用补丁后语法区域的真实代码校验 V 见过的标签。

## 4. candidate

脚本 `lab/candidate/dsml-spaced-calls.mjs`，沿用 #566 的 Gateway + Worker + 本地 DeepSeek 替身。替身第一次请求以 DSML 文本发出 exec 调用（不带原生 tool_calls），两种发法：逐字符拆分（dsml）和一次发完（dsml1）；拿到工具结果后用正文回答。

预期：
- A 臂：工具执行 0 次、标记可见（证明故障路径触发）。
- B 臂：工具执行 1 次、转录里有 1 个工具结果、DeepSeek 给出最终回答、标记不可见。

**状态**：VLab 主机 2026-11-07 23:0x 起从本机和 V 都连不上（Tailscale relay 无应答），candidate 未跑。恢复后执行：

```
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner pi-harness-dsml --plan "$PWD/lab/candidate/dsml-spaced-calls.plan.json"
```

前置说明场景（dsmlpre）建议同时加入 candidate。

## 5. 上线

`@openclaw/ai` 由 Gateway 和 Worker 共同加载，需要重启 Gateway（Worker 随之换代）。可以与 #566 同一次重启。
