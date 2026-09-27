# V 远程浏览器与人工接管：方案调研

2026-09-27 06:00 CST · 分支 `claude/v-remote-browser-control-d13c58` · 状态：**三层已实现并在 VLab 候选全通（见 §10）**，未动共享 VLab 与生产 V

## 0. 一句话结论

上游 OpenClaw（含 V 现跑的 2026.9.1）已经原生做了「在网页里看 V 的屏幕、看它怎么操作、随时接管键鼠」这件事：Control UI 的 Desktop 面板用 noVNC 连 Gateway 代理的 `/desktop/observe`，只看模式在服务端过滤输入，接管时抢控制权。**我们缺的只有三块**：

1. V 上没有任何显示器（没装 X / VNC / 桌面），Chrome 只能 headless。
2. 上游只允许 Gateway 管理员在 Control UI 里看，没有可发到飞书的独立链接。
3. 没有「agent 卡在登录页时请求人类接管」的工具，也不会往聊天渠道推链接。

所以方案不是「造一套远程桌面」，而是 **给 V 一块固定显示器 + 给上游的观察通道套一层一次性分享链接 + 加一个 handoff 工具**。第一阶段（只给 Tianyi 用）甚至不用写新服务：链接直接指向 Control UI 已有的 `/focus/desktop/control` 路由。

## 1. 现状核对（2026-09-27 实查）

| 机器 | 版本 / 角色 | 显示相关 | 结论 |
|---|---|---|---|
| 生产 V（VM-8-2-ubuntu，8 核 30G，可用 21G） | OpenClaw 2026.9.1 | Chrome 150 已装；**无** Xvfb / TigerVNC / XFCE / noVNC / xdotool；9222 无进程；`browser` 配置只有 16 个 `vbrowser-XX` attachOnly 的扩展中继 profile，无 `desktop` 配置 | V 自己的浏览器一直是空的，能用的只有用户 Chrome 扩展那条线 |
| 共享 VLab（vlab91，4 核 15G） | 与 V 同版本镜像 | **已装** tigervnc-standalone-server 1.13、xfce4 4.18、novnc 1.3、websockify、Chrome 148；无进程在跑 | 验证环境现成，不用装包 |
| grokbot 远程算力节点（grok-bot-vm，8 核 15G，可用仅 3G） | OpenClaw node，跑 Codex exec-server | 已装 google-chrome、Xvfb、x11vnc、xdotool | 二期可作「节点桌面」，内存紧，先不碰 |
| 公网入口 | cloudflared → `openclaw.tianyi.live` | 已有按路径分流：`/v-browser` → 23890、`/voice` → 26242、其余 → nginx 22794 → Gateway 22793 | 加一条路径即可，不用新域名 |
| 出口带宽 | eth0 cake 45 Mbit | — | VNC 流要计入，见 §6 |

上游能力按版本（fork `~/openclaw-versa`，已用 `git show v2026.9.1:` 逐项核对）：

| 能力 | 9.1（V 现在） | 9.5 / 9.6（升级线） |
|---|---|---|
| `desktop.host.{enabled,managed,port,passwordFile}`；attach 模式连已有 VNC；managed 模式自起 TigerVNC+XFCE | 有 | 有 |
| `desktop.observe` RPC → `wsPath=/desktop/observe?token=…`，noVNC 面板，服务端 view-only 过滤（`rfb-view-only-filter`），`control-taken` 抢控制，最多 8 观察者 | 有 | 有 |
| Control UI 独立窗口路由 `/focus/desktop` `/focus/desktop/control` | 有（`packages/session-url-contract/src/focus.test.ts:63`） | 有 |
| observe token 生命周期 | 60 s 一次性 ticket，无连接绑定 | 绑定签发者的 admin 连接，断开即 `4006 authority_revoked`；新增 `desktop.release` |
| `computer` 工具 `target:"gateway"`（在 Gateway 自己的桌面上真实移动鼠标、点击） | **无**，只能操作已配对 node | 有（9.5 #147275） |
| `browser` 工具 Linux 无 `DISPLAY` 时自动 headless（`linux-display-fallback`） | 有 | 有 |
| 任何往聊天渠道推链接 / 截图的机制 | 无 | 无 |

两个直接决定设计的上游细节：

- **Chrome 继承的是 Gateway 进程的 `process.env`**，不知道 managed 桌面动态分配的 `:99+`。managed 模式下 `browser` 工具的 Chrome 仍然 headless，VNC 里看不到。所以要 **attach 模式 + 固定 DISPLAY**。这也是此前记忆里「常驻显示器用 attach 不用 managed」的另一条理由。
- **9.1 里 agent 操作浏览器走 CDP，不动 X 光标。** 用户在网页里能看到页面被导航、表单被填、按钮被按，但看不到一个鼠标指针在移动。「看到鼠标怎么点」要等 9.5/9.6 升级后开 `cua-computer` 的 gateway 目标。分享链接这一层与此无关，升级后自动获得。

## 2. 目标体验

1. V 在飞书里执行任务，`browser` 工具碰到登录页 / 验证码 / 2FA。
2. V 调用 `desktop_handoff` 工具，说明原因。工具签发一次性链接，V 在回复里附上：「需要你登录一下 xx，点这里接管我的浏览器（10 分钟内有效）」。
3. 用户点开，看到 V 的桌面和 Chrome 当前页面；点「接管」后键鼠归用户，直接在 V 的 Chrome 里输密码、过验证。凭据只进 V 上的 Chrome profile，**不经过模型，不进聊天记录**——这正好解开 [[v-cannot-store-chat-credentials]] 那个死锁。
4. 用户在飞书回一句「好了」，V 继续用同一个 Chrome（登录态已在 profile 里持久化，下次不用再来）。
5. 其他人拿到链接只能看（服务端强制），控制权同一时刻只有一人。

## 3. 架构（分三层，两个阶段）

```
飞书 ──(链接卡片)──> 用户浏览器 ──HTTPS/WSS──> cloudflared ──> V 本机
                                                     │
              ┌──────────────────────────────────────┴───────────────────────┐
              │  阶段一：Control UI /n6tfdf/#/focus/desktop/control（管理员）  │
              │  阶段二：/desktop-handoff/<token>  → v-desktop-handoff 服务    │
              └──────────────┬───────────────────────────────┬───────────────┘
                             │ RFB over WS                    │ 管理 API（loopback）
                    Gateway /desktop/observe            签发/撤销 token、审计
                             │
                     Xtigervnc :99（-localhost, VncAuth, AlwaysShared, 1280x800）
                             │
                 xfce4-session + Chrome（内置 openclaw profile，headed，DISPLAY=:99）
```

### 层 A：给 V 一块固定显示器（两阶段共用，V 侧唯一的系统改动）

- 新 systemd 单元 `openclaw-desktop.service`（**名字不带 vlab**，教训见 [[v-browser-broker-is-production]]）：以 `openclaw` 用户跑 `Xtigervnc :99 -geometry 1280x800 -depth 24 -localhost yes -rfbport 5900 -SecurityTypes VncAuth -PasswordFile /home/openclaw/.openclaw/desktop/vncpasswd -AlwaysShared -AcceptSetDesktopSize`，随后 `startxfce4`。参数照抄上游 `managed-linux.ts:67-89`，只把动态端口/密码改成固定。
- Gateway 单元 drop-in：`Environment=DISPLAY=:99`。**同时给 worker 子进程**（V 上 agent 回合在 vlab-agent-worker 子进程里跑，Chrome 由它拉起）；核对 worker 是否透传 env，这是候选测试第一项。
- 配置（先 `openclaw config set --dry-run` 过 strict schema，教训见 [[vlab-shared-instance-traps]]）：
  ```json
  "desktop": { "host": { "enabled": true, "port": 5900, "passwordFile": "/home/openclaw/.openclaw/desktop/vncpasswd" } },
  "browser": { "defaultProfile": "openclaw", "headless": false, "extraArgs": ["--window-position=0,0", "--window-size=1280,760"] }
  ```
  （内置的 `openclaw` 托管 profile 不能在 `browser.profiles` 里声明，会被 schema 拒绝；它的 user-data 默认在状态目录 `browser/openclaw/user-data`。）
  `desktop.host.enabled` 需重启 Gateway，正好避开热重载杀 worker 池的坑（[[config-hot-reload-kills-worker-pool]]），但要按 stop→写配置→start 走。
- 需装的包：`tigervnc-standalone-server tigervnc-tools xfce4-session dbus-x11`（VLab 已有）。Chrome profile 目录 0700，属于 openclaw 用户，永不进 git（仓库规则）。

做完这一层，Tianyi 已经能在 Control UI 的 Desktop 面板看到 V 的 Chrome 并接管。

### 层 B：可分享的链接

**阶段一（零新代码，只给管理员）**：链接 = `https://openclaw.tianyi.live/n6tfdf/#/focus/desktop/control`。Tianyi 的设备已配对，点开即是 noVNC 控制窗口。适合先跑通全流程、验证体验。

**阶段二（`v-desktop-handoff` 服务，给非管理员）**：一个小 Node 服务，监听 loopback，cloudflared 加一条 `^/desktop-handoff(?:/.*)?$`。

- 数据面：token 换会话后，服务对上游 Xtigervnc 5900 做 websockify 式字节转发，页面用本机 `/usr/share/novnc` 的 noVNC。**只看模式在服务端丢弃 RFB 客户端消息类型 4/5/6（KeyEvent/PointerEvent/ClientCutText）**，逻辑对照上游 `rfb-view-only-filter.ts`；不靠 noVNC 前端的 `viewOnly` 参数。controller 同一时刻一个，后来者需明确点「接管」并踢掉前者，语义与上游 `control-taken` 一致。
- 为什么不直接转发到 Gateway 的 `/desktop/observe`：9.1 的 ticket 60 秒且不绑连接，9.5+ 绑定签发者 admin 连接并在断开时撤销。两个版本行为不同，而 V 正处在 9.1→9.5/9.6 的升级线上；直连 VNC 让这层完全不随 Gateway 版本变。Control UI 的原生面板与它共用同一个 `AlwaysShared` 的 Xtigervnc，两边互不影响。
- 控制面：管理 API 只在 `127.0.0.1`，Bearer 认证，`POST /v1/handoffs` 签发、`DELETE` 撤销、`GET /v1/audit`。token 规则照搬 `~/v-browser-openclaw91/broker/core/pairing-registry.js`：只存哈希、一次性领取、领取窗口 10 分钟、会话上限 30 分钟、空闲 5 分钟断开、只允许私聊签发、签发者身份取可信 `requesterSenderId` 而不是模型参数。

### 层 C：handoff 工具（agent 侧）

- OpenClaw 插件 `v-desktop-handoff`，形态照 `/opt/v-browser/…/openclaw-plugin`（v-browser-device 0.4.6，用 `before_tool_call` 拿可信发送者）。工具 `desktop_handoff_request({reason, url?})`：调管理 API 签发 → 返回链接与有效期 → agent 在回复里附上。跨渠道通用，不依赖飞书卡片。
- 飞书按钮卡片可选：复用 `packages/nightshift-core/src/notifications.mjs:124-140` 的 `openclaw message send --presentation` 格式（`buttons{label,url}`）。
- 「用户做完了」的信号，一期用聊天：agent 结束本回合，用户回一句后继续；Chrome 由 Gateway 持有，跨回合存活，登录态在 profile 里。二期再让 handoff 服务在 controller 断开时回调唤醒会话（唤醒链路此前有坑，见 [[worker-media-completion-never-drained]]，不在一期做）。
- skill 里写明触发条件：登录页、验证码、2FA、支付确认；写明不要自己猜密码、不要把用户输入的东西复述出来。

## 4. 备选方案与取舍

| 方案 | 优点 | 为什么不选作一期 |
|---|---|---|
| 上游 `desktop.host.managed`（懒启动 TigerVNC+XFCE） | 零运维 | 端口密码每次随机、无人看 60 s 就停、Chrome 不在它的 DISPLAY 上（headless），三条都跟「常驻浏览器 + 分享链接」冲突 |
| CDP screencast 自建网页（Manus 式，只看页面不看桌面） | 更轻，无需 X | 要自己做输入转发、多标签、下载对话框；上游 noVNC 通道已经免费给了，且不覆盖 9.5 的 `computer` 工具 |
| 浏览器放 grokbot 节点（上游 node desktop + node browser proxy） | 不占 V 内存 | 节点可用内存 3G，且节点网络经 DERP、节点是手动拉起没有 systemd；作二期扩展 |
| 复用现有 Chrome 扩展中继（用户自己的 Chrome） | 已在生产 | 方向相反：浏览器在用户设备，不在 V；用户不在线就没浏览器 |
| Docker sandbox 浏览器自带 noVNC（`sandbox.browser.noVncEnabled`） | 上游现成 | 只监听 loopback 且 `noVncUrl` 没有任何消费者，等于要做同样的链接层，还多了容器 |

## 5. 安全边界

- VNC 只监听 loopback，VncAuth 密码文件 0600；公网只暴露 handoff 服务的 token 路径，CDP / 5900 / 9222 一律不出机（与 `docs/control-ui-https-20260905.md` 的既有约束一致）。
- 链接一次性、短时、私聊签发、绑定签发者；观看者默认只看，服务端过滤；接管必须显式；全程审计。
- 凭据只进 V 的 Chrome profile，模型看不到；profile 不进 git、不进快照、不进 VLab 数据复制。
- 接管期间 agent 可能仍在通过 CDP 操作同一页面：handoff 会话活跃时，插件用 `before_tool_call` 拒绝 `browser` 工具的写操作（act/click/type），只放行截图与读取，避免人机抢一个页面。

## 6. 资源与带宽

- Xtigervnc + XFCE + 一个 Chrome：预计 0.6–1.2 GB 常驻，V 可用 21 GB，可接受；生产内存实际上限是 30 并发（[[production-load-test-20260919]]），要把这块算进去。
- 1280x800 的 VNC 流，日常操作约 1–4 Mbit，占 cake 45 Mbit 的一小部分；但要设观看上限（默认 2 个观察者 + 1 个控制者）和空闲断开，防止多标签页常开的 Live Board 式饿死（[[v-public-egress-cap]]）。候选测试要实测 `tc -s qdisc` 的增量。

## 7. VLab 验证计划（先做，不占 lease）

VLab 包已齐。用 `vlab.mjs candidate` 起一个私有 Gateway（candidate 不自动起 Gateway，命令里自己起，带 `DISPLAY=:99` 和独立 Xtigervnc 端口），每一项都要断言正向功能 + 故障路径确实触发（[[acceptance-must-prove-function]]）：

1. **可见性**：`browser` 工具 `navigate` 一个本地页面，VNC 帧里出现 Chrome 窗口（用 vncsnapshot 或 noVNC 截帧对比，不是看日志）。同时核对 worker 子进程拉起的 Chrome 也在 `:99`，而不是 headless。
2. **只看真的只看**：观察者连接主动发 PointerEvent 点击一个会改 DOM 的按钮，断言 DOM 没变；控制者做同样动作，断言变了。
3. **接管闭环**：控制者在本地登录表单里输入并提交；随后 agent 用 `browser` 工具读取到已登录状态；重启 Gateway 后 Chrome profile 仍保留登录态。
4. **token 规则**：二次领取被拒、10 分钟后领取被拒、30 分钟会话被断、群聊里签发被拒、签发者与领取者不一致被拒。
5. **人机互斥**：handoff 活跃时 `browser` 的 click/type 被 `before_tool_call` 拦下，截图仍放行；结束后恢复。
6. **带宽与内存**：一次 5 分钟接管的出站字节数、Xtigervnc/Chrome RSS。
7. **飞书端到端**（需 lease，在共享 VLab 的 V - Lab 频道）：私聊里让 agent 打开一个需要登录的页面 → 收到链接 → 手机点开能看能接管 → 回「好了」→ agent 继续。

通过后按 `docs/vlab-v-sync-flow.md` 走：合 dev → package/stage/deploy 到共享 VLab → `scripts/promote-to-v.mjs`。V 上装包和建 `openclaw-desktop.service` 是主机变更，要单独授权并同日捕获进 git（sentinel 覆盖）。

## 8. 工作量估计

| 项 | 规模 |
|---|---|
| 层 A：systemd 单元、drop-in、配置、安装脚本 | 半天，主要是核对 worker env 与配置 schema |
| 阶段一链接（Control UI 路由）+ handoff 工具最小版（只返回固定链接） | 半天 |
| 阶段二 `v-desktop-handoff` 服务（token、websockify、只看过滤、审计、noVNC 页面） | 2–3 天，含候选测试 |
| 飞书卡片、人机互斥、skill 文案 | 1 天 |
| 升级到 9.5/9.6 后开 `cua-computer` gateway 目标（看到真实鼠标） | 依赖升级线，配置级改动 |

## 9. 待 Tianyi 拍板

1. 一期是否先只做阶段一（管理员链接）跑通体验，再做阶段二的分享链接？我建议是。
2. 分辨率与观看者上限的默认值（建议 1280x800、2 观察 + 1 控制）。
3. 是否接受 V 常驻约 1 GB 的桌面 + Chrome。
4. 「用户做完了」一期用聊天信号而不是自动唤醒，是否可接受。

## 参考位置

- 上游桌面：`src/gateway/desktop/{host-source,managed-linux,observe-bridge,session-registry,rfb-view-only-filter}.ts`、`src/config/zod-schema.desktop.ts`、`docs/gateway/config-browser-ui-desktop.md`、`docs/nodes/computer-use.md`（fork `~/openclaw-versa`）。
- Control UI：`ui/src/components/desktop/desktop-panel.ts`、`packages/session-url-contract/src/focus.ts`。
- 浏览器 headless 判定：`extensions/browser/src/browser/config.ts`（9.1 在 `src/browser/config.ts:160-223`）。
- 可复用的 token/审计模型：`~/v-browser-openclaw91/broker/core/pairing-registry.js`；飞书卡片发送：`packages/nightshift-core/src/notifications.mjs`。
- 公网入口：`/etc/cloudflared/v-dashboard.yml`（V），`config/control-ui-cloudflare-origin.conf.template`。

## 10. 实施状态（2026-09-27 07:45 CST）

三层代码都在本分支，说明见 `apps/v-desktop-handoff/README.md`：

- 层 A：`apps/v-desktop-handoff/desktop/start-desktop.sh` + `systemd/openclaw-desktop.service` + Gateway drop-in `systemd/openclaw-gateway.service.d/desktop-display.conf`。
- 层 B：`apps/v-desktop-handoff/service/`（零依赖 Node：自带 RFC 6455 服务端、VncAuth、RFB 客户端消息切分与服务端只看过滤、光标伪编码剥离、令牌/控制权注册表、审计），`systemd/v-desktop-handoff.service`，`config.example.json`。
- 层 C：`apps/v-desktop-handoff/plugin/`（三个工具 + `before_tool_call` 互斥）。
- 安装：`scripts/install-desktop-host.sh`；候选测试：`lab/candidate/desktop-handoff.{mjs,plan.json}`。

本地测试：服务 10/10、插件 4/4（假 VNC 服务器 + Node 内建 WebSocket 客户端）。

VLab 候选 `candidate-75ebbe91-5876-4c28-9536-abe5afc7c10a`（基线 `feishu-progress-stream-v2`，私有 Gateway 36.6 s 就绪，全程 149 s）8/8：

| 场景 | 结果 |
|---|---|
| desktop | Xtigervnc :150 + xfwm4 + 面板起来，无锁屏进程 |
| service | 对真实 Xtigervnc 完成 VncAuth，ServerInit 1280x800，拿到真实帧；页面与 noVNC 均 200 |
| visible | Gateway `browser open` 后桌面上出现 "V handoff test - Google Chrome" 1280x760 窗口，Chrome 进程 DISPLAY=:150、非 headless，测试页被真实加载 |
| control | 观察者点击+按键：页面收到 `[]`；接管后同样操作页面收到 `ok1`；交还后再按键不再进入；期间 `/v1/state.controlActive=true` |
| native-observe | 上游 `desktop.observe` 对同一显示器返回 `transport=rfb, auth=vnc-password` |
| agent-request | deepseek-v4-flash 在 worker 里调用 `desktop_handoff_request`，回复带链接；签发者 `feishu:ou_…` 来自可信身份而非模型参数 |
| agent-blocked | 人持有控制时 agent 的 `browser open` 被拒（拒绝原因原文回传，页面未被 agent 打开）；`tabs` 放行（TABS_OK）；交还后 `open` 恢复（OPENED） |
| metrics | 桌面栈 339 MB（Xtigervnc 109 + XFCE 230），Chrome 237 MB，服务 63 MB；静止桌面 20 s 内观看流量 12 KB |

候选里踩到并已修的坑记在项目记忆 `desktop-handoff-candidate-traps`：unix socket 108 字节上限让 dbus 与 Chrome 在候选目录下瞬退（生产 TMPDIR=/tmp 不受影响）、内置 `openclaw` profile 不能在 `browser.profiles` 声明、默认 SSRF 拦回环、worker 第二份配置必须同样声明插件、CLI 回合没有发送者身份（候选用 `sessionKeyActorFallback`，生产不开）、增量帧请求在静止桌面上不回复。

未覆盖、留给共享 VLab 集成验收：真实飞书私聊里的端到端（`requesterSenderId` 来自渠道）、手机端 noVNC 触控体验、cloudflared 路径与 Control UI 同域共存。

## 11. 共享 VLab 集成验收（2026-09-27 15:10–16:10 CST，lease owner `claude-desktop-handoff`）

VLab 已回滚到 2026.9.1（release `feishu-progress-stream-v2`）。安装走 `scripts/install-desktop-host.sh`，参数 `UNIT_PREFIX=vlab-`：单元 `vlab-openclaw-desktop.service`（Xtigervnc :99 + XFCE，用户 lab-db91-parity）、`vlab-v-desktop-handoff.service`（23950/23951），文件在 `/opt/vlab-v-desktop-handoff`，配置 `/etc/vlab-v-desktop-handoff/`，Gateway drop-in `openclaw-vlab-production-mirror-v8.service.d/desktop-display.conf`。配置改动全部先 `config set --dry-run` 再写入，主配置与 `worker-openclaw.json` 各一份，备份在 `db91-parity/config-backups/*.pre-desktop-handoff-*`。Gateway 按 stop→start 重启（约 10 分钟就绪），之后 `nightshift-vlab-production-mirror` 手动拉回。

**链接暴露（VLab 专有）**：`tailscale serve --set-path /desktop-handoff http://127.0.0.1:23950/desktop-handoff` 与 `--tcp=23950`。本机 Mac 的 MagicDNS 只回 IPv4 而 Tailscale IPv4 不通（与 V 一致），所以验收链接用 IPv6 直达 `http://[fd7a:115c:a1e0::e539:be40]:23950/desktop-handoff/#…`。生产用 cloudflared 域名，没有这个问题。

在共享 Gateway 上实测（`vlab.mjs test` 的 vlab-dev 会话 + 内置浏览器打开真实页面）：

| 步骤 | 结果 |
|---|---|
| agent `browser open https://example.com` | OPENED Example Domain；`:99` 上出现 1280x760 的 Chrome 窗口，Chrome 进程 `DISPLAY=:99` |
| 打开控制链接（IPv6 tailnet） | 页面显示 XFCE 桌面与 Chrome（含 agent 打开的标签页），状态「观看中 · 剩余约 30 分钟」，画面里可见指针 |
| 点「接管控制」→ 点 Chrome 标签页 | 状态变「你正在控制」，V 的 Chrome 切到 Example Domain（输入真实到达） |
| 控制中 agent `browser open https://example.org` | 被拒，回复原文即插件的 blockReason |
| 点「交还给 V」→ 同样回合 | OPENED；`/v1/state.controlActive=false` |
| vlab-dev 会话调用 `desktop_handoff_request` | 拒绝「only issued in a direct/private conversation」：RPC 会话有可信身份但不是私聊，走的是预期的拒绝路径 |
| 30 分钟未打开的链接 | 页面提示「这次接管已经结束」，审计 `claim_window_expired` |

发现并已修：页面只换 fragment 不会重新加载（加 `hashchange` → reload）；owner 列表改为可随时读取的文件 `/etc/vlab-v-desktop-handoff/control-anywhere-actors`，加人不用重启。

**未覆盖**：真实飞书私聊端到端（渠道 `requesterSenderId` → 签发 → 手机/电脑打开）、群里 owner 请求时私聊投递、手机端触控。
