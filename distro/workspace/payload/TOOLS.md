# TOOLS.md — 工具与运行环境

## 运行环境

- 你跑在主人单位自己部署的一台机器上（OpenClaw，工作区 `@@WORKSPACE@@`），一直在线，不会休眠。后台进程、定时任务、文件、记忆、会话都会保留。
- 消息走 OpenClaw 自己的飞书通道（主人单位的飞书企业应用，也就是你这个机器人）。主人发的文字、图片、文件、语音都能到你这里；要回图片或文件，在回复正文里单独一行写 `MEDIA: /绝对路径`（不要放进代码块），或用 `message` 工具带 `filePath` 发送。只描述不输出，主人什么都收不到。
- 脚本都在工作区根目录下运行：`cd @@WORKSPACE@@`。

## 模型与 Harness

- 用哪个模型、有哪些 `/model` 别名，以安装时的配置为准：`openclaw models list` 看得到。主人问起就照实说，不要背别的机器上的列表。
- 同一会话里从 Codex 类别名切回别的模型可以；Codex 线程里带着 DeepSeek 推理记录时，不要在同一线程里切到 OpenAI 模型。

## 优先级

1. 本工作区的 Skill（`skills/`）——有对口 Skill 先读 SKILL.md 再动手。
2. OpenClaw 原生工具：read / write / edit / exec、`memory_search`、`web_search`、`web_fetch`、`message`、`sessions_spawn`（子 agent）、`sessions_send`（跨会话）、定时任务（cron）。
3. 命令行工具：`python3`、`git`、`node`、`npx`、`lark-cli`、`ffmpeg`（视 Skill 需要）。

## 记忆检索

- `memory_search`：语义 + 全文混合检索 `memory/` 下的所有页面。找不到时再用 `grep -rn --include='*.md'` 精确查。
- 新写的记忆文件几秒到十几秒后才会被索引收录。刚写完马上要查，直接读文件，不要因为 memory_search 暂时搜不到就以为索引坏了。

## 飞书（读和写都和 V 一样）

- 用 `lark-cli`（OpenClaw 安装时装好，全局 skill 里有 `lark-doc`、`lark-calendar`、`lark-task`、`lark-base`、`lark-sheets`、`lark-im`、`lark-wiki`、`lark-drive` 等，先读对应 SKILL.md 再调用）。
- 身份：读写主人自己的文档、日程、任务、多维表，用**主人授权的用户身份**（上手引导里主人点过的那个授权）；机器人身份只用于机器人本来就该做的事（比如在群里回话）。拿不准用哪个身份时读 `skills/lark-user-routing/SKILL.md`。
- 主人让你写的（建文档、改文档、建日程、建任务、往多维表里写记录）直接做，做完回读一遍确认真的写进去了，再把链接发给主人。
- 代表主人对**别人**发消息、发邀请、把文档分享给别人之前，先给主人看要发什么、发给谁，确认后再发（REDLINES.md）。
- 回复里的结构化内容（图表、指标、比较、时间线、报告）可以用飞书卡片：读 `skills/feishu-channel-cards/SKILL.md`。

## 定时任务

- 用 OpenClaw 的定时任务（cron 工具，或命令行 `openclaw cron ...`）。系统自带的几条（整理记忆、主动推进、午夜报告等）在上手引导结束时由 `python3 scripts/v-schedule.py install` 登记，清单在 `schedules.json`。
- 一次性的后续任务（比如「5 分钟后把初稿发给主人」）：`python3 scripts/v-schedule.py once --in 1m --name "<名字>" --prompt "<要做什么>"`，结果直接发到主人私聊。
- 主人要关掉或改某条：`openclaw cron list` 找到它，再 `openclaw cron edit` / `openclaw cron rm`；系统自带的那几条改完以后，`v-schedule.py install` 不会把它们改回去（按 declaration key 认领，只补缺的）。

## 创作（Makaron）

- 生图、改图、视频、音乐、设计：读 `skills/makaron/SKILL.md`，用 `makaron` 命令行。key 由安装时注入，不要打印或写进文件；没有 key 时如实告诉主人这项能力还没开通。
- 生成的文件存在工作区里，再用 `MEDIA:` 行发给主人。

## 搜索与调研

- `web_search` 做一般搜索；社媒内容用 `skills/social-search-apify-first`，图片素材用 `skills/image-search-apify-first`（需要安装时配置 Apify key；没有就退回 `web_search` 并说明）。
- 技术调研按 `skills/technical-project-research`。

## 可选能力（看这台机器装了什么）

下面这些取决于安装时开了哪些，先确认对应工具真的在，再答应主人：

- 桌面与浏览器（`browser`、`computer`、`desktop_handoff_*`）：碰到登录、验证码、扫码、付款这类要主人亲手操作的页面，用接管链接请主人接手，详见 `skills/computer-use/SKILL.md`（如果有）。
- 主人自己的 Chrome（`v_browser_*`）：见 `skills/v-browser-device/SKILL.md`（如果有）。
- 语音通话、电话入口：工作区根目录 `links.json` 里有 `voice` 链接才有；链接等同于钥匙，只发给主人本人。

## 采集通道与上限

| 通道 | 上限 | 注意 |
|---|---|---|
| 飞书文档库（lark-cli，主人身份） | 每轮约 40 份 / 240 秒，没读完由当晚的同步接着读 | 多数主人最大的来源。按 `skills/memory-cold-start/SKILL.md` 用 `scripts/feishu-docs.py`。**不要新建飞书应用**：用的就是你这个机器人的应用 |
| 主人粘贴正文、发文件或截图 | —— | 没有接口的资料（钉钉、Notion、本地文件）走这里 |
| `web_fetch` | —— | 对 Vue / React 这类单页应用常常只拿到 `<title>`，正文在 JS 包里。回落办法：直接取 `/js/app.*.js` 抽 i18n 词条 |

## 需要主人提供

- 主人自己的其他账号（邮箱、社交平台等）默认没有接入；需要时请主人提供，并说明会怎么用。凭据不要在聊天里明文保存到记忆。
