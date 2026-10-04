# v-desktop-handoff

给 Gateway 主机一块常驻显示器，让 agent 的 `browser` 工具跑在有头 Chrome 上；碰到登录页时 agent 发一个一次性链接，人打开就能看到 V 的桌面、看它怎么点鼠标，按「接管控制」后自己输密码，再交还。设计与调研见 [docs/v-remote-browser-handoff-plan.md](../../docs/v-remote-browser-handoff-plan.md)。

三层：

| 层 | 目录 | 运行方式 |
|---|---|---|
| A 显示器 | `desktop/start-desktop.sh` | `systemd/openclaw-desktop.service`：Xtigervnc `:99` + XFCE，只监听 loopback 5900，VncAuth 密码自动生成；Gateway 单元 drop-in `DISPLAY=:99` |
| B 分享链接 | `service/` | `systemd/v-desktop-handoff.service`：`127.0.0.1:23950` 对外（cloudflared 路径 `/desktop-handoff`），`127.0.0.1:23951` 管理 API（Bearer） |
| C 工具 | `plugin/` | OpenClaw 插件 `v-desktop-handoff`：`desktop_handoff_request` / `desktop_handoff_status` / `desktop_handoff_end`，`before_tool_call` 在有人控制时拦下 browser 写操作 |

## 服务（层 B）

- 数据面：每个观看者一条 WebSocket → 服务自己对 Xtigervnc 完成 VncAuth（密码不出主机），对浏览器提供 security type None 的握手，然后转发。客户端→服务端字节按 RFB 消息切分，**不是控制者的输入消息（KeyEvent / PointerEvent / ClientCutText / QEMU 扩展键 / SetDesktopSize）在服务端丢弃**，不依赖 noVNC 的 `viewOnly`。
- 所有观看者的 SetEncodings 都去掉光标伪编码，TigerVNC 因此把指针画进画面，观看者能看到 agent 的鼠标在动。
- 令牌：只存哈希；领取窗口默认 10 分钟；首次领取后会话 30 分钟；同一链接最多打开 5 次（手机 + 电脑 + 刷新）；控制者 5 分钟无输入降为观看；同时最多 N 个观看者；`kind=watch` 的链接永远拿不到控制权。抢控制时前一个连接以 4000 `control-taken` 关闭；撤销 4002；会话到期 4001；桌面不可用 4005。
- 审计 `stateDir/audit.jsonl`，令牌本体永不出现。
- 页面 `public/`，noVNC 从主机 `/usr/share/novnc` 直接提供。

配置见 `config.example.json`。VNC 密码用 `desktop/start-desktop.sh` 生成的明文文件 `vnc-password.txt`（0600）；**Gateway 的 `desktop.host.passwordFile` 也指向这个明文文件**（上游按 utf8 读进去当密码，指向 TigerVNC 混淆格式的 `vncpasswd` 会让 Control UI 面板报 Authentication failure；`vncpasswd` 只给 Xtigervnc 用）。

管理 API：`POST /v1/handoffs {kind, ownerId, sessionKey, reason}` → `{id, url}`；`GET/DELETE /v1/handoffs/:id`；`GET /v1/state`；`GET /v1/audit`。

## 插件（层 C）

`controlAnywhere: true`（V 与 VLab 当前设置）时任何群和私聊都能签发 `control` 链接并直接发在当场；链接是不记名的，群里谁点都能接管，这是 Tianyi 明确选择的策略。关掉时退回严格模式：只在私聊签发（`kind=watch` 群里可用），签发者取渠道可信 `requesterSenderId`，不信模型参数。`controlAnywhereActors`（如 `["feishu:ou_xxx"]`）里列出的人在群里也能要控制链接，但链接是不记名的，所以群里签发时**通过 `openclaw message send` 私聊投递**，工具结果里不含 url；投递失败则撤销签发并报错。自己的规范身份可从任一次 `desktop_handoff_request` 结果的 `requestedBy` 字段读到。`blockBrowserWhileControlled`（默认开）下，`/v1/state.controlActive` 为真时 `browser` 只放行 status / tabs / snapshot / screenshot，`computer` 只放行截图类；服务不可达时放行并记 warn，不让分享服务拖垮浏览器。

聊天里的链接以「电脑」卡发出（截图 + 接管 / 我完成了 / 跳过）：飞书（`core/native-card.js`）和 Telegram（`core/telegram-api.js`，照片 + 内联按钮）由插件自己发送并原地改；钉钉、企微经 V 的 v-experience 渠道补丁渲染 presentation（`core/channel-cards.js`）。企微的截图要一个企微服务器能下载的 URL，所以服务多了 `PUT /v1/handoffs/:id/snapshot`（admin，JPEG/PNG）和公开的 `GET <prefix>/snapshot/<令牌>.jpg`（随机令牌、只在内存、`snapshotTtlMs` 默认 60 分钟）。`nativeCardChannels` 可限定哪些渠道发「电脑」卡，`nativeCard: false` 全部退回单按钮卡。详见 [docs/v-experience.md](../../docs/v-experience.md) 第 16 节。

插件依赖 `typebox`，安装脚本把 `node_modules/typebox` 软链到 OpenClaw runtime 里的那份。

## 测试

```sh
cd apps/v-desktop-handoff/service && node --test 'tests/*.test.mjs'   # 假 VNC 服务器 + 真 WebSocket 客户端
cd apps/v-desktop-handoff/plugin  && node --test 'tests/*.test.mjs'
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner <you> --plan "$PWD/lab/candidate/desktop-handoff.plan.json"
```

候选测试在 VLab 上起真实 Xtigervnc + XFCE + 私有 Gateway，覆盖：桌面起来且无锁屏；服务对真 Xtigervnc 握手拿到 1280x800；browser 工具的 Chrome 出现在该显示器上（有头、DISPLAY 正确）；观察者按键不进页面、控制者按键进页面、交还后又不进；上游 `desktop.observe` 也能用同一显示器；真实 agent 回合调用工具后回复带链接、签发者是可信身份；人在控制时 agent 的 browser open 被拦、tabs 放行、交还后恢复；资源与流量。

## 安装到主机

`scripts/install-desktop-host.sh`（root）：装包、放文件到 `/opt/v-desktop-handoff`、生成 admin token、写三个 unit 并启动。之后按脚本末尾的提示改 `openclaw.json`（先 `--dry-run`）、加 cloudflared 路径，再 stop→start Gateway。
