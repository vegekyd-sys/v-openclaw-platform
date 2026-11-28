# /vds 新会话的固定开销与去重（2026-11-20）

起因：review 线（v-de-openclaw-review）的中途判断是「每个 /vds 会话固定开销约 21 万字符，其中技能清单和 AGENTS.md 各重复送了两遍」。Tianyi 要求先核实再处理。V 上只读，没有改动、没有发消息、没有重启；A/B 只在私有 candidate 里做。

## 结论

**一句话**：重复确实存在，但只在技能清单上：同一个对话线程里有三份技能清单，其中 Codex 自己加的两份共 3.76 万 token。AGENTS.md 没有重复。可以用一行配置去掉 Codex 那两份，不改代码，不用重启。A/B 显示它省的是缓存里的 token，首字和总耗时测不出变化；代价是名字相近的技能更容易选错，在不改第 4 条时群里「先说一句」也会掉。我的建议是**先不上线**，理由和可选做法见文末。

1. **重复确实存在，但只在技能清单上，而且比判断的更多：三份，不是两份。AGENTS.md 没有重复。**
   飞书对话里的 /vds 新线程（V 11/19 17:00 的真实线程，首个请求 DeepSeek 报 134,825 input token），用 DeepSeek 自己的计数逐段量：

   | 来源 | 谁注入 | 字符 | token |
   |---|---|---|---|
   | Codex 自带技能清单 `<skills_instructions>`，开线程时 | Codex 原生 | 53,285 | 17,633 |
   | Codex 自带技能清单 `<skills_instructions>`，第一轮开始时又一份 | Codex 原生 | 62,657 | 20,001 |
   | OpenClaw 技能清单（`<openclaw_workspace_context>` 里的「OpenClaw Skills」，376 个，紧凑格式） | OpenClaw codex 插件 | 61,785 | 20,293 |
   | AGENTS.md（`# AGENTS.md instructions for …`） | Codex 原生 project doc | 14,567 | 4,595 |
   | Codex base instructions | Codex | 16,979 | 3,581 |
   | SOUL / IDENTITY / USER | OpenClaw（工作区上下文） | 6,562 | 2,149 |
   | MEMORY.md | OpenClaw（工作区上下文） | 6,585 | 2,013 |
   | 记忆召回规则 | OpenClaw | 919 | 187 |
   | OpenClaw developer 指令 | OpenClaw | 6,567 | 1,362 |
   | 权限、推荐插件、环境 | Codex 原生 | 1,614 | 457 |
   | collaboration mode、时间 | OpenClaw | 1,503 | 306 |
   | 渠道上下文 + 用户这句话 | OpenClaw | 455 | 199 |
   | 以上消息合计 | | 233,470 | 72,776 |
   | 工具 schema（推算 = 134,825 − 72,776，含每条消息的格式开销约 3k） | OpenClaw 动态工具 + Codex 内置工具 | | 约 62,000 |

   - 「21 万字符」对得上：不算工具，消息部分是 23.3 万字符。
   - 技能清单三份合计 57,927 token，占首个请求的 43%。其中 Codex 那两份（37,634 token，28%）是多出来的。
   - Codex 两份清单的差别：开线程那份 120 个技能，没有工作区 `.agents/skills`；第一轮那份 152 个，加上了它。两份都覆盖 `~/.agents/skills`、Codex 系统技能和 openai-curated 插件缓存里的技能，和 OpenClaw 清单重叠 73 个。
   - AGENTS.md 每个线程只有一份。飞书对话线程里由 Codex 原生加载；夜班卡片线程里 Codex 原生不加载，由 OpenClaw 作为 developer 指令带入（「OpenClaw Agent Workspace Instructions」）。两边都没有同时出现。模型自己再去读 AGENTS/SOUL 等文件的情况也很少（11/19–20 的 1140 个线程里，TOOLS 11 次、USER 4 次、MEMORY 3 次）。
2. **这些是每个线程开头一次，不是每轮再注入；但每个请求都会把它们重新带上。**DeepSeek 的 Responses 接口无状态，Codex 每次请求都发完整历史。缓存命中很高：上面那个线程 27 个请求，首个 134,825 中 134,528 命中，之后每个请求只多几百到几千 token。11/19 全天 /vds 共 43,851 个请求、51 亿 input token，98.9% 命中缓存。
3. **哪些线程有这份重复**（V 11/19 的 999 个 /vds 线程）：
   - 816 个夜班 Workboard 卡片线程（请求量的大头）：没有 Codex 原生清单，只有 OpenClaw 那一份。不受影响。
   - 57 个飞书对话线程、20 个 cron：三份清单。
   - 32 个轻量 cron：只有 Codex 原生清单一份（第一轮那份），没有 OpenClaw 清单。
   - 全天带 Codex 原生清单的请求 3,183 个（7%），按字符折算约 1.13 亿 token/天，占全天 input 的 2.2%。/vcodex（GPT）线程另有一份 1.9 万字符的原生清单，约 420 万 token/天。
4. **模型实际用的是 OpenClaw 那份。**V 7 天（11/14–20，5108 个线程）里工具调用读过的 SKILL.md：工作区 `skills/` 11,462 次，`~/.agents/skills` 983 次，`~/.openclaw/skills` 57 次，`plugin-skills` 8 次，工作区 `.agents/skills` 3 次。只出现在 Codex 原生清单里的技能（codex-home 下的系统技能、openai-curated 插件技能）0 次。V 自己的 282 个工作区技能只在 OpenClaw 清单里。

## 为什么会有 Codex 原生那两份

OpenClaw codex 插件本来就会关掉 Codex 的原生技能清单（`skills.include_instructions = false`，代码里叫 native skill isolation），但只在 `OPENCLAW_STATE_DIR` 是非默认目录时才做。V 用的是默认的 `~/.openclaw`，所以 V 上一直没关。VLab 共享实例和 candidate 都用别的 state 目录，隔离会自动生效，所以 VLab 里从来看不到这份重复。

## 去重方案（最小改动）

V 上 makaron 的 `codex-home/config.toml` 加一个表：

```toml
[skills]
include_instructions = false
```

- 这是 Codex 0.169.1 自带的配置键，插件做「原生技能隔离」时用的也是它。不改代码，不打 dist 补丁。
- 去掉的是 Codex 原生那两份，保留 OpenClaw 那份。理由：
  - OpenClaw 那份是 V 的规范技能目录，已经按 `skills.entries` 开关、依赖可用性和 7 万字符预算过滤过；
  - V 自己的 282 个工作区技能只在它里面；
  - 7 天里模型读的技能全部在它覆盖的目录下。原生清单独有的系统技能和 openai-curated 插件技能读取 0 次，而且 V 的 `codexPlugins.enabled` 本来就是 false。
- 这个键只是不把清单写进提示，技能本身仍然启用。OpenClaw 的显式技能输入走 `skills/list` 按路径找 `enabled` 的技能，不受影响。
- 影响范围：makaron 的 codex-home 是所有 Codex runtime 别名共用的（/vds、/vcodex、/terra、/sol、/astra 等）。V 上只有这一个 codex-home 有流量（11/19：1014 个线程；hy-codex、main、v-codex 为 0）。
- 发版脚本：`scripts/configure-v-codex-native-skills.mjs`（root，`check|apply|restore`，写前备份，只动这一行；单测 7 项）。

## 上线方式

- **不用重启。**candidate 里在同一个运行中的 Gateway 上改 `config.toml`，之后新开的 Codex 线程立刻按新配置走（Codex app-server 在 thread/start 时读 config.toml）。
- **老线程不受益。**同一线程中途改配置（candidate `dm-switch` 场景）：历史里已有的两份清单还在，之后不再新增，也没有报错。老线程要等换新线程或被压缩后才变小。
- 回退：`node configure-v-codex-native-skills.mjs restore`，同样即时生效。

## A/B（私有 candidate，V 的字节）

### 测量台和保真度

`lab/candidate/vds-prompt-dedup-e2e.mjs` 与 `vds-prompt-dedup-complex-e2e.mjs`，基于 `claude/firsttext-two-segments-20261119` 的两个测量台：
- V 字节的 Codex 插件（whole-dist sha a864aa8f）、Codex 0.169.1、真实 DeepSeek `vds-deepseek-flash`、假飞书、V 的 9 个提示文件。
- 新增一个本地抓包代理：codex-home 的 `base_url` 指向它，原样转发给 DeepSeek，记下每个 `/responses` 请求体和 `response.completed` 的 usage。
- 两臂在同一个 Gateway 里交替运行，只差 `config.toml` 这一行。每个场景实例都是新的飞书会话，也就是新的 Codex 线程。

第一次跑出来的 base 臂根本没有 Codex 原生清单，和 V 不一致。为此按 V 补了四处，都只改私有副本：

| 差异 | VLab/candidate 原样 | 按 V 改成 |
|---|---|---|
| 插件的原生技能隔离 | 非默认 state 目录 → 隔离生效，没有原生清单 | 关掉（V 是默认目录）。这也是 VLab 平时看不到这份重复的原因 |
| `skills.limits` | 共享 VLab 配置里没有，默认 1.8 万字符，清单被截到 71 个 | V 的值：`maxSkillsPromptChars` 70000、`maxSkillsInPrompt` 500 |
| 技能目录 | VLab 的 147 个工作区技能 | 从 V 只读拷来的全部 `.md`（641 个 SKILL.md），放在和 V 相同的根下；工作区放在私有 HOME 的 `~/makaron-openclaw/.openclaw-local/workspace`，路径缩写和 V 一样 |
| 技能依赖 | 缺 lark-cli 等 6 个命令、6 个环境变量，相关技能被过滤 | 放占位命令（运行即报错）和占位值 |

对齐后 candidate 的形态：OpenClaw 清单 384 个技能 / 7.0 万字符（V 376 / 6.2 万），Codex 原生清单 121 + 153 个技能（V 120 + 152）。工具只有 40 个（V 的动态工具 93–107 个），所以总量比 V 小。

### 1. 每个请求的输入

新会话首个请求，按 DeepSeek 计数：

| 来源 | base | dedup |
|---|---|---|
| Codex 原生技能清单 ×2 | 14,297 + 17,804 | 0 |
| OpenClaw 技能清单 | 23,347 | 23,347 |
| AGENTS.md | 4,632 | 4,632 |
| Codex base instructions | 3,581 | 3,581 |
| OpenClaw 动态工具 / Codex 内置工具 schema | 17,854 / 2,807 | 同 |
| SOUL/IDENTITY/USER + MEMORY | 4,310 | 4,310 |
| DeepSeek 报的 input 合计 | **93,272** | **61,165**（−32,107，−34%） |

- 第二、三轮：同一线程里每个请求都带着这些前缀（DeepSeek 无状态），缓存命中 98.6–98.9%，两臂一样。
- 长会话（先贴 70 万字符）：每个请求 385k → 353k token（−8%）。
- 按 V 的形态推算：对话线程每个请求 134.8k → 约 97k token（−28%）；每天少约 1.1 亿缓存 token（全天 input 的 2.2%）。

### 2. 首字和耗时：测不出差别

| 场景 | 指标 | base | dedup |
|---|---|---|---|
| 规则/技能场景，每臂 123 回合 | 首个请求的首字节 p50 / p90 | 506 / 666 ms | 510 / 595 ms |
| | 首次推送 p50 / p90 | 2.25 / 3.2 s | 2.21 / 2.8 s |
| 复杂任务，新会话 42 对 | 总耗时比 dedup/base（95% 区间） | | 0.98（0.88–1.10），慢的 21/42 |
| 复杂任务，长会话 5×7 对 | 总耗时比（按会话重抽样 95%） | | 1.02（0.90–1.14） |
| 长会话 | 首个请求首字节 | 1.18 s | 1.16 s |

DeepSeek 对缓存命中的前缀几乎不花时间，少 3.2 万缓存 token 测不出首字变化。和首字报告的回归系数（每百万 input token 约 2 s）一致：3.8 万 token 约 0.08 s。

### 3. 正确率和长会话：没有变化

- 复杂任务（7 类带判分的多步任务）：新会话 41/42 vs 41/42，长会话 34/35 vs 35/35；工具调用 190 vs 197、139 vs 143 次。
- 简单工具题和闲聊：base 78/78，dedup 76/78（差的 2 个都在技能题里，见下）。
- 长会话工具题：10/10 vs 10/10。

### 4. 技能发现：名字有歧义时变差

5 个答案只在 SKILL.md 里的问题，每题都是新会话。判分规则：工具调用里读了对应的 SKILL.md；答案按题目核对，report-web 看回答里第一个出现的 px 值是否为 1200。

| 技能 | base（6 次） | dedup（6 次） | v2（3） | dedup+v2（3） | dedup+描述（5） |
|---|---|---|---|---|---|
| cdn-upload | 读 6 / 对 6 | 6 / 6 | 3 / 3 | 3 / 3 | 5 / 5 |
| lark-calendar | 6 / 6 | **4 / 4** | 3 / 3 | 2 / 3 | 5 / 5 |
| material-verification | 6 / 6 | 6 / 6 | 3 / 3 | 3 / 3 | 5 / 5 |
| report-web | 6 / 6，4.7 次工具，10.7 s | 6 / **4**，**26.7 次工具，57.9 s** | 3 / 3，4.3 次 | 3 / 3，18 次 | 5 / **3**，18.8 次 |
| makaron | 6 / 6 | 6 / 6 | 3 / 3 | 3 / 3 | 5 / 5 |

- lark-calendar：去重后有时选了名字相近的 `feishu-calendar`，或者直接用飞书日历工具回答。
- report-web：去重后模型会去翻名字相近的 `aochuang-report-web` 等报告类技能，工具调用多 4–6 倍，有时答成另一个技能里的 1180px。
- 原因：V 的 OpenClaw 清单因为超预算走紧凑格式，只有名字和路径。Codex 原生清单虽然重复，但带着 `~/.agents/skills` 和工作区 `.agents/skills` 那 150 多个技能的描述。名字有歧义时，描述（以及同一技能出现两次）帮模型选中了对的那个。
- 「dedup+描述」臂：在去重的同时把 `maxSkillsPromptChars` 提到 11 万，OpenClaw 会给每个技能带约 100 字符的截短描述。lark-calendar 恢复到 5/5，report-web 仍然绕路。首个请求 75.8k token，比只去重多 1.46 万。这个预算是 agent 级的，夜班卡片线程（也是 makaron）每个请求也会多约 1.5 万 token，总量反而增加。不推荐。

### 5. AGENTS.md 规则照做

| 规则 | base | dedup | v2 | dedup+v2 |
|---|---|---|---|---|
| 第 4 条「调工具前先说一句」，所有工具回合 | 50/88 | 38/88 | 37/39 | 35/38 |
| 其中群聊 | 7/12 | **0/12** | 6/6 | 6/6 |
| 群里人与人对话 → NO_REPLY | 6/6 | 6/6 | — | — |

- 用 V 现在的第 4 条时，去重后照做率下降，群聊里尤其明显。
- 用前一条线推荐的 v2 第 4 条（`docs/experiments/vds-preamble-20261120.md`，未合入）时，去重与否没有差别。
- Codex 0.169.1 的原生技能说明里没有「用技能前先说一句」这类指令，下降的原因不明。

## 建议

收益和代价：

| | 去重（只改 config.toml） |
|---|---|
| 收益 | 对话/cron 线程每个请求少约 3.8 万缓存 token（−28%），上下文多 3.8 万余量。全天约 1.1 亿缓存 token（2.2%）。夜班卡片线程不受影响 |
| 首字 | 测不出变化 |
| 正确率、长会话 | 没有变化 |
| 代价 | 名字相近的技能更容易选错、绕路（report-web 工具调用 4.7 → 26.7 次）；不改第 4 条时，群里「先说一句」7/12 → 0/12 |

**我的建议：先不上线。**Tianyi 关心的是首字和每轮开销，而这份重复全在缓存里，首字测不出收益，反而有可见的代价。如果要上，建议按这个顺序：

1. 先上 v2 第 4 条（工作区文件，热生效），消掉照做率的交互影响。
2. 清理名字相近、会互相干扰的技能，至少 report-web / aochuang-report-web、lark-calendar / feishu-calendar 这两组。376 个技能里 7 天只读过几十个，清掉不用的还能腾出预算给描述。
3. 再用 `scripts/configure-v-codex-native-skills.mjs apply` 去重，用本测量台的技能题复测一次。

## 后续（这次没做）

- **Codex 自己那两份里，开线程那份是纯冗余。**第一轮那份（152 个）是它的超集。开线程时 Codex 还没拿到工作区环境（初始 turn context 为 `auto-compact-0`，没有 AGENTS.md，环境里没有 cwd），第一轮带上工作区后又补了一份。只去掉开线程那份能省约 1.76 万 token，而且不丢描述；但要改插件的 thread/start 参数，或改 Codex 的初始上下文。
- **工具 schema 是最大的一块。**V 对话线程约 6.2 万 token（推算），比三份技能清单加起来还多，DeepSeek 路径全部直接发送（review 线 #629 也看到了）。
- **夜班卡片线程**（请求量的大头）每个请求带 2 万 token 的 OpenClaw 技能清单和 1.4 万字符的 SOUL/MEMORY 等，没有重复，但量大。
- **VLab 与 V 的配置漂移**：共享 VLab 缺 `skills.limits`，且因为非默认 state 目录，原生技能隔离生效，所以 VLab 里看不到 V 的提示形态。按 `docs/vlab-v-sync-flow.md` 该补上前一项。

## 没覆盖到的

- /vcodex（GPT）没在 candidate 里测（candidate 不复制 ChatGPT OAuth）。V 上 GPT 线程有一份 1.9 万字符的原生清单，加 OpenClaw 那份；去重的取舍相同。
- candidate 的工具只有 40 个（V 93–107），飞书以外的渠道、语音没测。
- 技能题只有 5 个；歧义问题的严重程度取决于 V 实际有多少名字相近的技能。

## 数据来源

- V（只读）：makaron codex-home `sessions/2026/11/14–20` 的 rollout，只在用到的目录里读，`ionice -c3`。逐段 token 是把 V 11/19 17:00 线程首个请求的各段单独发给 DeepSeek（max_output 16），用返回的 input_tokens 减去 1 个字符的基线。
- candidate 运行（都已回收，receipt 在本地 `tmp/candidate/`）：

| 编号 | 内容 |
|---|---|
| candidate-532f30f3 | 拆分 + 中途改配置（对齐 V 后第一次） |
| candidate-a5b82905 | 规则/技能/拆分，base vs dedup ×3 |
| candidate-0cadd5be | 工具和技能场景，base/dedup/v2/dedupv2 ×3 |
| candidate-91454bfd | dedup + 11 万技能预算 ×5 |
| candidate-c134ea75 | 长会话 ×2 |
| candidate-b2c052ae、candidate-2127f131 | 复杂任务新会话 ×3 + ×3 |
| candidate-d78baf79、candidate-35c056c8 | 复杂任务长会话 ×2 + ×3 |
