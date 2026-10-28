# V 的技能目录被截断：证据与清理方案（2026-10-26）

## 结论

- **截断确实存在。** 生产 V 上 makaron（以及共用同一 workspace 的 v-codex、hy-codex）每个会话的系统提示里，339 个可用技能只列了 109 个，全部只有名字、没有描述。按字母序排在 `geelark-tiktok-login` 之后的 230 个不在目录里。
- **但「不在目录里」不等于「用不到」。** 最近 600 个会话里，有 77 个不在目录里的技能被实际读取过：makaron 404 次（273 个会话）、scene-cli 245 次、remix-video-brief 198 次、material-verification 184 次。V 能找到它们，是因为 `AGENTS.md`、`TOOLS.md` 按路径点名了 makaron 和 scene-cli，makaron 的 SKILL.md 又会引用后续技能，agent 也会自己 `ls` 技能目录。
- **真正受影响的是没人指路的技能**：用户不点名、AGENTS.md/其他技能也不引用时，V 不知道它们存在。目录里的 109 个也只有名字，`11`、`dws`、`fcloud-api` 这类名字看不出用途。
- **`skill_usage` 不能当使用量看**（这是我第一版分析的错误，Tianyi 指出）。9.1 只在 `read` 工具读到「已进目录」的技能时才记一次（`agent-tools.before-tool-call`：先匹配 `skillsSnapshot.resolvedSkills`）；不在目录里的技能，或者用 `exec`/`bash cat` 读的，一律不记。所以 makaron 在 `skill_usage` 里停在 9/04 的 285 次，实际上一直在用。本文后面的使用数据都来自会话记录（`scripts/v-skill-reads.py`）。

数据来源：V 的 db91.6 core dist 源码；makaron 库按键只读 4 行 `session_nodes`；最近 600 个会话每个最后 3000 条 `transcript_events`（按主键读，15.1 万条事件，最早到 7/16，耗时 9 s）；V 上各技能目录的 SKILL.md frontmatter；Gateway journal 最近 6 小时。生产上没有改任何文件，也没有调用 Gateway RPC。

## 1. 截断规则（db91.6 `skill-prompt-limits-*.js`）

| 项 | 值 |
|---|---|
| 条数上限 `skills.limits.maxSkillsInPrompt` | 默认 150，先按名字排序再截 |
| 字符上限 `maxSkillsPromptChars` | 默认 18,000（全局 `skills.limits`，或 `agents.entries.<id>.skillsLimits`） |
| 完整目录放不下时 | 换成紧凑格式，把描述统一截短；还放不下就**删掉全部描述**；再放不下就只保留**按字母序**排在前面、放得下的那些 |
| 截断提示 | 只在 prompt 里加一行 `⚠️ Skills truncated: included N of M (...)`，没有告警 |

V 没有配置 `skills.limits`，用的是默认值。每条技能即使只有名字也要约 160 字符，大头是 `<location>` 路径（平均 72 字符），所以 18,000 字符只够约 110 条。

## 2. 生产证据

4 个会话（群 oc_94bb…、oc_ede0…，私聊 ou_cb13…、ou_3fe4…；vlab-worker 和 codex 两种 harness）结果完全一样：

```
skillsSnapshot: 339 eligible, prompt 17,953 chars, 109 names, 0 descriptions
⚠️ Skills truncated: included 109 of 339 (compact format, descriptions omitted).
systemPromptReport.skills.entries = 109
```

用生产 dist 自己的 `buildSkillSnapshot` 离线重算（`scripts/v-skills-catalog.mjs report`，只读，0.5 s），得到同样的 17,953 字符、109/339。

最近 600 个会话里实际被读取、但不在目录里的技能（读取次数 / 会话数，前 20 个）：

| 技能 | 读取 | 会话 | 最近 | 怎么找到的 |
|---|---|---|---|---|
| makaron | 404 | 273 | 10-26 | AGENTS.md/TOOLS.md 按路径点名 |
| scene-cli | 245 | 206 | 10-25 | 同上 |
| remix-video-brief | 198 | 187 | 10-24 | makaron 流程内引用 |
| material-verification | 184 | 180 | 10-24 | 同上 |
| lark-base | 61 | 42 | 10-26 | |
| skill-creation-coach | 57 | 11 | 10-26 | |
| lark-shared | 32 | 16 | 10-25 | |
| xiaomi-tv-control | 26 | 5 | 10-26 | |
| librarian-semantic-reconcile | 26 | 1 | 10-22 | |
| xingqing-account-bootstrapper | 20 | 1 | 10-22 | |
| lark-doc | 19 | 11 | 10-25 | |
| remote-browser-cdp | 17 | 5 | 10-23 | |
| lark-im | 13 | 6 | 10-25 | |
| lark-calendar | 12 | 4 | 10-23 | |
| report-web | 10 | 5 | 10-21 | |
| night-shift-operator | 9 | 7 | 10-25 | |
| makaron-long-video-production | 9 | 1 | 10-23 | |
| lark-mail | 9 | 2 | 10-25 | |
| talking-head-intro | 9 | 3 | 10-25 | |
| lark-user-routing | 9 | 2 | 10-25 | |

VLab candidate 里也看到了同样的现象：改配置前问「用 makaron 生成主图」，agent 先 `ls` 了技能目录，然后找到了 makaron。

## 3. 技能来源清点（V，2026-10-26）

| 来源（优先级从低到高） | 目录数 | 无效 | 描述平均/最长 |
|---|---|---|---|
| ~/.openclaw/plugin-skills（插件生成，含 16 个 wecomcli-*） | 28 | 0 | 166 / 497 |
| core/skills（随运行时） | 50 | 0 | 90 / 161 |
| core/custodian-skills | 4 | 0 | 96 / 105 |
| ~/.openclaw/skills（managed） | 61 | 0 | 292 / 892 |
| ~/.agents/skills | 89 | 0 | 272 / 892 |
| workspace/.agents/skills | 32 | 0 | 376 / 896 |
| workspace/skills | 191 | 4 | 73 / 762 |

- 磁盘上 385 个不同的名字，**75 个重名**（同名多份，按优先级只留一份）。最大的一块是 `~/.agents/skills` 盖掉 `~/.openclaw/skills` 的 40 个。重名不占目录预算，但 Gateway 每次加载都打一条 `Skill precedence collision`，最近 6 小时 7,301 条。
- **4 个无效**（缺 description，被跳过，6 小时各报 152 次）：workspace 的 `material-application-map`、`landing-page-frontend-generation`、`caption-treatment-form`，以及 dealclaw workspace 的 `data-selection`。
- 去重、按配置禁用、按依赖筛选之后，makaron 可用 339 个。

## 4. 清理方案（Tianyi 10/26 已逐组拍板）

只用官方配置，不改 dist；本 PR 不删文件。工具 `scripts/v-skills-catalog.mjs`，清单 `config/v-skills-catalog.json`。

**关掉 59 个**（`skills.entries.<key>.enabled = false`，热生效，可用 `restore-hot` 撤回）。每一个都对照过 600 个会话的真实读取：

| 组 | 决定 | 数量 | 技能 |
|---|---|---|---|
| 企业微信 CLI | 合并进 `wecom-unified` | 17 | wecomcli-calendar/contact/disk/doc/doc-manage/email/media/meeting/message/msg/preflight/schedule/sheet/smartpage/smartsheet/todo、wecom-webhook-bot |
| 飞书 lark 从没读过的 | 合并 | 9 | lark-attendance、lark-event、lark-minutes、lark-note、lark-okr、lark-skill-maker、lark-whiteboard、lark-workflow-meeting-summary、lark-workflow-standup-report |
| hyperframes 子技能 | 卸载 | 7 | hyperframes-animation/creative/keyframes/registry/studio、remotion-to-hyperframes、website-to-hyperframes |
| 通用前端 | 卸载 | 12 | animejs、css-animations、figma-reference-replication、gsap、lottie、remotion-best-practices、supabase、supabase-postgres-best-practices、tailwind、three、typegpu、waapi |
| 随运行时、从没读过 | 停用 | 7 | meme-maker、node-inspect-debugger、notion、python-debugpy、spike、taskflow-inbox-triage、tmux |
| 漫剧 | 卸载 | 4 | manju-character-card、manju-production、manju-prop-card、manju-scene-card |
| 不要了 | 卸载 | 3 | dam-combo-remix、image-generation、taobao-flash-sale-kv |

- `wecom-unified` 本身就是企业微信全域路由，`references/` 下有每个业务域的说明；渠道投递用的 wecom-send-media、wecom-send-template-card、wecom-customer-push 保留。lark 组关掉后文件还在，lark-shared 等常用的不动。
- 按真实读取从清单里拿掉了 2 个：`lark-user-auth-flow`（5 次 / 4 个会话，10-23）、`hyperframes-audio`（1 次，10-24）。
- 保留（Tianyi 决定）：被同类替代的 5 个、makaron 业务 7 个、爆款 viral-* 3 个、第 7 组其余的。

**放开预算**：`skills.limits = { maxSkillsInPrompt: 400, maxSkillsPromptChars: 48000 }`。`skills` 在 9.1 是 reload kind `none`（每次运行重新读取，不需要重启）。

清理后（V 上离线重算，生产 dist + 生产技能目录 + 本清单）：

| 字符预算 | 可用 | 进入 prompt | prompt 字符 | 描述 |
|---|---|---|---|---|
| 18,000（现状） | 339 | 109 | 17,953 | 无 |
| 40,000 | 280 | 249 | 39,884 | 无 |
| 46,000 | 280 | **280** | 45,088 | 无 |
| **48,000（本 PR）** | 280 | **280** | 45,088 | 无，留约 18 条给新建技能 |
| 60,000 | 280 | 280 | 59,942 | 截到 41 字 |
| 75,000 | 280 | 280 | 74,994 | 截到 148 字 |

代价：技能目录从约 18k 字符涨到约 45k 字符，按每 token 3.5 字符估算，每轮多约 8k 输入 token（大部分能命中前缀缓存）。要带上可用的描述需要 75,000（多约 16k token），由 Tianyi 决定。

**卸载的 26 个（文件删除，本 PR 不执行）**：关掉后由 Tianyi 批准、走发布流程删除；同名的多份副本一起删。

| 技能 | 组 | 位置（`<ws>` = workspace） |
|---|---|---|
| animejs | 通用前端 | `<ws>/.agents/skills/animejs` |
| css-animations | 通用前端 | `<ws>/.agents/skills/css-animations` |
| figma-reference-replication | 通用前端 | `<ws>/skills/figma-reference-replication` |
| gsap | 通用前端 | `<ws>/.agents/skills/gsap` |
| lottie | 通用前端 | `<ws>/.agents/skills/lottie` |
| remotion-best-practices | 通用前端 | `~/.openclaw/skills/remotion-best-practices` |
| supabase | 通用前端 | `~/.agents/skills/supabase` |
| supabase-postgres-best-practices | 通用前端 | `~/.agents/skills/supabase-postgres-best-practices` |
| tailwind | 通用前端 | `<ws>/.agents/skills/tailwind` |
| three | 通用前端 | `<ws>/.agents/skills/three` |
| typegpu | 通用前端 | `<ws>/.agents/skills/typegpu` |
| waapi | 通用前端 | `<ws>/.agents/skills/waapi` |
| hyperframes-animation | hyperframes | `~/.openclaw/skills/…`、`~/.agents/skills/…` |
| hyperframes-creative | hyperframes | `~/.openclaw/skills/…`、`~/.agents/skills/…` |
| hyperframes-keyframes | hyperframes | `~/.openclaw/skills/…`、`~/.agents/skills/…` |
| hyperframes-registry | hyperframes | `~/.openclaw/skills/…`、`~/.agents/skills/…`、`<ws>/.agents/skills/…` |
| hyperframes-studio | hyperframes | `~/.openclaw/skills/…`、`~/.agents/skills/…` |
| remotion-to-hyperframes | hyperframes | `<ws>/.agents/skills/remotion-to-hyperframes` |
| website-to-hyperframes | hyperframes | `<ws>/.agents/skills/website-to-hyperframes` |
| manju-character-card | 漫剧 | `~/.agents/skills/manju-character-card` |
| manju-production | 漫剧 | `~/.agents/skills/manju-production` |
| manju-prop-card | 漫剧 | `~/.agents/skills/manju-prop-card` |
| manju-scene-card | 漫剧 | `~/.agents/skills/manju-scene-card` |
| dam-combo-remix | 不要了 | `<ws>/.agents/skills/dam-combo-remix` |
| image-generation | 不要了 | `~/.openclaw/skills/image-generation` |
| taobao-flash-sale-kv | 不要了 | `~/.agents/skills/taobao-flash-sale-kv` |

## 5. 后续（不在本 PR）

- 删除重名的旧副本（75 个，主要是 `~/.openclaw/skills` 下被 `~/.agents/skills` 盖掉的 40 个），消除每 6 小时 7 千条告警。属于删除，需要批准。
- 修 4 个无效技能（补 description 或移走）。它们在 workspace 里，不在本仓库。
- 想带描述又不想加太多 token，只能继续减条数或缩短路径；路径由技能目录位置决定，配置改不了。

## 6. 上线与撤回

`scripts/v-skills-catalog.mjs apply-hot`（只写 openclaw.json，Gateway 不重启，打印备份路径）→ 约 10 s 后 `scripts/v-workers-roll.mjs skills-catalog`（Worker 重新派生 worker-openclaw.json 并排空换代）→ `check`，两份配置都应显示 `limitsDiffer: false, stillEnabled: 0`。撤回：`restore-hot --backup <备份>`（把 skills 整段恢复成备份）+ roll。

## 7. VLab candidate

`lab/candidate/skills-catalog.mjs`：用 V 的技能 frontmatter（`lab/candidate/skills-catalog-capture.mjs` 抓取，只有元数据，不进仓库）在私有 workspace 里重建技能集合，私有 Gateway + 1 个 Worker + 真实 DeepSeek，Gateway 运行中热改配置再 roll。VLab 主机少一些命令行依赖，候选里可用技能比 V 少（225 对 339）；路径也更长（约 110 字符对 72），所以候选里的条数不等于生产条数，生产条数以第 4 节的 V 离线重算为准。

第一轮（candidate-77ff92cd，清单为 Tianyi 拍板前的 101 个、预算 40,000）：

| 步骤 | 结果 |
|---|---|
| 改前，新会话列目录 | 71/225，截断提示在，列出的名字里没有 makaron、lark-doc |
| 改前，「用 makaron 生成主图」 | agent 先 `ls` 技能目录，再读到 makaron（说明不在目录里也能被翻到） |
| 热改 + roll | 不重启；roll 11 s，Worker 代际 1→2；worker-openclaw.json 自动带上 limits 和 101 个禁用 |
| 改后，同一个旧会话 | 快照版本更新，162 条进 prompt，列出 makaron、lark-doc |
| 改后，新会话 | 162 条；「用 makaron」直接 `read` makaron/SKILL.md |
| 系统提示总长 | 46,979 → 68,969 字符 |

第二轮（candidate-1317bbc9，最终清单 59 个、预算 48,000）：

| 步骤 | 结果 |
|---|---|
| 改前，新会话列目录 | 71/225，没有 makaron、lark-doc |
| 改前，「用 makaron 生成主图」 | 7 次 `ls`/`grep` 翻技能目录后才读到 makaron/SKILL.md |
| 热改 + roll | 不重启；roll 8 s，代际 1→2；worker-openclaw.json 带上 limits 48,000 和 59 个禁用 |
| 改后 prompt | **179/179 全部进入**（`systemPromptReport.skills.entries` = 179），没有截断提示 |
| 改后，同一个旧会话列目录 | prompt 里已是 179 条，但模型照抄了它上一轮的回答（73 个名字）：这是会话历史的影响，不是 prompt 没刷新 |
| 改后，新会话列目录 | 179 个，含 makaron、lark-doc |
| 改后，「用 makaron 生成产品主图」 | 一步直接 `read`，但读的是 **makaron-ad-creator** 而不是 makaron |
| 系统提示总长 | 46,979 → 73,192 字符 |

最后一行说明了「只有名字」的局限：模型从 179 个名字里按字面挑，「产品主图」被它对到了 ad-creator。生产上 makaron 有 AGENTS.md 明确指路，不受这个影响；但没人指路的技能，只靠名字选会选错。要让目录真正有用，需要带描述（预算 75,000，或继续减条数），这一项由 Tianyi 决定。
