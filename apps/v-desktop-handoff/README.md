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
- **手机上的操作方式**（页面自己处理触摸，不用 noVNC 的鼠标式手势）：单指滑动＝滚轮（带惯性），轻点＝点击，长按＝右键，长按后拖动＝按住左键拖（选文字），双指＝只在手机上放大/移动画面。滚轮按实测标定：V 桌面上的 Chrome 一格滚 120 px，间隔小于约 40 ms 的连发会被吞，所以按 45 ms 节拍排队发送；滚完把指针停到右侧滚动条，避免网页弹出悬停卡片。键盘栏：拉丁字符实时按键，中文或长文本走剪贴板 + Ctrl+V；常用键 Esc/Tab/方向/退格/回车/全选/复制/粘贴/撤销。
- **页面是一个打包文件**：`public/viewer.js` 由 `node build-viewer.mjs` 把 `public/app.js` 和仓库里的 noVNC 1.3.0（`vendor/novnc-1.3.0`，与主机 Ubuntu 包同版本，许可见其 `COPYRIGHT.debian`）打成一个文件，`index.html` 用内容哈希引用 `viewer.js?v=…`、`app.css?v=…`，带 `v` 的静态文件缓存一年。原来手机首次打开要拉 43 个模块，网络差时卡在「连接中」。改了 `app.js`/`app.css` 必须重新打包，`tests/viewer-build.test.mjs` 会拦。状态栏依次显示「加载中 / 正在打开链接 / 正在连接电脑」，慢在哪一步一眼可见。
- **页面上的「交还给 V」直接让 V 接着做**：页面带 `handBack: true` 交还，服务记下 `pageHandBackAt`；插件在 Gateway 里注册的后台服务（`registerService`，只在 Gateway 运行）每 3 秒检查，用 `POST /v1/handoffs/:id/wake {origin}` 认领（只成功一次，且只给签发它的 Gateway：签发时插件带 `origin`＝`OPENCLAW_HOME`+`OPENCLAW_STATE_DIR` 的哈希，worker 与 Gateway 相同，candidate 副本不同），然后 `runtime.subagent.run({sessionKey, deliver: true})` 在原会话里唤醒 V，再把卡片改成「已完成」。之后再点飞书「我完成了」不会重复唤醒；重新接管会取消尚未被认领的唤醒。
- **接管前松开 V 残留的按键**（`lib/input-reset.mjs`）：V 的 computer use 经 XTEST 注入按键，漏掉一次松开就会卡键（2026-10-06 Alt_L 卡住：每次点击变成 Alt+点击被窗口管理器当成拖窗口，打字弹出 Chrome 菜单，人的 VNC 输入解不开）。有人接管时，服务先查 `Virtual core XTEST keyboard/pointer`，对按下的键 `xdotool keyup <keysym>`、按下的鼠标键 `xdotool mouseup`，再交出控制权。主机需要 `xinput`、`xdotool`、`xmodmap`；缺工具时跳过，不影响接管。
- **手机模式**（`lib/display-layout.mjs`）：手机接管时页面请求 `POST /api/layout {mode: "phone", width, height}`，服务用 `xrandr` 把屏幕改成竖屏（宽度至少 528，Chrome 窗口窄于约 510 px 时窗口管理器拒绝最大化），用 `wmctrl` 记下并最大化各窗口。**只有请求者仍是控制者时竖屏才存在**：每次控制权变化（交还、飞书里「我完成了」、闲置降级、断线、被别的窗口接管、撤销、到期）都会审计，审计回调和 5 秒定时器都会核对，不满足就恢复 `layout.base`（默认 1280x800）并把窗口放回原位；服务启动时也会先恢复一次。配置 `layout: {enabled, display, base}`，默认开启；主机需要 `wmctrl`（没有时只改分辨率，窗口不动）。

配置见 `config.example.json`。VNC 密码用 `desktop/start-desktop.sh` 生成的明文文件 `vnc-password.txt`（0600）；**Gateway 的 `desktop.host.passwordFile` 也指向这个明文文件**（上游按 utf8 读进去当密码，指向 TigerVNC 混淆格式的 `vncpasswd` 会让 Control UI 面板报 Authentication failure；`vncpasswd` 只给 Xtigervnc 用）。

管理 API：`POST /v1/handoffs {kind, ownerId, sessionKey, reason}` → `{id, url}`；`GET/DELETE /v1/handoffs/:id`；`GET /v1/state`；`GET /v1/audit`；`GET /v1/capture` → 机器屏幕的一帧 PNG（给没有本地显示器的机器当卡片图片；VNC 抓帧，`capture: {timeoutMs, maxWidth}` 可调）。

## 插件（层 C）

`controlAnywhere: true`（V 与 VLab 当前设置）时任何群和私聊都能签发 `control` 链接并直接发在当场；链接是不记名的，群里谁点都能接管，这是 Tianyi 明确选择的策略。关掉时退回严格模式：只在私聊签发（`kind=watch` 群里可用），签发者取渠道可信 `requesterSenderId`，不信模型参数。`controlAnywhereActors`（如 `["feishu:ou_xxx"]`）里列出的人在群里也能要控制链接，但链接是不记名的，所以群里签发时**通过 `openclaw message send` 私聊投递**，工具结果里不含 url；投递失败则撤销签发并报错。自己的规范身份可从任一次 `desktop_handoff_request` 结果的 `requestedBy` 字段读到。`blockBrowserWhileControlled`（默认开）下，`/v1/state.controlActive` 为真时 `browser` 只放行 status / tabs / snapshot / screenshot，`computer` 只放行截图类；服务不可达时放行并记 warn，不让分享服务拖垮浏览器。

聊天里的链接以「电脑」卡发出（截图 + 接管 / 我完成了 / 跳过）：飞书（`core/native-card.js`）和 Telegram（`core/telegram-api.js`，照片 + 内联按钮）由插件自己发送并原地改；钉钉、企微经 V 的 v-experience 渠道补丁渲染 presentation（`core/channel-cards.js`）。企微的截图要一个企微服务器能下载的 URL，所以服务多了 `PUT /v1/handoffs/:id/snapshot`（admin，JPEG/PNG）和公开的 `GET <prefix>/snapshot/<令牌>.jpg`（随机令牌、只在内存、`snapshotTtlMs` 默认 60 分钟）。`nativeCardChannels` 可限定哪些渠道发「电脑」卡，`nativeCard: false` 全部退回单按钮卡。详见 [docs/v-experience.md](../../docs/v-experience.md) 第 16 节。

插件依赖 `typebox`，安装脚本把 `node_modules/typebox` 软链到 OpenClaw runtime 里的那份。

## 其他机器：Tianyi 的 Mac（插件 `targets`）

同一份服务代码再起一个实例，连的不是本机 Xtigervnc，而是 Tianyi MacBook Pro 自带的「屏幕共享」（经 Tailscale 直连）。插件配置 `targets` 加一台机器，`desktop_handoff_request` 带 `target: "tianyi-mac"` 就发同一种「电脑」卡（标题「Mac」，文案「你的 Mac」），接管 / 我完成了 / 跳过、状态跟随、页面「交还给 V」唤醒、`before_tool_call` 拦截都一样：插件按 handoff id 找到所属服务（每个服务各问一次），`computer` 工具 `node` 等于目标的 `computerNode` 时看那台机器的控制状态。

- 服务实例：`/etc/v-mac-handoff/config.json`，`pathPrefix: "/mac-handoff"`（公网 23952、管理 23953，cloudflared 加 `^/mac-handoff(?:/.*)?$`），`vnc.host` 为 Mac 的 Tailscale IP，`title: "Tianyi 的 Mac"`，`subject: "你的 Mac"`（领取接口返回，页面文案用它），`layout.enabled: false`（竖屏/松键都是 :99 专用），`serverSideCursor: false`（macOS 不把光标画进画面，要页面自己画）。单元 `v-mac-handoff.service` 与 `v-desktop-handoff.service` 相同，只换配置路径与 `ReadWritePaths=/var/lib/v-mac-handoff`。
- 插件配置：`targets: {"tianyi-mac": {adminUrl: "http://127.0.0.1:23953", adminTokenFile: "/etc/v-mac-handoff/admin-token", subject: "你的 Mac", cardTitle: "Mac", machine: "Tianyi's own Mac", description: "…", computerNode: "MacBook Pro"}}`。**卡片图片是这台机器屏幕的真实截图**：远端机器的 target 没有 `desktopDisplay`，插件就走它自己的接管服务 `GET /v1/capture`（服务用与接管页同一条 VNC/屏幕共享连接抓一帧，Raw 编码、按 `capture.maxWidth` 缩到 1280 宽的 PNG），发卡时和卡片转到「操作中 / 已完成」时各更新一次；抓帧失败（超时、协议不符、服务不可达）自动退回封面 `coverImage`，**不会让发卡失败**。`target.capture: "cover"` 可显式退回封面，`"service"` 可强制服务抓帧。
- Mac 端（只能本人做，要管理员密码）：系统设置 → 共享 → 屏幕共享，打开「VNC 使用者可以使用密码控制屏幕」并填服务的 VNC 密码；再执行 `sudo defaults write /Library/Preferences/com.apple.RemoteManagement VNCAlwaysStartOnConsole -bool true`。不设这一项时，锁屏状态下 VNC 密码连接会被 macOS 接到一块**离屏的虚拟登录窗口**（`screensharingd` 日志：`found off console loginwindow session`、`vfb 1`），能点能打字但解不开真实桌面；设了之后接主屏（`wantConsole 1`、`vfb 0`），人在接管页里自己输登录密码就能远程解锁。
- 协议差异：macOS 宣告 `RFB 003.889`，服务按 3.8 回应（`lib/rfb-proxy.mjs`）。macOS 只支持 Raw / zlib / ZRLE，不支持 Tight 与 Hextile；noVNC 1.3 没有 ZRLE，3440×1440 的带鱼屏一帧 Raw 约 20 MB，手机上只剩黑屏和几条线。所以 `vendor/novnc-1.3.0` 补了 noVNC 1.4.0 的 `decoders/zrle.js`（接口与 1.3 的 Display / Inflator 相同），排在 TightPNG 之后：TigerVNC 仍选 Tight，行为不变。

## 测试

```sh
cd apps/v-desktop-handoff/service && node --test 'tests/*.test.mjs'   # 假 VNC 服务器 + 真 WebSocket 客户端
cd apps/v-desktop-handoff/plugin  && node --test 'tests/*.test.mjs'
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner <you> --plan "$PWD/lab/candidate/desktop-handoff.plan.json"
```

候选测试在 VLab 上起真实 Xtigervnc + XFCE + 私有 Gateway，覆盖：桌面起来且无锁屏；服务对真 Xtigervnc 握手拿到 1280x800；browser 工具的 Chrome 出现在该显示器上（有头、DISPLAY 正确）；观察者按键不进页面、控制者按键进页面、交还后又不进；上游 `desktop.observe` 也能用同一显示器；真实 agent 回合调用工具后回复带链接、签发者是可信身份；人在控制时 agent 的 browser open 被拦、tabs 放行、交还后恢复；资源与流量。

## 安装到主机

`scripts/install-desktop-host.sh`（root）：装包、放文件到 `/opt/v-desktop-handoff`、生成 admin token、写三个 unit 并启动。之后按脚本末尾的提示改 `openclaw.json`（先 `--dry-run`）、加 cloudflared 路径，再 stop→start Gateway。
