# 可安装 V 的工作区盘点

2026-11-27 CST，对照 V 的活工作区（只读）、V Core（`vegekyd-sys/v-core`）和 Mirror V v20 的 payload 做的分类。
机器可读的分类在 `carry.txt`（带）、`skip.txt`（不带）、`decide.txt`（等决定，目前为空）；`sync.mjs` 用它们做审阅门，
这份文件解释为什么。全局 skill 的分类在 `global-skills.json`。

口径（用户 2026-11-27 定）：单一主人；写飞书（文档、日程、任务、多维表）和主动推进（Heartbeat，每 6 小时一轮，汇报给主人）都和 V 一样；
记忆从零开始；保留 Mirror 的飞书上手引导。

## 规模

| | 数量 |
|---|---|
| V 工作区 `skills/` 目录 | 306（2026-11-27 晚复核；初版盘点时 303） |
| 其中带 | 52 |
| 其中不带 | 254 |
| 其中等决定 | 0（2026-11-27 全部定了，见第四节） |
| 工作区自己的（不来自 V） | 4：`proactive-heartbeat`、`memory-cold-start`、`agent-to-agent-protocol`、`v-browser-device` |
| 全局 skill（`~/.agents/skills`、`~/.openclaw/skills`） | 约 100，见 `global-skills.json` |

`vsync`、`agent-to-agent-protocol-feishu-a2a-defaults` 原是 Mirror v20 带来的副本，2026-11-27 起改为随 V 更新（carry），工作区只保留各自的「接收端」改写。

## 一、通用，要带（carry.txt）

判断标准：对任何主人都成立；不需要 V 的主机、账号、客户项目；内容里的 V 专有路径、id、人名能被脱敏规则改写掉。

### 记忆与自我进化（Mirror 已带，继续带）
Librarian 一整套（`librarian-*.py`、`memory/SCHEMA.md`、`memory-graph.*`、`memory-auto-index.py`、`compress-memory.py`、`wiki-maintenance.py`、两组测试）、
Knight heartbeat（`heartbeat.py`、`heartbeat-dispatch.py`）、反思与 skill 候选（`write-reflection.py`、`reflection-*.py`、`write-skill-candidate.py`、`skill-candidate-rollback.py`），
以及 `long-term-memory-update`、`memory-promotion-audit`、`librarian-semantic-reconcile`、`proactive-agent`、`skill-creation-coach`、`skill-gate`、`openclaw-harness-evaluation`。
理由：这是「V 会成长」的那部分，和主人是谁无关。

### 飞书：卡片与替主人写（新增）
| skill | 理由 | V 上状态 |
|---|---|---|
| `feishu-channel-cards` | 回复卡片（图表、指标、时间线），AGENTS.md 的卡片规则依赖它；V 的 Night Shift 进度卡那一页不带 | 已进 git |
| `lark-cli-permission-issue-troubleshooting` | lark-cli 权限报错的排查流程 | 已进 git |
| `feishu-base-schedule-write`、`feishu-bitable-deliver`、`feishu-doc-append-batch`、`feishu-doc-permissions`、`feishu-doc-rewrite-audit`、`feishu-large-file-fetch`、`feishu-send-image`、`feishu-sheet-deliver`、`feishu-sheet-to-doc` | 「写飞书和 V 一样」：建表写入、追加文档、开权限、发图、大文件、表格转文档，都是 V 实际踩过坑后的做法 | **从未提交**，本次进 v-core |

### 搜索与调研
`social-search-apify-first`、`image-search-apify-first`、`technical-project-research`，以及它们调用的 `scripts/apify-client.mjs`、`apify-search.mjs`、`apify-worker-io.mjs`
（**V 上被 `.gitignore` 的 `/scripts/*.mjs` 挡着，从未进 git**，本次进 v-core）。需要安装时配 `APIFY_API_KEY`，没有就退回 `web_search`。

### 创作、文档、演示
Mirror 已带：`makaron`（只带官方部分）、`makaron-video`、`makaron-remotion-materialize`、`html-poster-design`、`html-executive-pitch-deck-iteration`、`image-production-routing-qc`、
`creative-production-orchestrator`、`corporate-video-script`、`auto-travel-vlog`、`meshy-3d-agent`、`tiktok-publish-copy`（不带客户案例库）、`viral-*` 三个。
新增（均**从未提交**，本次进 v-core）：`makaron-long-video-production`、`pdf-deck-localization`、`qr-image-decode`、`deterministic-frame-animation`、
`video-flicker-judder-qc`、`video-text-removal`、`log-footage-restore`、`interview-film-cut`、`shortvideo-packaging`、`jianying-subtitle-audio`、`brand-logo-film`、`ai-visibility-audit`。
理由：通用的制作 / 质检手艺，正文里的「客户」指主人自己的客户。Makaron 相关需要 `MAKARON_API_KEY`。

## 二、工作区自己写的（不来自 V，sync 不碰）

| 文件 | 做什么 |
|---|---|
| `AGENTS.md` | Mirror 的版本 + V 有而 Mirror 缺的行为小节，改写成对任何主人成立：调工具前先说一句、递归搜索要过滤、ask_user 选择题、电脑操作分工（推到最后一厘米）、高消耗先对齐、素材齐了再开工、飞书卡片、跨会话协作、群聊规则与表情、Makaron 入口、主动推进 |
| `SOUL.md`、`IDENTITY.md`、`USER.md`、`REDLINES.md`、`MEMORY.md`、`TOOLS.md` | 去掉 Vercel 沙箱和 Portal；飞书改成「机器人自己的企业应用 + 主人授权」，可以替主人写，对别人发东西先确认；数据主权按私有部署说 |
| `onboarding/`、`skills/memory-cold-start`、`scripts/feishu-docs.py`、`onboard-*.py`、`librarian-ask.py`、`index-compact.py`、`memory-index-verify.py` | Mirror 的飞书上手引导，保留；第 0 步先认主人，最后一步登记后台任务；一次性后续任务改走 OpenClaw cron；写飞书的用户权限作为可选权限一起授权 |
| `schedules.json` + `scripts/v-schedule.py` | 9 条系统定时任务（下表），上手引导结束时用 `openclaw cron add --declaration-key distro:<key>` 登记，只补缺的、不改主人改过的 |
| `skills/proactive-heartbeat` + `scripts/heartbeat-assistant.py` | **Heartbeat V2 的通用版**（见第五节） |

| 定时任务 | 时间 | 默认 |
|---|---|---|
| 主动推进 | 每 6 小时（02:30/08:30/14:30/20:30） | 开 |
| 主动推进 · 每日复盘 | 12:00 | 开（2026-11-27 定，和 V 一致；没发过提醒就静默） |
| Heartbeat 维护 | 08:00、20:00 | 开 |
| Memory Librarian 编译 / 质检 | 21:00 / 22:00 | 开 |
| 午夜报告 | 00:00 | 开 |
| Skill 周复盘 | 周日 20:00 | 开 |
| 飞书文档同步 | 20:30 | 开 |
| Memory 导入补编 | 03:00、05:00、07:00 | 开 |

## 三、不带（skip.txt，按类）

| 类 | 例子（glob） | 理由 |
|---|---|---|
| 主人个人生活 | `tianyi-*`、`voice-tianyi`、外卖 / 打车 / 本地生活、家里设备、个人财务、家人学习计划 | V 是一个人的助手，这些是那个人的 |
| V 自身运维 | `v-*`、`launch-mirror-v`、云账号、CDN、部署目标、网关 / 运行时运维、语音账号、Universal Memory、技能优化实验、GPU 机器 | 依赖 V 的主机和账号；客户机的运行时由发行包管 |
| Makaron / Scene 产品运营 | `makaron-app-*`、`makaron-marketing-*`、Makaron 飞书卡片服务（`skills/makaron/parts/feishu`）、`scripts/makaron-*`、`scripts/scene-*` | V 在公司里的专职工作，依赖 V 的卡片 runner 与账号路由 |
| 客户与业务管线 | 星擎、奥创、米奥、DealClaw / 小元、GeeLark / FCloud 云机、WhatsApp/WABA、夜班、内容工厂、展会、拍摄、客户策划 / 报表 / 素材 | 客户数据、客户账号、客户端点 |
| 开发与排障 | DealClaw 开发、渠道开发、Makaron 计费、生产库查询 | 针对 V 维护的代码库 |
| V 的脚本 | V 工作区 `scripts/` 下 676 个条目（约 2,300 个文件）里，除上面带走的 25 个，全部不带：客户批处理（`xq-*`、`render-*-cards.js`、`zhicheng-*` 等）、V 主机巡检、V 的复盘与看板 | 客户项目或 V 主机专用；被带走的 skill 若提到没带的脚本，`sync.mjs` 会报 MISSING DEPENDENCY |
| 杂项 | `tone-aesthetics`（没有 SKILL.md，只有产出物）、`skills`（误建的空目录）、`11`（客户调研） | 不是 skill |

## 四、原「等决定」的条目（2026-11-27 定）

Tianyi 定了三条：VSync 要带、桌面接管要带、每日复盘要开；其余按「和 V 一致、能用就带」处理。`decide.txt` 现在是空的。

| 条目 | 结果 | 为什么 |
|---|---|---|
| `vsync` | **带**（carry） | Tianyi 定。随 V 更新；工作区保留「装好的 V 作为接收端」一节（没有 hub 权限时走飞书文件 + sha256 + @ 回执）。`scripts/vsync-*` 不带：打包脚本写死 V 的包清单，拉取脚本是 V 的运维 |
| `agent-to-agent-protocol-feishu-a2a-defaults` | **带**（carry） | 同上。V 的 open_id 换成「从任务里取发送方的 open_id」；通用的 `agent-to-agent-protocol` 本来就在 payload 里 |
| `computer-use` | **带**（carry） | Tianyi 定。判断和流程原样随 V；V 自己的环境（V 的 Chrome 与主人 Mac Chrome 的分流表、profile 名、V 的邮箱、支付宝 AI 付）改写成通用说法；V 的实测记录 `references/session-evidence-*` 不带。AGENTS.md 指向它 |
| `background-worker-contract` | **带**（carry） | A 线的客户运行时带 Worker 池；夜班一节和 V 的客户 CLI 例子去掉 |
| `qcc-company-lookup` | **带**（carry） | 通用，主人自己配企查查 token 就能用，没配会说明怎么配 |
| `scene-*` | 官方 `scene-cli` 作为**全局 skill 装**（`global-skills.json`）；工作区的 `scene-*` 不带 | Scene CLI 是公开的，主人建个人 key 就能用；V 的飞书搜索站卡片、产线 helper 依赖 V 的服务 |
| `makaron-ad-creator` | 作为**全局 skill 装**（随 makaron-cli） | 和其余 makaron 全局 skill 一起 |
| `browser-fast-run` | 不带 | 写死 V 的 Chrome 端口和 V 的决策模型账号，客户机上跑不起来 |
| `meeting-co-pilot` | 不带 | 依赖 V 自己的飞书会议接入服务 |
| `lark-user-routing` | 不带 | 多人共用一个 V 的身份路由，客户版只有一位主人 |
| `youtube-video-download`、`meshy-image-to-3d`、`skill-inventory-export`、`openclaw-disk-full-recovery` | 暂不带 | V 上从未进 git、v-core 里没有，跟不了 V 的更新；要带先在 V 上提交、进 v-core 的 scope，再移进 `carry.txt` |
| 主动推进 · 每日复盘 | **默认开** | Tianyi 定。发到主人私聊，过去 24 小时没发过提醒就 `NO_REPLY` |
| 全局：`frontend-design`、`frontend-slides`、`remotion-best-practices`、hyperframes 一组 | **装**（`global-skills.json` 写了确切的上游提交，按 git 对象 hash 与 V 的文件对过） | 和 V 一致；hyperframes 需要 Chrome 和 ffmpeg。`pptx` 不装：Anthropic 的 pptx 不是开源许可，不能随客户包分发 |
| 全局：V 自己的副本（`image-generation`、`ppt-template-batch` 等六个） | 不带 | 从未进任何仓库 |

## 五、Heartbeat V2 的通用版

V 的 Heartbeat V2（「V 先知」）由三个从未提交的脚本加一个放在记忆目录里的引擎组成（`heartbeat-personal-assistant.py`、`heartbeat-v2-choice.py`、
`heartbeat-v2-feedback.py`、`memory/projects/new-heartbeat/personal-assistant/assistant.py`），提示词里写死了主人的 open_id、私聊和项目群、
家人名字、具体纠正记录和投递隔离细节。照搬既不通用也会泄露，所以重写：

- **保留的原则**（来自 V 的实际纠正）：一件事的发现、原因、方案、结果算一件事，24 小时只占一次；先看最近提醒过什么；判断是谁的事、谁在办、为什么现在说；
  没有真正有用的就沉默，沉默不是失败；不制造任务、不按配额凑数、某类事占比太高时主动换方向；内部可逆的准备直接做、对外的只提议；
  主人「先不用」只针对那件事；沉默不等于同意；工程失败不发给主人；反馈分清写法问题和内容价值；每日复盘按「件」数而不是按条数。
- **换掉的机制**：V 的私有投递 / 读回 / 隔离账本换成 cron 的 announce 投递到主人私聊（最终回复就是消息，或 `NO_REPLY`），
  加一个只做记账的 `heartbeat-assistant.py`：`context`（材料与最近提醒）、`check`（同一件事 24 小时、静默时段、主人频率、主人说过别提）、
  `record`（发出前登记）、`feedback`（主人原话）、`review`（每日复盘材料）。判断全部留给模型，规则写在 `skills/proactive-heartbeat/SKILL.md`。
- 频率和静默时段取自 USER.md（上手引导里问），默认每天、23:00–08:00 静默。

## 六、在 V 活工作区上的提交

1. 2026-11-27 已提交（Tianyi 批准）：上面标「从未提交」的 21 个 skill 和 `scripts/apify-client.mjs`、`apify-search.mjs`、`apify-worker-io.mjs`（`.gitignore` 的 `/scripts/*.mjs` 挡着，用 `git add -f`），
   V 工作区提交 `dcad4523`，只含这 24 个文件，字节与 v-core main 相同；没有 push（v-core 的每日同步只读工作区的本地提交）。下一次同步会把它们列为 pending（v-core 先有了同样的文件），合掉那次滚动 PR 即清。
2. 仍未提交、等 Tianyi 定：`scripts/heartbeat-dispatch.py`（回执文件是列表时的兼容）、`skills/makaron`（COMPOSITE.json、feishu / official 两部分、nsfw 参考）、`skills/tiktok-publish-copy`（7 个文件）。
3. **Heartbeat V2 本体**（`heartbeat-personal-assistant.py`、`heartbeat-v2-choice.py`、`heartbeat-v2-stream-guard*.mjs` 和记忆目录里的引擎）属于 V 的个人部分，进不进 V 自己的 git 由用户定；客户版不依赖它们。
4. `skills/tiktok-publish-copy/references/cases.md` 是客户真实文案，建议加进 V 服务器上 v-core 同步的私有排除表（本线看不到也不改那个文件）。

## 七、已知缺口

- 写飞书的用户身份权限名（`docx:document`、`calendar:calendar`、`task:task:write` 等）按飞书惯例写，以客户租户上 `lark-cli auth scopes` 的结果为准；没开通不挡上手，只是那一类写不了。
- 没有在真实飞书租户上跑过一遍完整上手（扫码授权 → 初稿 → 登记定时任务 → 第一轮主动推进）。下周装客户前需要在 VLab 或测试租户上走一遍。
- `computer-use` 和 `vsync` 在工作区里改写过几段：V 以后改到同一段时同步会报冲突，要人按第四节的原则合。
- `v-browser-device` 仍是 Mirror 的版本（V 的全局 skill，依赖 V Browser 服务）。
- 依赖检查只看 skill 正文：`social-search-apify-first` 提到 V 上的 `apify-douyin-search.py`、`weixin-sph-download.py`、`bilibili-browser-download.mjs`，客户机上没有，skill 会退回别的路径。
