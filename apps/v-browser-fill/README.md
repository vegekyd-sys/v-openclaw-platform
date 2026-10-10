# v-browser-fill

V 登录或注册网站时，缺的往往只是一个要人来填的值：密码、短信或邮件验证码。以前只能发「电脑」接管卡，让人远程操作整台桌面。
这个插件让人在聊天里填一张凭据卡就够了：值由可信代码直接敲进 V 正在操作的那个输入框，V 只知道「已填好」。

## 流程

1. V 在登录页看到密码或验证码框，用原生 `secrets` 工具索取：`action=request`，名字如 `LOGIN_<网站>_PASSWORD` / `LOGIN_<网站>_CODE`，
   `allowedHosts` 填登录页的域名，`reason` 写清是谁的账号、哪个网站。
2. 会话里出现凭据卡：飞书是带密码框的原生卡片（`patch-feishu-secret-entry`），Telegram / 钉钉 / 企业微信是一次性链接（`apps/v-secret-entry`）。
   会话里**任何人**都可以填，和 API key 凭据卡一样；值进凭据库，不进聊天和会话记录。
3. V 重新 snapshot，调 `browser_fill_secret(name, ref, targetId?, profile?, submit?, keep?)`。插件：
   - 读条目的元数据：必须是 `secret`，必须有允许的域名；
   - 查目标标签页：它的域名必须是条目允许的域名之一（防止把 A 网站的密码填进 B 网站）；
   - 在**本进程**读出值（原生 `readSecretStoreValue`，同时登记进本进程的脱敏表），用 `browser` 工具同一个进程内分发器
     （`local-dispatch.runtime.js` 的 `dispatchBrowserControlRequest`）执行 `/act` `kind=type`，所以 V 刚看到的 ref 能对上；
   - 默认**硬删除**：在原生状态库写事务里删掉这一行（原生删除只做标记、明文留 30 天），并删除 V 的明文镜像
     `<state>/secrets/store/<NAME>`（`patch-openclaw91-secret-entry` 写的）。`keep=true` 保留。
4. 工具只返回 `{filled, name, host, targetId, submitted, removed}`。打字失败时报错信息里的值会被抹掉，条目保留以便重试。

## 多 harness

工具在哪个进程执行，就在哪个进程读库和打字：Worker 回合在 Worker 里（OpenClaw `browser` 工具也在 Worker 里分发），
Codex（/vcodex、/vds）和 claude-cli（/vcc）回合在 Gateway 里（工具经 loopback 暴露）。dist 目录按
`config.openclawDist` → `VLAB_OPENCLAW_AGENT_RUNTIME`（Worker）→ `argv[1]`（Gateway）找；原生函数按导出名绑定，不认 hash。

## 边界

- 这能保证值**不经过 V**（不进模型上下文、会话、日志、凭据库残留），但 V 仍控制着浏览器：填完后理论上能截图或读输入框。
  密码框截图里是圆点；验证码通常是明文但一次性、几分钟过期。安全级别等同于「把电脑交给人」，不是凭据代理那种「碰不到明文」。
- 凭据卡答复后、代填前的几秒里，值在凭据库和镜像文件里。删除的行在 WAL 检查点前可能还留在磁盘页里。
- 只支持本机浏览器控制（`openclaw` 与 `vbrowser-*` profile）；经 browser node 代理的远程浏览器不支持。

## 测试

```sh
cd apps/v-browser-fill/plugin && node --test tests/*.test.mjs
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner <you> --plan "$PWD/lab/candidate/browser-fill-secret-worker.plan.json"
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner <you> --plan "$PWD/lab/candidate/browser-fill-secret-claude-cli.plan.json"
```
