# 飞书里完整运行 show_widget 组件：调研与设计

日期：2026-10-30。状态：**原型开发中，真机验收未完成（见 §7）**。不合入、不上 V。

## 1. 结论

- **卡片里跑不了 HTML。** 所有「内嵌网页」路线的终点都是网页容器：桌面在聊天右侧侧边栏，手机在飞书内的全屏 web-view。
- **推荐方案**：飞书卡片（快照 + 「打开组件」）→ 飞书内网页壳页 → 沙箱 iframe 运行 9.1 原始组件文档。按钮经飞书免登确认身份后，以点击人的身份走飞书原有入站路径回到同一个会话。
- 这样 HTML、脚本、SVG、canvas、`sendPrompt` 都完整运行，不映射成弱化版卡片。

| 差距 | 代价 |
|---|---|
| 不是消息流内嵌 | 要点一下才能运行；卡片上的快照是静态图 |
| 手机是全屏页 | 看组件时看不到聊天，返回即回到会话 |
| 外部租户用户没有免登身份 | 能看不能回发（§5） |

## 2. 载体逐项核对

「实测」= 本次或 #495 在真实接口或客户端上跑过；「文档」= 只有官方文档依据。

| 载体 | 能跑任意 HTML | 桌面 | 手机 | 不离开会话 | 权限/审核 | 依据 |
|---|---|---|---|---|---|---|
| 卡片内网页组件 | **否** | — | — | — | — | 实测：CardKit 建卡对 `iframe/webview/web_view/html/h5/embed/web/mini_program` 全部返回 `10002 not support tag`；官方 2.0 组件表也没有这一类 |
| `web_url/open` AppLink（**选用**） | 是 | `mode=sidebar-semi` 侧边栏，聊天仍可见；`window` 独立窗口 | `mode` 只对 PC 生效，手机进全屏 web-view | 桌面是；手机是飞书内全屏，返回即会话 | 打开无需权限；免登要 H5 可信域名和回调登记 | 文档 + #495 桌面实测侧边栏；手机见 §7 |
| 网页应用 `web_app/open`（`lk_target_url`/`mode=sidebar`） | 是 | 同上 | 同上 | 同上 | 要加网页应用能力并发版 | 文档；相比 `web_url` 没有多的能力，不选 |
| 会话标签页 url 类型 | 是 | 会话内标签 | 全屏 | 是 | `im:chat` 或 `im:chat.tabs:write_only`，每会话最多 20 个 | #495/#504 实测；适合常驻看板，不适合一次性组件 |
| 链接预览 | **否**，只有文本或卡片 | — | — | — | 要加能力、发版、3 秒回调 | 文档；同样不能跑 HTML |
| 工作台小组件（Block） | **否**，私有 DSL，不是 HTML | 工作台 | 工作台 | 否，不跟会话走 | 要审核发布 | 文档 |
| 小程序 | 否，TTML，`web-view` 只能全屏 | 侧边栏 | 全屏 | 同网页 | 要加能力、发版 | 文档；多一层打包，没有收益 |
| Aily/智能伙伴 | 未发现第三方内嵌 HTML 接口 | — | — | — | — | 文档；开放接口只有知识与消息类 |

## 3. 托管与鉴权

`/__openclaw__/canvas/documents/...` **不能直接给飞书用**：

- 路由走 Gateway 端口，要 node capability（绑定已连接的 Control UI 或节点客户端，短期有效）。
- V 的公网入口按路径分流（`/voice`、`/secret-entry`、`/desktop-handoff` 等），兜底是 v-secret-entry，不到 Gateway。把 Gateway 暴露公网会放大攻击面。
- `current_channel` 的 `present()` 拿不到 `hostedUrl`（9.1 只给 `node_panel`），Discord 也是自己存一份。

所以和 secret-entry、handoff 一样，单独起服务 `apps/v-feishu-widgets/service`：

| 面 | 内容 |
|---|---|
| 公网（cloudflared 路径 `/v-widgets`，建议独立子域） | `GET /w/:id` 壳页；`GET /w/:id/frame` 组件文档；`GET /w/:id/meta` 版本；`POST /api/identity`；`POST /api/prompt` |
| 管理（仅 loopback + Bearer） | `POST /v1/widgets`、`POST /v1/widgets/:id/message`、`GET /v1/audit` |

安全边界：

- **读**：URL 里 32 字节随机 id 就是只读能力，和「能看到这张卡片」同级，默认 30 天过期。磁盘目录名只用 id 的哈希。
- **隔离**：frame 响应头 `Content-Security-Policy: sandbox allow-scripts`，加上 iframe 的 `sandbox="allow-scripts"`，得到 opaque origin，直接打开也一样。文档自身 CSP 是 `connect-src 'none'`，组件发不了网络请求。
- **凭据**：无 cookie。身份票据只在壳页内存里，组件拿不到。审计日志不含票据、code 和正文。
- **写**：见 §4，必须有身份。

已在本地 Chromium 用 9.1 原始文档验证：`self.origin` 为 `null`、读不到 `parent.document`、`fetch` 被 CSP 拦下。飞书内置浏览器待 §7 验证。

## 4. 回发

**文档不改，壳页只实现宿主协议。** `buildWidgetDocument` 自带 `sendPrompt` 和 `openclaw.prompt.send`：先发 `openclaw:widget-prompt-offer` 带 MessagePort，宿主回 `openclaw:widget-prompt-host-ready`，之后点击产生 `openclaw:widget-prompt`。文档用 `navigator.userActivation.isActive` 确认是真实点击。iOS WKWebView 共用同一份文档和协议，只是落点不同。

链路：

```
点击 → 壳页 → POST /api/prompt（票据）→ 复核群成员、限流 6 次/分钟、4000 字
     → Gateway 方法 vwidgets.inbound（operator.write）
     → 机器人在卡片下回复「🧩 某人 在「标题」里：…」（群里可见）
     → handleFeishuMessage（合成事件，发送者=点击人）
```

- **身份**：`tt.requestAccess({scopeList:[]})` 拿一次性 code，服务端用应用凭据换 open_id（和 Voice 同一实现，真实桌面飞书已验证）。浏览器自报的任何字段都不采信。
- **为什么走合成入站，不用 `agent`/`chat.send` RPC**：RPC 是 operator 身份，群里任何人点按钮都会变成管理员回合。合成入站和卡片按钮（`dispatchSyntheticCommand`）同一路径，发送者策略、队列、流式卡片、各 runtime 行为都和本人打字一致。`lab/patch-feishu-widget-inbound.mjs` 只把这个函数按账号暴露给插件。
- **为什么不用 `send_as_user`**：要每人 OAuth 和用户权限，且刷新令牌会过期。先用机器人留痕回复；#505 如果做了用户令牌可以换上。

**实现中修掉的漏洞**：壳页最初接受任意次 offer，恶意组件可以自带 MessagePort，绕开文档里的点击检查。现在每次加载只接受第一个 offer（文档桥先于组件代码运行）。本地用恶意组件验证：计时器调用和伪造端口都没有发出，真实点击正常发出。

## 5. 做不到完全一致的地方

| 差距 | 原因 | 处理 |
|---|---|---|
| 不能在消息流里内嵌 | 飞书没有这种组件 | 卡片首屏放快照 |
| 手机全屏 | `mode` 只对 PC 生效 | 无解，返回即回到会话 |
| 外部租户用户不能回发 | #495 实测 SDK 2700002/内层 20009（应用未安装于该租户），官方也说明拿不到外部用户 `user_access_token` | 只能看；壳页明说原因 |
| 未登记域名不能免登 | #495 实测内层 20029 | 上线用固定域名并登记；临时隧道要逐个登记 |
| 看板 API（`state/data/action/cron`）不可用 | 只属于 pin 后的 board 宿主，内联态上游本来也没有 | 与 Control UI 内联一致 |
| 组件里 `target=_blank` 打不开 | 沙箱没有 allow-popups，与上游内联一致 | 需要时再开「host.open」桥 |
| 同名更新只能按标题 | `present()` 拿不到 `name` | 同会话同标题视为更新：改卡片、页面 15 秒内换新；要精确按 `name` 需一行 core 补丁 |
| 飞书旧客户端 | JSON 2.0 需要 7.20+ | 接受 |

## 6. 卡片首屏与更新

- 先发「标题 + 打开组件」，不等图。然后用无头 Chrome 对 loopback 的 frame 截图，上传后原地 patch 卡片。截图失败不影响打开。
- 同会话同标题再次调用 `show_widget`：URL 不变，版本 +1，原卡片改写并标「已更新到第 N 版」，已打开的页面自动刷新。
- 上线前：快照子进程目前带 `--no-sandbox`，要换成 Chrome 自身沙箱或独立低权用户。
- 没有采用「用原生图表画关键数据」：`show_widget` 的入参只有 HTML，要从任意 HTML 还原数据不可靠。以后要做，需要模型额外传结构化摘要。

## 7. 验证状态

| 项 | 结果 |
|---|---|
| 单元测试（服务 + 卡片 + 补丁） | 通过 |
| 9.1 原始文档 + 壳页，本地 Chromium（SDK 为桩） | 通过：隔离、回发、点击门、恶意端口 |
| 卡片无网页标签 | 实测 |
| candidate：真实 9.1 Gateway + V-Lab + 公网隧道 + 飞书客户端内打开并回发 | **待完成** |
| 手机飞书 | **待完成** |
| /vcodex、/vcc、/vds 下工具是否可用 | **待完成** |

## 8. 上线前待办（未做）

- V 应用的权限和 H5 可信域名未直接读取：读取要用生产凭据，这次没有用。#459/#466/#478 已在 V 上跑通同类标签页和 SDK 免登，推断具备，上线前要核对。
- 独立子域（比如 `widgets.tianyi.live`）：组件和其他公网页面不共用 origin。
- Worker 的第二份配置要加载本插件；systemd 单元、token、cloudflared 路由；`scripts/promote-to-v.mjs` 流程。
