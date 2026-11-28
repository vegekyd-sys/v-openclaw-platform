# V 部署 runbook（给执行部署的 agent）

本文是逐步执行版本，总纲和背景在 [DEPLOY.md](DEPLOY.md)。每一步都写了四样东西：

- **做**：要跑的命令；
- **看到**：预期输出；
- **通过**：判断标准；
- **不通过**：失败时怎么处理。

从第 0 步开始按顺序做。某一步不通过，又在「不通过」里找不到办法，就停下，把这一步的命令和完整输出发给 Tianyi。不要跳步，也不要自己发明替代做法。

约定：
- `客户机` 指要装 V 的那台机器。在它上面执行的命令都以 root 身份跑：用 `sudo`，或者先 `sudo -i`。
- `<包目录>` 指客户机上解开的 `v-distro-<版本>/`。`<kit>` 指客户机上的部署包目录（第 2 步），推荐放在 `/opt/v-kit/<版本>`。
- 所有输出里的 key、secret、token 一律不要贴进聊天或交接记录。本手册的命令都不会打印它们，如果某个输出里出现了，先打码再转述。

## 你不做的事（红线）

1. **不经手任何密钥原文。** App Secret、DeepSeek key 和其他 key，都由客户（或 Tianyi）自己写进客户机的 `/etc/v/secrets.env`。你只核对「有没有写」，见第 3.4 步，不读值，不复制，也不让对方把值发给你。
2. **不替任何人输入密码或验证码。** 登录客户机只用 SSH 密钥；老板的飞书授权由老板自己在手机或电脑上点。
3. **不在老板的真实会话、记忆里留测试内容。** 验收用 `v-ctl probe`，它用独立的探针会话。如果必须在老板的会话里说话（第 7 步的飞书项），只问不会写进记忆的问题；验收后检查 `memory/` 里有没有测试留下的事实，有就删掉那一段，并告诉 Tianyi。
4. **不在客户机上跑压测，不改 `/opt/v` 下的文件。** 改配置只改 `/etc/v/*.env`，然后 `v-ctl reconfigure`。
5. **不以老板的名义对别人发消息或评论。** 包里的 lark-cli 会拦住，见「已知问题」第 3 条。

---

## 第 0 步 现场信息收集

**做**：向 Tianyi 或客户联系人要齐下面这张表，写进本次部署的交接记录（第 8 步会用到）。表里不填任何密钥。

| 项 | 例子 | 用在哪 |
| --- | --- | --- |
| 客户名、老板称呼 | 某公司，王总 | `V_OWNER_NAME` |
| 老板的时区 | Asia/Shanghai | `TZ` |
| 老板在飞书里的手机号或邮箱（或管理后台里的「用户 ID」） | 138… | 第 5 步换 open_id |
| 客户飞书管理员是谁，能不能当天建应用、发版本 | 李工 | 第 3 步 |
| 机器：云厂商、地域、公网 IP、SSH 端口、登录用户 | 腾讯云上海，203.0.113.5:22，ubuntu | 第 1、2 步 |
| 系统、CPU、内存、磁盘 | Ubuntu 24.04，4C/8G，80G | 第 1 步 |
| 网络：在中国大陆吗？有没有出口代理？ | 大陆，无代理 | 第 1 步 |
| 要打开的可选能力 | 桌面接管、语音转文字、Makaron、公网链接、VSync | 第 4 步 |
| 哪些 key 由谁提供 | DeepSeek：客户自己的；xAI：无 | 第 3.4 步 |
| 本次部署的版本号和包的 sha256 | 2026.11.30-…，`ab12…` | 第 2 步 |

**登录方式**：
1. 你在自己的机器上为这个客户单独生成一把密钥：`ssh-keygen -t ed25519 -N '' -f ~/.ssh/v-deploy-<客户简称> -C v-deploy-<客户简称>`。
2. 把公钥（`.pub` 文件的内容）发给客户管理员，请他加到客户机上一个能免密 sudo 的用户的 `~/.ssh/authorized_keys` 里。
3. 在 `~/.ssh/config` 里给这台机器起个别名，比如 `Host cust-<客户简称>`。

**通过**：`ssh cust-<客户简称> 'sudo -n true && echo sudo-ok'` 打印 `sudo-ok`。

**不通过**：
- `Permission denied (publickey)`：公钥没加对用户，或文件权限不对（`~/.ssh` 700，`authorized_keys` 600）。请管理员检查。
- `sudo: a password is required`：请管理员给这个用户配免密 sudo（`/etc/sudoers.d/` 下一行 `<用户> ALL=(ALL) NOPASSWD:ALL`）。**不要**请他把密码告诉你。

---

## 第 1 步 预检

**做**：`preflight.sh` 在包里，第 2 步之前它还不在客户机上，所以先只把这一个文件送过去跑：

```bash
scp <包目录>/install/preflight.sh cust-<客户简称>:/tmp/v-preflight.sh
ssh cust-<客户简称> 'sudo bash /tmp/v-preflight.sh --out /tmp/v-preflight.txt'
```

**看到**：每项一行，`OK` / `WARN` / `FAIL` / `BLOCK` / `INFO`，最后是 `== summary`。

```
OK     os                           Ubuntu 24.04.1 LTS
OK     memory                       7941 MB
OK     net:npmmirror                http 200 in 0.31s
FAIL   net:google-api               no answer from https://generativelanguage.googleapis.com/
INFO   region                       Google unreachable, Feishu reachable: treating this as mainland China (mirrors preferred)
== summary
install flags : --registry https://registry.npmmirror.com --node-mirror https://npmmirror.com/mirrors/node/v22.23.1/
bundle needed : skills: ...
leave off     : GOOGLE_API_KEY: ...
V_UNREACHABLE : google,xai
```

**通过**：退出码 0，summary 里没有 `BLOCK` 行。

把这三类结论原样抄进交接记录：
- `install flags`：第 4 步装的时候要加的参数；
- `bundle needed`：第 2 步需要部署包（kit）；
- `leave off`：哪些能力因为网络不通会关掉，第 6 步要告诉老板。

**不通过**（有 `BLOCK`）：

| BLOCK | 处理 |
| --- | --- |
| `arch` | 只支持 x86_64 和 aarch64，换机器 |
| `memory`（不到 4 GB） | 请客户升配到至少 4 GB，要桌面接管则 8 GB |
| `disk`（不到 20 GB） | 请客户扩容系统盘或清理 |
| `systemd` | 不是正常的 Ubuntu 虚机（比如容器），换机器 |
| `npm` | 两个 npm 源都不通：请客户开放出网，或配出口代理后重跑预检 |
| `model` | DeepSeek 和 Vercel AI Gateway 都不通：同上 |
| `feishu` | open.feishu.cn 不通：同上，V 离不开飞书 |

`WARN memory`（4–7 GB）可以装，但不要打开桌面接管。`WARN apt` 表示 Ubuntu 软件源不通：请客户修好 apt 源，或者确认系统包已经装齐，第 4 步加 `--skip-apt`。

---

## 第 2 步 把安装包送到客户机

### 2.1 拿到正式版本

正式版本由 Tianyi 指定，你会收到三样东西：**版本号**、包的 **sha256**、文件的取法（一般是一个 vrelay id）。sha256 以 Tianyi 消息里的为准，不以文件旁边的 `.sha256` 为准。

一个正式版本包含两部分：

- 安装包：`v-distro-<版本>.tgz` 和 `.sha256`，由 `distro/build/build.mjs` 从批准的提交构建。同样的输入构建出来字节完全相同。
- 部署包（kit），可选：`distro/build/offline-kit.sh` 生成的目录，打成一个 tar。里面有 Node、GitHub 技能、Chrome 和 cloudflared，供连不上 nodejs.org、GitHub、dl.google.com 的机器用。第 1 步出现 `bundle needed` 就要用它。

如果要你自己做 kit：在能访问这些站点的机器上（比如 V 自己的服务器），

```bash
bash distro/build/offline-kit.sh v-distro-<版本>.tgz ./kit-<版本> --arch x64        # 客户机是 aarch64 就用 --arch arm64
tar -cf kit-<版本>.tar -C ./kit-<版本> .
```

**看到**：`== package`、`== node`、`== skills`、`== chrome`、`== cloudflared`、`== SHA256SUMS` 依次出现，最后是 `kit size: …`（大约 450 MB，带 Chrome）。

**通过**：退出码 0。中途任何一个文件的 sha256 对不上，脚本会停下并报 `sha256 mismatch`。

### 2.2 校验

```bash
sha256sum v-distro-<版本>.tgz          # 必须等于 Tianyi 给的 sha256
```

**不通过**：不一致就**不要装**。重新取一次；还不一致，报告 Tianyi。

### 2.3 传到客户机

任选一种：

- **直接 SSH**（默认）：`rsync -P v-distro-<版本>.tgz* kit-<版本>.tar cust-<客户简称>:/tmp/`。`-P` 断了可以续传。
- **跨境很慢时**（V 在新加坡，客户机在大陆）：用 vrelay 生成免令牌链接 `vrelay link <id> --hours 24`，在客户机上 `curl -fLo /tmp/<文件> '<链接>'` 下载。链接 24 小时后失效，用完 `vrelay rm <id>`。
- **客户机完全不能出网下载**：请客户管理员用他自己的方式（内网文件服务器、U 盘）放到 `/tmp/`。

然后在客户机上：

```bash
cd /tmp && sha256sum v-distro-<版本>.tgz                   # 再核对一次，必须等于 Tianyi 给的
tar -xzf v-distro-<版本>.tgz                               # 得到 /tmp/v-distro-<版本>/
sudo mkdir -p /opt/v-kit/<版本> && sudo tar -xf kit-<版本>.tar -C /opt/v-kit/<版本>     # 有 kit 时
cd /opt/v-kit/<版本> && sha256sum -c --quiet SHA256SUMS && echo kit-ok                    # 有 kit 时
```

**通过**：两个 sha256 都一致；有 kit 时打印 `kit-ok`。

kit 解到 `/opt/v-kit/<版本>` 以后**不要删**：之后补开桌面接管（Chrome）和升级，都会用到它。安装器会把这个位置记成 `V_KIT_DIR`。

---

## 第 3 步 客户飞书应用

### 3.1 发给客户管理员的操作说明

把下面这段原样发给客户的飞书管理员，再附上包里的 `install/feishu-app-scopes.json`：

> 请在飞书开发者后台（https://open.feishu.cn/app）建一个「企业自建应用」，名字可以叫「V」，然后：
> 1. **添加应用能力** → 机器人。
> 2. **权限管理** → 批量导入/导出权限 → 导入附件 `feishu-app-scopes.json`（应用身份 171 项、用户身份 257 项）。如果提示设置数据范围（人事、薪酬类），选「全部」。
> 3. **事件与回调 → 事件配置**：订阅方式选「使用长连接接收事件」，添加这些事件：
>    `im.message.receive_v1`、`im.chat.access_event.bot_p2p_chat_entered_v1`、`im.chat.member.bot.added_v1`、`im.chat.member.bot.deleted_v1`、`im.message.reaction.created_v1`、`im.message.reaction.deleted_v1`、`drive.notice.comment_add_v1`、`approval.instance.comment.created_v4`、`approval.instance.comment.deleted_v4`。
> 4. **事件与回调 → 回调配置**：同样选长连接，添加 `card.action.trigger`（卡片回传交互）。
> 5. **可用范围**：至少包含老板本人（以后要用 V 的人也加上）。
> 6. **版本管理与发布**：创建版本 → 申请发布，并在管理后台审核通过。
> 7. 把 **App ID**（`cli_` 开头）发给我们。**App Secret 不要发给任何人**：等我们把机器准备好，请您自己登录服务器写进一个文件（我们会告诉您具体怎么做）。

注意：第 3 步「长连接」那一项，要等第 4 步装好、V 已经在线之后才能保存成功。飞书后台保存长连接订阅时，会检查有没有客户端连上。管理员可以先完成其余各项，等你通知再保存。

### 3.2 你收到 App ID 之后

把 `FEISHU_APP_ID=cli_…` 记进交接记录。第 4 步的 `v.env` 里写它。

### 3.3 准备 secrets.env 让客户自己写

在客户机上建一个只有 root 能读的空模板：

```bash
sudo install -d -m 0755 /etc/v
sudo test -e /etc/v/secrets.env || sudo install -m 0600 /dev/null /etc/v/secrets.env
sudo tee -a /etc/v/secrets.env >/dev/null <<'EOF'
# 每行 KEY=值，等号两边不要空格。写完保存即可，不要发给任何人。
FEISHU_APP_SECRET=
DEEPSEEK_API_KEY=
EOF
```

其他 key 按第 0 步的约定加上空行，变量名见 DEPLOY.md「可选能力」表。比如 `XAI_API_KEY=`、`GOOGLE_API_KEY=`、`MAKARON_API_KEY=`、`VOLCENGINE_API_KEY=`、`APIFY_API_KEY=`；预检里 `leave off` 的那些不要加。

然后把这段发给客户管理员（或者提供 key 的人）：

> 请用您自己的账号登录服务器，运行 `sudo nano /etc/v/secrets.env`，在 `FEISHU_APP_SECRET=` 后面粘贴应用的 App Secret，在 `DEEPSEEK_API_KEY=` 后面粘贴 DeepSeek 的 key（其他留空的行也照此填写），按 Ctrl+O、回车保存，Ctrl+X 退出。填好后告诉我「写好了」即可，不要把内容发给我。

### 3.4 核对（只看有没有写，不看值）

```bash
sudo awk -F= '/^[A-Z_]+=/{print $1, (length($2)>0 ? "已填" : "空")}' /etc/v/secrets.env
sudo stat -c '%a %U' /etc/v/secrets.env
```

**通过**：要用的 key 都是「已填」；权限 `600 root`。

**不通过**：
- 是「空」：请对方再写一次。
- 权限不对：`sudo chmod 600 /etc/v/secrets.env && sudo chown root:root /etc/v/secrets.env`。

---

## 第 4 步 安装

### 4.1 写 v.env（不含任何密钥）

```bash
sudo cp /tmp/v-distro-<版本>/install/v.env.example /root/v.env && sudo chmod 600 /root/v.env
```

在 `/root/v.env` 里填：
- `V_OWNER_NAME=<老板称呼>`、`TZ=<时区>`、`V_MODEL_PRESET=deepseek`、`FEISHU_APP_ID=cli_…`；
- `V_OWNER_FEISHU_OPEN_ID` 先留空，第 5 步再填；
- 要打开的可选能力：`V_DESKTOP=1`（预检内存 OK 且是 x86_64 才开）；公网地址 `V_PUBLIC_ORIGIN=…`（有隧道或反向代理才填）；
- `DEEPSEEK_API_KEY=` 这类 key 行**留空或删掉**：key 已经在 `/etc/v/secrets.env` 里，安装器会保留它们。

然后把预检的结论写进去：

```bash
sudo bash /tmp/v-distro-<版本>/install/preflight.sh --env-file /root/v.env --out /tmp/v-preflight.txt
grep -E '^(V_UNREACHABLE|V_NPM_REGISTRY)=' /root/v.env
```

**通过**：`V_UNREACHABLE=` 一行列出预检判定不通的服务（可以为空），大陆机器上还有 `V_NPM_REGISTRY=https://registry.npmmirror.com`。

`V_UNREACHABLE` 里的服务，即使 secrets.env 里有它的 key，配置也不会用它：`google` 关掉记忆向量检索，`xai` 关掉 xAI 看图和生图。这样 V 不会一直撞不通的接口。

### 4.2 安装

把预检给的 `install flags` 原样加上。有 kit 就加 `--kit`：

```bash
sudo /tmp/v-distro-<版本>/install/install.sh --env-file /root/v.env --probe \
  [--registry https://registry.npmmirror.com --node-mirror https://npmmirror.com/mirrors/node/v22.23.1/] \
  [--kit /opt/v-kit/<版本>] 2>&1 | sudo tee /root/v-install-<版本>.log
```

要 10–25 分钟，建议在 `tmux` 里跑，或者放到后台、等它结束时通知你。不要中途 Ctrl+C。

**看到**：一串 `== <阶段>` 标题。依次是：

`System packages` → `Deployment kit`（有 kit 时）→ `Node` → `Verify package` → `Service user` → `Inputs` → `Release …` → `Configure` → `Start`（含 health 和 probe）→ `Global skills` → `Done`

最后几行类似：

```
{"step":"health","ok":true,...,"workers":{"version":"…","live":1}}
{"step":"probe","ok":true,...}
```

**通过**：退出码 0，日志里有 `"step":"probe","ok":true`。

`--probe` 做的是一次真实回合：模型调用 → 执行一个命令 → 回复。它证明模型 key 可用、Codex 和 Worker 能跑工具、回复能写回会话。它走独立的探针会话，不碰老板的会话。

**不通过**（看日志最后 40 行 `sudo tail -40 /root/v-install-<版本>.log`）：

| 报错 | 处理 |
| --- | --- |
| `missing DEEPSEEK_API_KEY` / `FEISHU_APP_ID and FEISHU_APP_SECRET together` | 回第 3.4 步，请客户补写 secrets.env |
| `could not download node-v…` | 加 `--node-mirror` 或 `--kit` |
| npm 超时、`ETIMEDOUT`、`ECONNRESET` | 加 `--registry https://registry.npmmirror.com` 重跑（重跑是安全的，已装的部分会复核、不会重建） |
| `kit: files in … do not match` | kit 传坏了，重新传，回第 2.3 步 |
| `sha256 mismatch` | 包或 kit 被改过，不要继续，报告 Tianyi |
| `warning: global skills were not all installed` | 不阻塞。多半是 GitHub 不通：用 kit 重跑 `sudo V_SKILLS_TARBALL_DIR=/opt/v-kit/<版本>/skills v-ctl install-skills` |
| health 一直等到超时 | `journalctl -u openclaw-gateway -n 80 --no-pager`，按「已知问题」排查 |
| probe `ok:false` | 看 probe 输出里的 `error`；最常见的是模型 key 无效（DeepSeek 返回 401），请客户核对 key |

### 4.3 能力清单

```bash
sudo cat /home/openclaw/.openclaw/v-capabilities.json
```

每项是 `{"on":true}`，或者 `{"on":false,"reason":…,"howTo":…}`。把 `on:false` 的项抄进交接记录，第 6 步告诉老板。

---

## 第 5 步 接飞书和主人

### 5.1 应用凭据和机器人

```bash
sudo v-ctl feishu-check
```

**看到**：`{"step":"feishu-check","ok":true,"appId":"cli_…","secretAccepted":true,"bot":{"name":"V","openId":"ou_…","activateStatus":2}}`

**不通过**：
- `token refused`：App ID 或 App Secret 不对。请客户核对后重写 secrets.env（`sudo nano /etc/v/secrets.env`），再 `sudo v-ctl reconfigure`。
- `activateStatus` 不是 2：应用还没发布，或没加机器人能力。回第 3.1 步的 1 和 6。

### 5.2 换出老板的 open_id

open_id 每个应用不同，必须用**这个应用**去查：

```bash
sudo v-ctl feishu-owner --mobile <老板手机号> --write
# 或 --email <老板邮箱>，或 --user-id <管理后台成员详情里的用户 ID>，或 --union-id on_…（只在同一开发者的应用之间通用）
```

**看到**：`{"step":"feishu-owner","ok":true,"openId":"ou_…","name":"<老板姓名>","written":true,"next":"sudo v-ctl reconfigure"}`

**通过**：`name` 是老板本人。

**不通过**：
- `scopes is required: [contact:user.id:readonly]`：应用没开这项权限。请管理员在权限管理里加上，**并发布新版本**。也可以改用 `--user-id`，它不需要这项权限。
- `no Feishu user … visible`：老板不在应用的可用范围里。请管理员把他加进去，再发布一次。
- 都不行：先跳过这步。老板第一次私聊机器人时会收到一个配对码，你运行 `sudo v-ctl pair <配对码>` 批准私聊。但这样群聊不会打开，因为群聊需要 open_id。之后再补这一步。

### 5.3 生效

```bash
sudo v-ctl reconfigure
sudo journalctl -u openclaw-gateway --since "-5 min" --no-pager -o cat | grep -E "ws client ready|bot open_id resolved" | tail -3
```

**看到**：

```
[feishu] feishu[default]: bot open_id resolved: ou_…
[info]: [ '[ws]', 'ws client ready' ]
```

**通过**：两行都有，而且最后一个 `ws client ready` 之后没有 `ws client closed`。现在通知管理员保存第 3.1 步第 3、4 项的长连接订阅。

**不通过**：
- 日志里有 `receive events or callbacks through persistent connection only available …`：管理员没把订阅方式改成长连接，或改完没发布版本。
- 完全没有 `[ws]`：`grep FEISHU_APP_ID /etc/v/install.env` 确认填了，再看 `sudo v-ctl feishu-check`。

### 5.4 让老板发第一句

请老板在飞书里搜索应用名（例如「V」），打开和机器人的单聊，发「你好」。

**通过**：1 分钟内收到回复；卡片页脚显示 `Agent: V`，以及模型 deepseek flash、codex。

**不通过**：
- 收到配对码：说明第 5.2 步没成功。运行 `sudo v-ctl pair <码>`，再回去补 5.2。
- 没有任何回复：`sudo journalctl -u openclaw-gateway --since "-3 min" --no-pager -o cat | grep -iE "feishu|error" | tail -20`。

---

## 第 6 步 老板上手

上手引导是 V 自己带的：老板第一次私聊（第 5.4 步）时它就开始了，你主要是在旁边看着、帮老板点对地方、核对结果。引导会话里不要替老板回话，也不要往这个会话里发测试消息。老板那边每一步看到什么、交付后头几天会怎样，细节在 [`workspace/OWNER-ONBOARDING.md`](workspace/OWNER-ONBOARDING.md)；本节只写你要做和要核对的。

### 6.1 确认主人记对了

```bash
sudo v-ctl as-agent python3 scripts/v-schedule.py owner
```

**看到**：`{"ok": true, "open_id": "ou_…", "channel": "feishu", "recorded_at": "…"}`

**通过**：`open_id` 和第 5.2 步查到的是同一个。

**不通过**：
- 退出码 1、`no owner recorded yet`：老板还没私聊过，回第 5.4 步。
- 是别人的 open_id（同事先私聊了）：停下，告诉 Tianyi。不能在聊天里改，要按第 5.2 步重新配置主人。

### 6.2 老板点飞书授权

**做**：老板在第 5.4 步发了「你好」之后，V 的回复里会有一段开场白、一个授权链接和二维码。请老板**用自己的飞书**点链接（或扫码），在打开的页面上按**「授权」/「确认授权」**，然后回 V「好了」。

**看到**：
- 授权页列出这次要的权限（读写文档、日历、任务、多维表格、表格、云空间、消息等），一页就能确认完。
- 老板回「好了」以后，V 说它开始读文档。

**通过**：

```bash
sudo v-ctl as-agent python3 scripts/feishu-docs.py status
```

输出里同时满足：`"installed": true`、`"boundApp": "cli_…"`（和第 5.1 步的 appId 一样）、`"identity": "user"`、`"authorized": true`、`"user": "<老板姓名>"`。这也是第 7 步第 7 项的判断标准。

**不通过**：

| 现象 | 处理 |
|---|---|
| 老板说点了，`authorized` 还是 false | 多半点的是旧链接，或打开了没按确认。链接 10 分钟有效。请老板跟 V 说「重新发一下授权」，你看着他点确认 |
| V 发的不是授权链接，而是「开通权限」的链接（`grant`） | 应用上读文档的权限还没开或要管理员审批。请管理员按第 3.1 步补开权限、**发布新版本**，再让老板回 V「好了」 |
| 授权页报 `too many scopes` | 不应该出现（一次最多申请 250 项，见「已知问题」第 2 条）。出现就把 `sudo v-ctl as-agent python3 scripts/feishu-docs.py scopes` 的输出发给 Tianyi |
| 授权页说应用不可用、没有权限使用 | 老板不在应用的可用范围里。请管理员把他加进去，发布一次 |
| `boundApp` 为空 | 机器没拿到应用：回第 5.1 步 |
| 老板不想授权 | 让他回 V「跳过」，引导改走官网和粘贴资料。记进交接记录 |

授权已经做过、后来应用上又开了新权限：`sudo v-ctl as-agent python3 scripts/feishu-docs.py connect --rescope` 会让 V 重新发一个包含新权限的链接（只在老板要用到新权限时做）。

### 6.3 看着引导走完

**做**：不用跑命令，在老板旁边看。每一步 V 的消息最后都会告诉老板下一步做什么。

**看到**（按顺序，整体 15–30 分钟，看文档多少）：
1. 「我在读你的文档……」，几分钟内说读了哪些空间、多少份；超过 5 分钟会说「我在后台接着做」，过几分钟再发结果。
2. 一份「我对你的理解」初稿（飞书文档链接）。请老板看一遍，哪里不对直接改正 V，改到满意或说「可以了」。
3. 依次问官网网址、别的 AI 助手里的记忆、其他资料。老板都可以回「跳过」。
4. 收尾：报一共接进来多少份资料、还要几个晚上整理完；说数据只存在这台机器上；说这台机器现在还做不了什么（来自能力清单，见 6.4）；问要不要给 V 起名字。
5. 最后一句：「好了，从现在开始有什么事直接跟我说。」

**通过**：

```bash
sudo v-ctl as-agent python3 scripts/onboard-progress.py get
sudo v-ctl as-agent python3 scripts/v-schedule.py list
```

`step` 是 `done`；`list` 里的任务数等于 `schedules.json` 的条目数（第 7 步第 10 项）。

**不通过**：
- 引导停在某一步不动：请老板随便发一句话，V 会从记下的那一步接着。还不动，看 `sudo journalctl -u openclaw-gateway --since "-10 min" --no-pager -o cat | grep -iE "error|feishu" | tail -20`。
- V 说「后台任务没登记上」：`sudo v-ctl as-agent python3 scripts/v-schedule.py install`；报 `record the owner first` 就回 6.1。
- 老板没时间走完：可以停在任何一步，他下次私聊时 V 从原地接上。交接记录写停在哪一步。

### 6.4 跟老板说哪些能力没开

V 在收尾时会自己说（它读的是第 4.3 步的同一份清单）。你核对一下说得对不对：

```bash
sudo v-ctl as-agent python3 scripts/v-capabilities.py
```

**看到**：`{"ok": true, "off": [...], "tellOwner": "先说清楚这台机器现在还做不了的：……", "forDeployer": [{"capability": …, "reason": …, "howTo": …}]}`

**通过**：V 跟老板说的和 `tellOwner` 意思一致；`off` 里每一项都抄进了交接记录，连同 `forDeployer` 里的 `howTo`（那是给你和 Tianyi 看的，不要念给老板）。

**不通过**：
- 退出码 3（没有清单）：先 `sudo v-ctl reconfigure` 生成，再跑一次。
- V 没提，或者说的和清单不一致：由你当面用 `tellOwner` 的话补一句，记进交接记录。

### 6.5 提前跟老板说的事

当面讲一遍，交接记录写「已告知」：

1. 每天零点会收到一条当天总结，不想要可以跟 V 说关掉。
2. 头几天主动提醒可能不准或偏多，每天中午 V 会自己复盘调整；觉得多余直接跟 V 说。
3. V 可以替他建和改飞书文档、日程、任务、表格；以他的名义给别人发消息之前会先问他；文档评论里的回复是机器人发的，不会显示成他本人。
4. 资料还要几个晚上整理完（V 收尾时报的数）；没整理到的，问 V 时它会当场去读原文。
5. 现在用的 key 和账号是我们的，以后会换成他们自己的。
6. 有问题找谁（写上联系方式）。

---

## 第 7 步 验收

全部在部署当场跑。每项写进交接记录：通过、不通过（附输出），或跳过（附原因）。

| # | 项 | 做 | 通过 |
| --- | --- | --- | --- |
| 1 | 服务都在跑 | `systemctl is-active openclaw-gateway v-memory-indexer`；`systemctl show -p NRestarts --value openclaw-gateway`；`sudo v-ctl status` | 都是 active；NRestarts 是 0；`current` 是本次版本 |
| 2 | 网关健康 | `sudo v-ctl health` | `"ok":true`，`workers.live` ≥ 1 |
| 3 | 真实回合 | `sudo v-ctl probe` | `"ok":true` |
| 4 | 飞书长连接 | 第 5.3 步的 grep | 有 `ws client ready` |
| 5 | 私聊回复 | 第 5.4 步 | 有回复，页脚 `Agent: V` |
| 6 | 群聊 | 请老板建一个群（或用现有的），把机器人拉进去，老板不 @ 直接发一句 | V 回复了；群里其他人发的消息 V 不回 |
| 7 | 飞书授权 | 第 6 步的 `feishu-docs.py status` | 授权正常 |
| 8 | 写文档 | 请老板在私聊里说「帮我建一个飞书文档，标题叫 V 部署验收，正文写今天的日期」 | 回复里有链接，老板能打开，内容对 |
| 9 | 不以老板名义评论 | `sudo v-ctl as-agent lark-cli drive +add-comment --doc test --content test; echo exit=$?` | 输出 `V_OWNER_VOICE_BLOCKED`，`exit=3`（被拦在本机，不会发出去） |
| 10 | 定时任务 | `sudo v-ctl openclaw cron list --json --all --agent makaron` | 条目数等于 `python3 -c "import json;print(len(json.load(open('/opt/v/current/workspace/schedules.json'))))"` |
| 11 | 全局技能 | `sudo v-ctl install-skills` | `failed` 为空（GitHub 不通且没用 kit 时会有，记下来） |
| 12 | 记忆索引 | `sudo v-ctl memory-check` | `"ok":true` |
| 13 | 备份可恢复 | `sudo v-ctl backup` 后 `sudo v-ctl restore-backup <刚生成的文件> --root /tmp/v-restore-check`，最后 `sudo rm -rf /tmp/v-restore-check` | 两条都 `"ok":true` |
| 14 | 桌面（开了才测） | `systemctl is-active openclaw-desktop v-desktop-handoff openclaw-cua-node`；请老板在私聊说「截一张你桌面的图给我」 | 三个 active；收到截图 |
| 15 | 能力清单 | `sudo cat /home/openclaw/.openclaw/v-capabilities.json` | 与交接记录、与告诉老板的一致 |

升级和回滚**不在当场测**：它们已经在测试机上验过。部署当天不要对客户机做升级或回滚。

验收结束后，检查老板的记忆里有没有测试留下的内容（红线第 3 条）：

```bash
sudo -u openclaw grep -rn "V 部署验收" /home/openclaw/.openclaw/workspace/memory/ | head
```

第 8 项的文档标题出现在当天的日记里，这是正常的：它确实发生了，不是编造的测试事实。你自己编的测试事实（比如「我最喜欢的颜色是…」）不应该出现。如果出现，删掉那一段，并告诉 Tianyi。

---

## 第 8 步 收尾

### 8.1 每天定时备份

```bash
echo '17 3 * * * root /usr/local/bin/v-ctl backup --keep 7 >> /var/log/v-backup.log 2>&1' | sudo tee /etc/cron.d/v-backup
sudo chmod 644 /etc/cron.d/v-backup
```

**通过**：`cat /etc/cron.d/v-backup` 是这一行。第 7 步第 13 项已经证明备份能做、能恢复。

备份文件里有密钥。如果客户有自己的加密存储，请客户管理员把 `/var/backups/v/archives/` 同步过去，不要发到聊天里。

### 8.2 清理

```bash
sudo rm -f /root/v.env /tmp/v-preflight.sh /tmp/kit-<版本>.tar
sudo rm -rf /tmp/v-distro-<版本>        # /opt/v 里已经有一份；/opt/v-kit/<版本> 保留
```

`/root/v.env` 里没有密钥，但没用了，删掉。`/root/v-install-<版本>.log` 留着，远程支持时有用。

### 8.3 交接说明

写一份交接记录，发给 Tianyi，并给客户管理员一份去掉内部信息的版本。内容：

- 第 0 步的表（不含密钥）；
- 版本号、sha256、kit 位置；
- 预检结论（install flags、bundle needed、leave off）；
- 第 7 步每项的结果；
- 老板的 open_id 是否已配置、群聊是否打开；
- 关掉的能力，以及打开它们需要什么；
- 远程支持的方式（8.4）。

### 8.4 远程支持

- 你登录客户机用的是第 0 步那把专用密钥。客户随时可以从 `authorized_keys` 删掉它，收回权限。
- 常用排查命令：`v-ctl status`、`v-ctl health`、`journalctl -u openclaw-gateway --since "-30 min" --no-pager`、`cat /home/openclaw/.openclaw/v-capabilities.json`。
- 要客户补 key 或改配置：请他写 `/etc/v/secrets.env` 或 `/etc/v/install.env`，然后你运行 `sudo v-ctl reconfigure`。它只重启网关一次，会话、记忆、工作区都不动。

### 8.5 以后更新和回滚

拿到新版本后，同样做第 2 步（新版本有 kit 就用新的 kit），然后：

```bash
sudo /tmp/v-distro-<新版本>/install/update.sh --probe [--kit /opt/v-kit/<新版本>]
```

- `--registry` 不用再加：安装时记下的 `V_NPM_REGISTRY` 会自动沿用。
- 选一个老板不用 V 的时间做。update 会停网关，正在跑的回合会被打断（「已知问题」第 7 条）。
- 任何一步失败，update 会自动放回旧版本和停机前的状态快照。
- 跑完核对第 7 步的 1–5、11、12 项。

回到上一个版本：

```bash
sudo /opt/v/current/install/rollback.sh
```

如果提示两个版本的数据库结构不同，要用 `--latest-snapshot`。这会回到升级前的状态，升级之后的对话会丢失，先问 Tianyi。

---

## 已知问题与处理

都是 2026-11-27～28 在测试机上实际碰到过的。前面写了「已修」的，是当前包里已经处理了，遇到时只用核对。

1. **升级以后老板要重新授权飞书（已修）。**
   - 原因：以前每次 configure 都重写 lark-cli 的配置，把老板的授权一起清掉了。现在只在配置不存在或换了应用时才重写。
   - 核对：`sudo -u openclaw python3 -c "import json;print([len(a.get('users') or []) for a in json.load(open('/home/openclaw/.lark-cli/config.json')).get('apps',[])])"` 应该是 `[1]`。
   - 如果真被清了：同目录下有 `config.json.before-<时间>` 备份，确认里面有 users 后拷回去，再 `sudo chown openclaw: /home/openclaw/.lark-cli/config.json`。
   - 换了 App Secret 时要重写配置：`sudo rm /home/openclaw/.lark-cli/config.json && sudo v-ctl configure`，然后老板重新授权一次。

2. **飞书一次授权最多 251 项权限。**
   - 多一项整次报 `too many scopes`。按个数算，和权限名长短无关。
   - `feishu-docs.py connect` 一次只申请应用上开通的前 250 项，按常用程度排序：文档、云空间、日历、任务、多维表格、表格、消息在前。
   - 没申请到的列在 `loginScopesSkipped`，用到时 `connect --rescope` 补授权；授权是累加的。
   - 不要手工拼 `lark-cli auth login --scope`。

3. **评论或消息以老板的名义发出。**
   - lark-cli 用的是老板的用户授权，用户身份发的评论、消息、表情回复，显示为老板本人。
   - 包里的 `/opt/v/bin/lark-cli` 会拦：
     - 文档评论：只能 `--as bot`；
     - 消息和表情回复：要么 `--as bot`，要么带 `--owner-approved "<老板原话>"`。每次放行在 `~/.openclaw/audit/lark-owner-voice.log` 记一行：时间、操作、对象、原话摘要、结果，不记正文。
   - 被拦时返回 `V_OWNER_VOICE_BLOCKED`。文档评论会话里，V 把回复写成最终回复，飞书插件会用机器人身份贴回原评论。

4. **记忆检索报错或什么都找不到（记忆索引不匹配）。**
   - 加上或去掉 `GOOGLE_API_KEY`（或者 `V_UNREACHABLE` 里加减 google），向量模型会跟着变，旧索引就不能用了。
   - `v-ctl reconfigure` 会自动跑 `memory-check` 重建。手动运行：`sudo v-ctl memory-check`，记忆多时要几分钟。

5. **portal 链接。**
   - OpenClaw 自带的 portal 工具把本机端口挂到 Control UI 的 Portals 里。客户版的 Control UI 只听本机，老板打不开那个链接，agent 却会以为生成了可以分享的链接。
   - 客户版已默认禁用它（`tools.deny: ["portal"]`）。
   - 要给老板看网页：有 `V_PUBLIC_ORIGIN` 时用它；没有时用工作区的 `scripts/temp-preview.py`（见下一条）。

6. **临时隧道留在后台。**
   - agent 做临时预览时，可能起了 trycloudflare 快速隧道和一个本地服务。`scripts/temp-preview.py` 24 小时后自动关闭。
   - 自己起的、或者没关掉的，这样查：`pgrep -u openclaw -af "cloudflared tunnel --url"`。
   - 确认不是 `v-cloudflared` 服务（那是正式隧道）后，以 openclaw 用户结束它和对应的本地服务：`sudo -u openclaw kill <pid>`。
   - 工作区里的 `.tools/cloudflared` 留着，脚本会用它。

7. **网关 45 秒停不下来，被强制结束。**
   - 停网关（升级、`reconfigure`、重启）时，如果有回合或 Worker 在跑，45 秒内没退出，systemd 会 SIGKILL。
   - 测试机上出现过一次，之后启动正常、探针通过，数据没有损坏。
   - 代价是正在跑的回合被打断。所以升级、重启选老板不用的时间做。
   - 日志特征：`journalctl -u openclaw-gateway | grep -iE "timed out|SIGKILL"`。在修，见 `TODO-after-observation.md`。

8. **定时任务记成「⚠️ Terminal failed」，其实做完了（终端工具误报失败）。**
   - 机器上没有共享终端，agent 第一次调 `terminal` 工具会失败，随后改用 `exec` 完成。但 OpenClaw 把那次失败记成了整轮的结果。
   - 看那一轮的记录（`sudo v-ctl openclaw cron list --json --all --agent makaron` 找到任务 id，再 `sudo v-ctl openclaw cron runs --id <id> --json`），再看对应会话：最后有正常回复，或者在静默时段回复了 `NO_REPLY`，就是误报。
   - 不是部署问题。在修，见 `TODO-after-observation.md`。

9. **老板私聊收到配对码。** 没配 `V_OWNER_FEISHU_OPEN_ID`，走第 5.2 步。临时可以 `sudo v-ctl pair <码>`。

10. **群里 V 不回。**
    - 群聊只在配了 `V_OWNER_FEISHU_OPEN_ID` 时打开，而且只回老板本人的消息，不用 @。其他人的消息不回，这是设计如此。
    - 不要手工改 `openclaw.json`：
      - `groupAllowFrom` 按群的 chat_id 放行，`groupSenderAllowFrom` 按发送人放行。
      - 把 open_id 写进 `groupAllowFrom` 会挡住所有群。

11. **网关起不来，日志里有 `web_search provider "deepseek"` 未知（已修）。**
    - 包里带了 v-deepseek-web 插件。还出现，说明装的不是正式包，回第 2 步核对 sha256。

12. **v-desktop-handoff 反复重启（已修）。**
    - `systemctl show -p NRestarts --value v-desktop-handoff` 不是 0 时：`journalctl -u v-desktop-handoff -n 30 --no-pager`。

13. **sudo 把环境变量丢了。**
    - `sudo V_X=… cmd` 可以传变量，`V_X=… sudo cmd` 传不过去。
    - 部署包统一用 `--kit` 传，不要靠环境变量。
    - 例外：单独补装技能时，用第 4.2 步表里写的 `sudo V_SKILLS_TARBALL_DIR=… v-ctl install-skills`。

14. **客户换了某个 key。**
    - 请客户改 `/etc/v/secrets.env`，然后 `sudo v-ctl reconfigure`。
    - 安装和升级不会清掉 secrets.env 里已有的 key（env 文件里写了同名 key 时，以 env 文件为准）。要删掉一个 key，直接编辑 secrets.env。

15. **飞书后台保存长连接订阅失败。** 要先有客户端连上：先装好 V，看到 `ws client ready`，再请管理员保存（第 3.1 步的注意）。

16. **升级后工作区里多了 `xxx.new` 文件。**
    - 工作区随升级更新：系统文件（`scripts/`、随安装带的 `skills/`、`schedules.json`、AGENTS.md 和 TOOLS.md 的系统段等）没被改过就直接换新；被 V 或老板改过的保留原样，新版另存成 `<文件>.new`，并写进升级报告。
    - 处理：看升级报告列了哪些，告诉 Tianyi；不要自己用 `.new` 覆盖。V 也被要求不改系统文件，出现 `.new` 多半说明它改过。
    - 归老板的（`memory/`、`USER.md`、`IDENTITY.md`、老板自己加的技能）升级从不动。

17. **出图时没有 Makaron 任务卡片，只直接回了图或报错。**
    - 先看能力清单里 `makaron` 是不是 `on`（`MAKARON_API_KEY` 在不在）。
    - 再确认运行环境里有 `MAKARON_CLI_ROOT` 和 `OPENCLAW_LARK_SDK_PATH`：`sudo grep -cE '^(MAKARON_CLI_ROOT|OPENCLAW_LARK_SDK_PATH)=' /etc/v/runtime.env` 应该是 2。少了就 `sudo v-ctl reconfigure`。
    - 超大图片压缩要 `sharp`，当前包没带：只有超过上限的图片会失败，其他照常。

18. **整篇文档的评论，V 的回复是新开的一条评论，不在原评论下面。**
    - 飞书不支持回复「整篇文档」的评论，插件只能用机器人身份新开一条，这是预期。划词评论的回复会在原讨论串里。
    - 回复人必须是机器人。显示成老板本人就是出了问题，按第 3 条查。

19. **老板问「你怎么还不知道 X」。**
    - 资料是分几个晚上整理进记忆的（V 收尾时报过还要几晚）。没整理到的文档，V 被问到时会当场去读原文。
    - 老板只授权了部分空间、或者某些文档在别人的空间里没分享给他，V 也读不到：请老板把那份文档分享给自己或机器人。

20. **`v-capabilities.py` 退出码 3（没有能力清单）。**
    - 装的版本还没写这个文件，或者还没 configure 过：`sudo v-ctl reconfigure` 之后再跑。仍然没有，就按第 4.3 步手工核对，跟老板只说已经确认能用的。
