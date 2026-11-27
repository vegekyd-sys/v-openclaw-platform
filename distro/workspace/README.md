# distro/workspace — 可安装 V 的工作区

装机时种进 agent 工作区的内容：全功能 V 的规则、skill 和脚本，去掉了 V 主人的身份和内容，记忆从零开始，带飞书上手引导和主动推进。
客户单独部署版（A 线安装器）和沙盒版 Mirror V（C 线）用同一份。分类和理由见 [INVENTORY.md](INVENTORY.md)。

## 目录

| 路径 | 是什么 |
|---|---|
| `payload/` | **工作区本身**，装机时原样复制（再替换占位符） |
| `V_CORE_COMMIT` | payload 最后一次从哪个 v-core 提交同步来 |
| `carry.txt` / `skip.txt` / `decide.txt` | V 的每个 skill、脚本带不带、为什么（审阅门的依据） |
| `sync.mjs` | 从 v-core 三方合并 V 的更新进 `payload/` |
| `build.mjs` | 产出可分发的工作区目录 + `.v/workspace-manifest.json` |
| `render.mjs` | 装机时替换占位符（无依赖，可单独打进安装器） |
| `lib.mjs` | 共享规则：清单、脱敏、泄漏扫描、占位符 |
| `global-skills.json` | V 从工作区外加载的第三方 skill 包：装哪些、不装哪些 |
| `feishu-user-scopes.txt` | V 自己的账号授权过的飞书用户权限（建机器人应用时照着开） |
| `tests/` | `node --test distro/workspace/tests/*.test.mjs` |

## 装机接口（给 A 线和 C 线）

1. 包里的 `workspace/` = `payload/` 的内容（不是整个 `distro/workspace/`）。`node build.mjs --out <dir>` 产出同样的东西并附清单；
   A 线从 git 对象打包时直接取 `distro/workspace/payload/**` 和 `V_CORE_COMMIT`。
2. 复制进 agent 工作区之后、`git init` 之前渲染占位符（全部要有值，渲染后不许剩 `@@X@@`）：

   | 占位符 | 值 |
   |---|---|
   | `@@WORKSPACE@@` | agent 工作区绝对路径 |
   | `@@AGENT_ID@@` | OpenClaw agent id |
   | `@@STATE_DIR@@` | OpenClaw state 目录 |
   | `@@TIMEZONE@@` | 主人时区（IANA，默认 `Asia/Shanghai`） |

   `node render.mjs --dir <ws> --set WORKSPACE=… --set AGENT_ID=… --set STATE_DIR=… --set TIMEZONE=…`，或 `import { render } from "./render.mjs"`。
3. 运行环境要求：
   - 飞书：机器人自己的企业应用交给 lark-cli，环境变量 `LARKSUITE_CLI_APP_ID`、`LARKSUITE_CLI_APP_SECRET`、`LARKSUITE_CLI_CONFIG_DIR`（工作区之外，服务用户可写）。
     应用要开通的用户身份权限：至少读文档的几项（`scripts/feishu-docs.py` 的 `REQUIRED_SCOPES`）；要「写飞书和 V 一样」，按 `feishu-user-scopes.txt`
     （V 自己的账号实际授权的 245 项用户权限）开通。上手引导的一次登录会申请应用上已开通的全部用户权限，没开通的不申请也不报错。
   - 原生 cron 开着，agent 的 exec 能跑 `openclaw` CLI（`scripts/v-schedule.py` 用它登记定时任务）。主人的 open_id 装机时不知道：上手引导第 0 步从第一条可信私聊记下，
     最后一步 `v-schedule.py install` 按 `payload/schedules.json` 建任务，投递到主人私聊。沙盒（C 线）不开原生 cron 时，由 Portal 按同一份 `schedules.json` 调度。
   - 全局 skill 按 `global-skills.json` 的 `install` 装（至少 `lark-*`）。
   - 可选：`MAKARON_API_KEY`（创作）、`APIFY_API_KEY`（社媒与图片搜索）。缺了相关 skill 会如实说没开通。
4. 工作区只在首次安装时种下；之后的更新看下一节，由人决定合进哪台机器。

## 跟着 V 更新

V 在活工作区里演进，每天同步到 v-core（私有，经过 V 服务器上的私有排除表）。这里从 v-core 取：

```sh
node distro/workspace/sync.mjs --core ~/v-core --ref origin/main --dry-run   # 看会变什么
node distro/workspace/sync.mjs --core ~/v-core --ref origin/main             # 合并进 payload/
node --test distro/workspace/tests/*.test.mjs
```

- **审阅门**：v-core 自上次同步以来改过的每个 `skills/<名字>`、`scripts/<条目>` 都必须出现在 `carry.txt`、`skip.txt` 或 `decide.txt` 里，
  否则在写任何文件之前停下，退出码 3（UNREVIEWED）。新 skill 不会被悄悄带给客户，也不会被悄悄漏掉。
- **三方合并**：base = `V_CORE_COMMIT` 处的 v-core，theirs = `--ref`，ours = `payload/`；两边先按 `lib.mjs` 的同一套规则脱敏
  （V 的路径 → 占位符、agent id、主人名字 → 主人、飞书 id 与文档链接 → 占位）。工作区自己改过的地方保留；冲突留标准标记，退出码 1，改完跑 `sync.mjs --resolved`。
- **泄漏扫描**：合并后扫整个 payload，命中就不记录同步（退出码 4）。扫的是形状（V 的主机路径、`ou_`/`oc_`/`om_`/`cli_` id、飞书文档链接、主人与家人名字、
  V 的私有域名、tailnet 主机、密钥形状、手机号、V 的客户名）；写不成形状的个人字符串放私有文件，`--deny-file` 或 `DISTRO_DENY_FILE` 传入，**不要提交**。
- **依赖检查**：带走的 skill 正文提到 payload 里没有的脚本时列为 MISSING DEPENDENCY（提示，不拦）。
- 带新东西 = 把路径加进 `carry.txt`，在 INVENTORY.md 写理由，再同步一次。V 上没进 git 的东西要先进 v-core（v-core 的 `CONTRIBUTING.md`）。

## 工作区自己的部分

`payload/` 里不在 `carry.txt` 的文件属于这里，同步不会覆盖：身份与规则文档（AGENTS/SOUL/IDENTITY/USER/REDLINES/MEMORY/TOOLS）、
上手引导（`onboarding/`、`skills/memory-cold-start`、`feishu-docs.py`、`onboard-*.py`）、记忆骨架、`schedules.json` 与 `v-schedule.py`、
主动推进（`skills/proactive-heartbeat`、`heartbeat-assistant.py`）。起点是 Mirror V v20 的 payload（mirror-v-portal `packages/agent-templates/mirror-v-full`），
第一个提交原样导入，之后的改动都在 git 历史里。
