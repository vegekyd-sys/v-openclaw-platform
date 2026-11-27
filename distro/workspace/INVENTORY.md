# 可安装 V 的工作区盘点

2026-11-27 CST，对照 V 的活工作区（只读）、V Core（`vegekyd-sys/v-core`）和 Mirror V v20 的 payload 做的分类。
机器可读的分类在 `carry.txt`（带）、`skip.txt`（不带）、`decide.txt`（等决定）；`sync.mjs` 用它们做审阅门，
这份文件解释为什么。全局 skill 的分类在 `global-skills.json`。

口径（用户 2026-11-27 定）：单一主人；写飞书（文档、日程、任务、多维表）和主动推进（Heartbeat，每 6 小时一轮，汇报给主人）都和 V 一样；
记忆从零开始；保留 Mirror 的飞书上手引导。

## 规模

| | 数量 |
|---|---|
| V 工作区 `skills/` 目录 | 303（178 个进过 git，125 个从未提交） |
| 其中带 | 47 |
| 其中不带 | 241 |
| 其中等决定 | 15 |
| 工作区自己的（不来自 V） | 6：`proactive-heartbeat`、`memory-cold-start`、`agent-to-agent-protocol`、`v-browser-device`、`vsync`*、`agent-to-agent-protocol-feishu-a2a-defaults`* |
| 全局 skill（`~/.agents/skills`、`~/.openclaw/skills`） | 约 100，见 `global-skills.json` |

\* 这两个是 Mirror v20 从 V 带来的，在 `decide.txt` 里等决定；payload 里暂时保留 Mirror 的版本（不随 V 更新）。

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
| 主动推进 · 每日复盘 | 12:00 | 关（见 decide） |
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

## 四、需要用户决定（decide.txt）

| 条目 | 问题 | 我的建议 |
|---|---|---|
| `vsync`、`agent-to-agent-protocol-feishu-a2a-defaults` | 客户版要不要能和 V / VSync Hub 互通 | 本客户不带（单主人、单 V）；payload 里 Mirror 的两份先留着不随 V 更新，定了再删或转 carry |
| `computer-use` | 电脑代操作规则 | 带，但要去个人化重写（去掉收货地址、付款习惯、V 的 Chrome profile）；前提是 A 线给客户机装桌面 / 浏览器。AGENTS.md 已有通用的分工原则 |
| `background-worker-contract` | 客户运行时带不带 Worker 池 | 随 A 线：带 Worker 就带它 |
| `browser-fast-run` | 依赖 V 的逐步决策模型账号 | 不带 |
| `youtube-video-download`、`skill-inventory-export` | 通用，但写死 V 的路径 / 用 V 的客户举例 | 改写后带，优先级低 |
| `meshy-image-to-3d` | 需要 Meshy key | 客户有需求再带 |
| `makaron-ad-creator` | 取决于客户是否开通 Makaron | 开通就随 makaron-cli 装全局版 |
| `openclaw-disk-full-recovery` | 自托管运维给 V 还是给部署方 | 不带（部署方维护） |
| `scene-*` | 客户买 Scene 才有意义 | 不带 |
| `qcc-company-lookup` | 要客户自己的企查查账号 | 客户有账号再带 |
| `meeting-co-pilot` | 依赖 V 的飞书会议接入服务 | 不带 |
| `lark-user-routing` | 多人共用一个 V 时的飞书身份路由 | 单主人不带，多人版再带 |
| 主动推进 · 每日复盘（schedules.json，默认关） | V 是在项目群里和主人一起复盘 | 先关；主人觉得主动提醒需要调教时再开，发到主人私聊 |
| 全局：演示 / 网页类（`frontend-slides`、`pptx` 等）、hyperframes | 见 `global-skills.json` | 演示类带（钉版本），hyperframes 按需 |

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

## 六、要在 V 活工作区上提交的（由用户决定，本线没有在 V 上做任何改动）

1. **`/scripts/*.mjs` 被 V 工作区 `.gitignore` 挡住**：`apify-client.mjs`、`apify-search.mjs`、`apify-worker-io.mjs`、`heartbeat-v2-stream-guard*.mjs` 从未进 git。
   要么 `git add -f`，要么改 `.gitignore`；否则 v-core 的每日同步永远拿不到它们的更新（本次是手工拷进 v-core 的）。
2. **从未提交、已进 v-core PR 的 21 个 skill**：上面标「从未提交」的那些。在 V 上提交后，v-core 每日同步会认领它们（同步基线前进以后不会冲突）。
3. **已改未提交**：`scripts/heartbeat-dispatch.py`（回执文件是列表时的兼容，`_send_dispatch_report`）、`skills/makaron`（COMPOSITE.json、feishu / official 两部分、nsfw 参考）、
   `skills/tiktok-publish-copy`（7 个文件）。
4. **Heartbeat V2 本体**：上面四个文件。它们属于 V 的个人部分，进不进 V 自己的 git 由用户定；客户版不依赖它们。
5. `skills/tiktok-publish-copy/references/cases.md` 是客户真实文案，建议加进 V 服务器上 v-core 同步的私有排除表（本线看不到也不改那个文件）。

## 七、已知缺口

- 写飞书的用户身份权限名（`docx:document`、`calendar:calendar`、`task:task:write` 等）按飞书惯例写，以客户租户上 `lark-cli auth scopes` 的结果为准；没开通不挡上手，只是那一类写不了。
- 没有在真实飞书租户上跑过一遍完整上手（扫码授权 → 初稿 → 登记定时任务 → 第一轮主动推进）。下周装客户前需要在 VLab 或测试租户上走一遍。
- `vsync`、`agent-to-agent-protocol*`、`v-browser-device` 是 Mirror 的版本，留在 payload 里没有删，等第四节的决定。
- 依赖检查只看 skill 正文：`social-search-apify-first` 提到 V 上的 `apify-douyin-search.py`、`weixin-sph-download.py`、`bilibili-browser-download.mjs`，客户机上没有，skill 会退回别的路径。
