# v-relay：机器之间传大文件

V 网关、V 的各个 node、Tianyi 的 Mac 之间互传几百 MB 到 GB 级文件。日常命令和消息照旧走 Tailscale，不受影响。

```
发送端 ──分块并行 PUT──▶ Worker (v-relay) ──R2 binding──▶ R2 桶 v-relay (APAC, 7 天过期)
接收端 ◀─Range 并行 GET── Worker (v-relay) ◀────────────────┘
```

- 发送端 `vrelay put <file>` 打印一个短 id；接收端 `vrelay get <id> [out]`。两端不用同时在线，可以多台机器各自取同一个 id。
- **边传边取**：put 一开始就在 stderr 打出 id。接收端这时就可以 get，每块一落到 R2 就下载，总耗时约等于较慢的那一段，而不是上传加下载两段相加。
- 大文件在桶里存成一个清单对象 `o/<id>` 加若干块对象 `p/<id>/<n>`，不用 R2 multipart：multipart 的块在 complete 之前读不到，没法边传边取。小文件（≤ 一块）还是单个对象 `o/<id>`。
- 各机器只持有这个 Worker 的令牌。Cloudflare 账号令牌、R2 S3 key 都不离开 Cloudflare：Worker 用 binding 访问桶，令牌存在 Worker secret `RELAY_TOKENS` 里，每台机器一个（`label=token`），可单独吊销。
- 跨境 Tailscale 链路 UDP 丢包约 17%，单流 TCP 只有约 35 KB/s。走 Cloudflare 的 TCP/443，加上多路并行，避开了这个问题。

## 为什么不用 `*.workers.dev`

2026-11-16 在上海（中国移动家宽，直连）实测：

- 国内 DNS（223.5.5.5、119.29.29.29）把 `*.workers.dev` 解析成污染地址（59.24.3.173、`2001::` Teredo 段）。
- 改用真实 IP 后，TCP 能连上，但 TLS 握手立刻被 RST。换一个 Cloudflare IP 用 workers.dev 的 SNI 一样被 RST。
- `tianyi.live` 下的主机名可以访问，但它的两个 IPv4 任播地址里，104.21.x 被 RST、172.67.x 正常（`openclaw.tianyi.live` 现象一样）。家里的 Air 两个都能用。

所以：
1. Worker 绑定 `tianyi.live` 下的自定义域名（部署时 `--domain`，域名不写进 git）。
2. 客户端启动时解析出全部地址，并行探测 `/v1/health`，挑最快的健康地址固定使用。某条连接失败时换下一个健康地址重试。`--route` 会打印探测结果。

## 客户端 `cli/vrelay.mjs`

单文件，无依赖，Node ≥ 18，macOS / Ubuntu 都能跑。

```sh
vrelay put big.tar                     # stderr 立刻打出 "id k7m3p9x2qabc ..."，传完 stdout 再打一次
vrelay get k7m3p9x2qabc ~/Downloads/   # 上传还没完也能开始；校验 sha256 后改名到位
vrelay ls | stat <id> | rm <id>...
vrelay link <id> --hours 24            # 免令牌的签名下载链接，vrelay get <link> 或 curl 都能用
vrelay health --route                  # 看路由探测
```

| 行为 | 说明 |
|---|---|
| 分块 | 上传块默认 16 MiB（`--part-size`，64 KiB–95 MiB；Worker 请求体上限 100 MB）。超过 1 万块时自动加大块。下载按 8 MiB 一段 Range（`--chunk-size`），上海实测 8 MiB 比 16 MiB 快 25–40% |
| 边传边取 | get 发现对象还在上传（`x-relay-state: uploading`），就每秒查一次 `/v1/objects/:id/parts`（`--poll-ms`），把已落地的块交给并行下载。10 分钟没有新块就报错退出（`--follow-timeout-ms`），已下的块保留，重跑同一条 get 续传 |
| 并发 | put 默认 8 路，get 默认 16 路，`--concurrency` 可调（1–64） |
| 重试 | 网络错误、5xx、429 自动重试，每块最多 8 次，指数退避。每次重试都换新连接，并换到下一个健康地址 |
| 慢块 | 空闲 30 s 没有字节就断开重来。已完成 3 块后，若某块耗时超过 max(30 s, 4 × 中位数)，也断开重传 |
| 对冲（下载） | 没有新块可取时，空闲连接把在途最慢的那块在新连接上再要一次（已跑超过 max(3 s, 2 × 中位数)），谁先完成用谁，另一个取消。跨境时少数卡住的连接会决定总耗时：2026-11-16 V→Air 不对冲时，最后 30 MiB 用了 108 s。`--hedge off` 关闭 |
| 断点续传 | put 的状态存在 `~/.cache/vrelay/put/`，get 的状态存在 `<out>.vrelay-state.json`（未完成的数据在 `<out>.vrelay-part`）。中断后重跑同一条命令，只传缺的块 |
| 校验 | put 前算整文件 sha256 写入清单；每一块再带自己的 sha256，由 R2 在写入时校验。get 完成后重算整文件 sha256，不一致就删掉临时文件并报错 |
| 地址族 | 默认 `--family 4`（IPv6 波动大），IPv4 全部不通时退到 IPv6。`auto` 是两族一起比，`--resolve ip1,ip2` 可手工指定地址 |
| 绕开代理 | 系统 DNS 返回代理的 fake-IP（Clash/Surge 的 198.18.0.0/15）时，改用公共 DNS（223.5.5.5、119.29.29.29、1.1.1.1、8.8.8.8）解析真实地址直连。Tianyi 的 Mac 实测：经 Clash 2.8 MiB/s，直连 7.6 MiB/s。`--dns system` 关掉这个行为 |
| 限速 | `--limit 45mbit` 或 `4M`（字节/秒），所有并发连接共用一个令牌桶。`--download-limit` 同理 |

配置文件 `~/.config/vrelay/config.json`，权限必须是 600，否则拒绝运行：

```json
{"endpoint": "https://<relay-host>", "token": "<本机令牌>", "uploadLimit": "45mbit"}
```

`vrelay login --endpoint https://<relay-host> [--limit 45mbit]` 从 stdin 读令牌并写入这个文件。也可以用环境变量 `VRELAY_ENDPOINT`、`VRELAY_TOKEN_FILE`、`VRELAY_UPLOAD_LIMIT` 等指定。

## V 的出口和模型请求

V 的公网出口有 `v-egress-shape.service` 整形：`cake bandwidth 55mbit besteffort triple-isolate`。

- `besteffort` 不看 DSCP，所以给上传打 CS1/bulk 标记没有效果。改成 `diffserv4` 属于生产网络改动，不在本 PR 里。
- `triple-isolate` 按主机对公平分配带宽：所有上传连接都去 Cloudflare，算在少数几个目的主机上，和模型 API 的连接是分开排队的。
- 另外，V 上的配置设 `uploadLimit: "45mbit"`（约 5.4 MiB/s），给模型请求留出约 10 Mbit。2026-11-16 V 出口持续 45 Mbit 时，DeepSeek 首字节时间平均 0.134 s，与空闲时相同。临时需要更快，可以加 `--limit 0`。实测见 PR 正文。

上传端的速度受发送方出口限制（V 是 55 Mbit 整形，约 6.5 MB/s 封顶），R2 不能突破这个上限。R2 带来的好处在下载端：国内下载更快、支持断点、多台机器可以各自去取，而且 R2 不收出站流量费。

## Worker `worker/`

| 路由 | 鉴权 | 作用 |
|---|---|---|
| `GET /v1/health` | 无 | 探活 |
| `POST /v1/uploads` `{name,size,sha256,partSize}` | Bearer | 写清单 `o/<id>`（state=uploading），返回 `{id, partSize, parts}` |
| `PUT /v1/uploads/:id/parts/:n`（头 `x-relay-sha256` 可选） | Bearer | 写块 `p/<id>/<n>`，大小必须正好，带 sha256 时由 R2 校验 |
| `POST /v1/uploads/:id/complete` | Bearer | 核对所有块都在且大小正确，清单改为 complete；缺块返回 409 |
| `DELETE /v1/uploads/:id` | Bearer | 中止：删除清单和所有块 |
| `POST /v1/objects`（头 `x-relay-sha256`、`x-relay-name`） | Bearer | ≤95 MiB 的单次上传，由 R2 校验 sha256 |
| `GET/HEAD /v1/objects/:id`（支持 `Range`） | Bearer 或签名 | 下载 / 元数据（`x-relay-size`、`x-relay-sha256`、`x-relay-name`、`x-relay-state`、`x-relay-part-size`）。上传中只给已落地的块，否则 409 |
| `GET /v1/objects/:id/parts` | Bearer 或签名 | 上传进度 `{state, size, partSize, parts, done:[n...]}`，供边传边取轮询 |
| `GET /v1/objects` | Bearer | 列表（分页） |
| `DELETE /v1/objects/:id` | Bearer | 删除清单和所有块 |
| `POST /v1/objects/:id/link` `{ttlSeconds}` | Bearer | 签名链接，最长 7 天，HMAC 密钥是 Worker secret `RELAY_LINK_KEY` |

桶的生命周期规则对整个桶生效：对象 7 天后过期（清单和块都算），所以中途放弃的上传最多留 7 天。

```sh
npx wrangler@4 r2 bucket create v-relay --location apac
npx wrangler@4 r2 bucket lifecycle add v-relay expire-7d-abort-1d --expire-days 7 --abort-multipart-days 1 --force
cd apps/v-relay/worker
npx wrangler@4 deploy --domain <relay-host>         # 每次部署都带上 --domain，自定义域名不写进 git
printf %s "$TOKENS"   | npx wrangler@4 secret put RELAY_TOKENS     # mac=...,v=...,air=...
printf %s "$LINK_KEY" | npx wrangler@4 secret put RELAY_LINK_KEY
```

令牌清单只存在 Tianyi 的 Mac 上：`~/.config/vrelay/relay-secrets.json`（600）。新增或吊销一台机器，就改这个文件，再重新执行 `secret put RELAY_TOKENS`。

## 安装到一台机器（PR 合入后按发布流程执行）

```sh
install -m 755 apps/v-relay/cli/vrelay.mjs /usr/local/bin/vrelay   # 或 ~/.local/bin/vrelay
printf %s "$MACHINE_TOKEN" | vrelay login --endpoint https://<relay-host> [--limit 45mbit]
vrelay health --route
```

V 上以 `openclaw` 用户安装（配置放在 `/home/openclaw/.config/vrelay/`，带 `--limit 45mbit`），然后在 V 工作区的 TOOLS 说明里加上用法。

## 测试

`node --test tests/v-relay.test.mjs`：在本地 HTTP 适配层后面跑真实的 Worker 模块，桶是内存实现，客户端是真实 CLI。覆盖：注入 500、连接重置、响应截断、卡住不动、慢块；put/get 断点续传；上传会话丢失后重新开始；边传边取，以及发送端中断时接收端超时退出、恢复后续传；sha256 不一致；签名链接；限速；路由探测；fake-IP 绕开代理；配置权限。
