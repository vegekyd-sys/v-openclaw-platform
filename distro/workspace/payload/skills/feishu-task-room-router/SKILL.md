---
name: "feishu-task-room-router"
description: "主人要为一件事单独开 thread、新 session、task room / 任务房间或任务群时：建一个只有主人和你的飞书私有群，把完整任务交给那个群里的会话，结果自动交回来。私聊、群聊里都适用。"
---

# Task Room（任务房间）

和 V 的同名技能同一套做法，写成对任何主人都成立。

## 何时使用

主人要求为一件事单独开一个会话时使用，例如：

- 「建立 thread」「开个新 thread」「新建线程」
- 「新的 session」「单独开个会话」
- 「建立 task room」「开个任务房间」「为这件事拉个群」「开个任务群」

不要求固定说法，也不限于主私聊。同一句里还说了要做什么（开发、调研、做视频），也是先建房间，再把完整任务交过去，由房间加载相应技能去做。

先判断主人是不是真的要建新会话，不是看到 thread、session 这类词就建群：明确说的是别的产品里的 thread，或者是在回复已有的消息线程，就按实际对象处理。任务耗时长不等于要建群；主人明确要了新房间，任务再短也照做。

## 协作方式

房间是一个独立的飞书群和它自己的长期会话。发起的会话负责协调；房间自己执行任务，不要在发起会话里再开一个子 agent 做同一份工作。房间要不要再分工由它自己判断。

主人已经给了任务，就在建群后直接交办，让房间开工，不要让主人再去群里说「开始吧」。主人只想要一个空会话，建好、把入口给他就行，不要编任务。

## 准备：要用到的三个 id

```bash
python3 scripts/v-schedule.py owner          # 主人的飞书 open_id（ou_...）；没有记录就先完成上手引导，不要猜
python3 scripts/feishu-docs.py status        # boundApp = 这个机器人的飞书应用 id（cli_...）；authorized 要是 true
```

agent id 是 `@@AGENT_ID@@`。

## 创建与交办

1. 用主人身份建一个只有主人和你的私有群，群名用 `V｜任务简称｜MMDD`：

   ```bash
   lark-cli im +chat-create --as user --type private \
     --name "V｜任务简称｜MMDD" --description "Task room" \
     --users <主人 open_id> --bots <boundApp>
   ```

   从回执里取 `chat_id`（`oc_...`），这个房间的会话就是 `agent:@@AGENT_ID@@:feishu:group:<chat_id>`。
   报权限不足（建群要用户身份的 `im:chat:create_by_user`）：按 `skills/lark-cli-permission-issue-troubleshooting` 给主人发补授权链接，不要换成机器人身份建群（那样主人不在群里）。

2. 主人指定了模型，才为这个房间单独设置；没指定就用默认模型，不设置：

   ```bash
   openclaw gateway call sessions.patch --params '{"key":"agent:@@AGENT_ID@@:feishu:group:<chat_id>","model":"<provider/model>"}' --json
   ```

   设置后用 `session_status` 核对。设置失败就如实说，不要悄悄换成别的模型。

3. 交办：

   ```text
   sessions_send(sessionKey="agent:@@AGENT_ID@@:feishu:group:<chat_id>", message=<完整任务说明>, timeoutSeconds=0)
   ```

   任务说明写清：目标、必要的上下文和已经定了的事、约束、已知证据、交付物和验收要求，以及结果交回哪个会话（就是你现在这个）。要让房间不翻发起会话也能独立开工。
   `sessions_send` 会把请求显示在房间里并开始执行，不要再单独往群里贴一遍任务说明。
   在任务说明末尾加一句：「结果只写在你的最终回复里（会自动显示在房间并交回给我），不要另用 message 发，也不用先发「收到」。」

## 交付与异常

- 跟主人简短说：房间名、你已经交办的事、用的模型。只有交办成功才说「已交办」，不要把建群成功说成已经开工。
- 房间做完，最终回复会自动交回到你这个会话。核对要花时间就先跟主人说一句「房间做完了，我核对一下再报给你」，核对完再发一条完整摘要（结论、链接、需要主人定的事）；按 AGENTS.md「跨会话协作」决定继续还是汇报。
- 建群成功、但设置模型或交办失败：保留已经建好的群，返回它的 chat_id，在同一个房间里修好再继续，不要为重试再建一个群。建群调用超时、结果不明：先用 `lark-cli im +chat-search --as user --query "<群名>"` 确认是否已经建了。
- 主人随时可以进房间插话。
