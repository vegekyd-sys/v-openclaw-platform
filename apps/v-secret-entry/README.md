# v-secret-entry

Telegram、钉钉、企业微信没有密码框。V 用 `secrets` 工具索取凭据时，这些渠道把一个**一次性 HTTPS 链接**私发给提问人；
链接打开一个只有密码框的页面，提交后服务直接调 Gateway `question.resolve`（与飞书密钥卡片同一个调用），
值进 V 的凭据库，不进聊天、不进会话记录、不进本服务的日志。设计与上线步骤见
[docs/v-experience.md](../../docs/v-experience.md) 第 12 节。

| 面 | 监听 | 内容 |
|---|---|---|
| 公网（cloudflared 路径 `/secret-entry`） | `publicBind:publicPort`，默认 `127.0.0.1:23960` | `GET /secret-entry/` 页面、`POST /secret-entry/api/info {token}`、`POST /secret-entry/api/submit {token, value}`、`GET /secret-entry/healthz` |
| 管理（仅 loopback，Bearer） | `bind:adminPort`，默认 `127.0.0.1:23961` | `POST /v1/links {questionId, answerKey?, name, reason?, allowedHosts?, channel, askerId, expiresAtMs}` → `{id, url, expiresAtMs}`；`DELETE /v1/links/:id`；`GET /v1/links`；`GET /v1/audit` |

- 令牌 32 字节随机，放在 URL 片段 `#token`（不进访问日志、链接预览、Referer），服务只在内存里存 sha256；重启即全部失效。
- 打开页面不消耗链接；成功提交一次后作废。有效期 = 问题到期时间，且不超过 15 分钟；Gateway 不可用时可重试，失败 5 次关闭；问题已结束则关闭。
- 同一问题重新签发会关闭旧链接。审计 `stateDir/audit.jsonl` 只有 id、问题、名称、渠道、提问人、时间，永不含令牌或值。
- 调 Gateway 用 OpenClaw 自己的 CLI 传输（`openclawDist/plugin-sdk/gateway-runtime.js` 的 `callGatewayFromCli`，scope `operator.questions`），
  所以服务以 Gateway 的用户运行、带 `OPENCLAW_STATE_DIR` / `OPENCLAW_CONFIG_PATH`，自己不保存 Gateway 凭据。

渠道侧（Gateway 进程环境）：`V_SECRET_ENTRY_ADMIN_URL=http://127.0.0.1:23961`、`V_SECRET_ENTRY_ADMIN_TOKEN_FILE=<admin token 文件>`。
不设则退回原来的「提示 + 取消」。

```sh
cd apps/v-secret-entry && node --test 'tests/*.test.mjs'
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner <you> --plan "$PWD/lab/candidate/telegram-secret-link.plan.json"
```
