---
name: large-file-transfer
description: 跨境传文件：V（新加坡腾讯云）和 Tianyi 上海家里的机器（他的 Mac、MacBook Air）之间，用 vrelay（Cloudflare R2 中转）。同一侧的传输（V 和 mirror-v-portal 等新加坡腾讯云主机之间，Mac 和 Air 之间）直接用 scp/rsync；V-Shanghai 不走 vrelay。关键词：传文件、发给我、拷到 Mac、下载到 Air、大文件、视频、素材包、scp、rsync、vrelay。
---

# 跨境大文件传输：vrelay

`vrelay` 只用于一条线：**新加坡的 V ↔ Tianyi 上海家里的机器（他的 Mac、MacBook Air）**。这条线跨境，ssh、scp、rsync 走 Tailscale 很慢，实测 10 分钟只传了 17 MB。vrelay 把文件分块传到 Cloudflare R2，接收方多路并行下载，两端各校验一次 sha256。2026-11-16 实测 590 MB：V → 家里约 2 分钟，Mac → V 约 1.5 分钟。

## 用哪个

| 从 → 到 | 用什么 |
|---|---|
| V ↔ Tianyi 的 Mac 或 MacBook Air，文件超过约 50 MB | **vrelay** |
| V ↔ Mac/Air，小文件 | 都行；飞书附件、scp 都可以 |
| V ↔ mirror-v-portal 等新加坡腾讯云主机（同一 VPC，内网约 1 ms） | 直接 scp/rsync，不用 vrelay |
| Mac ↔ Air（同一个家庭局域网） | 直接拷，不用 vrelay |
| V-Shanghai | **不要用 vrelay**。它自己的上行只有约 3 Mbit，vrelay 解决不了；它还承载语音设备，不要往它上面传大文件 |

## 用法

```sh
vrelay put <file>              # 一开始就在 stderr 打出 "id <id> ..."，传完 stdout 再打一次 id
vrelay get <id> [目标路径或目录] # 校验 sha256 后改名到位；put 还没传完也能开始
vrelay link <id> --hours 24    # 免令牌的下载链接（最长 7 天），浏览器或 curl 都能用
vrelay ls | stat <id> | rm <id>
```

- **V 发给 Tianyi**：在 V 上 `vrelay put`，从 stderr 读 `id` 那一行，马上在飞书里把 id 和一行命令发给 Tianyi：`vrelay get <id> ~/Downloads/`。Tianyi 不在电脑前、要在手机上看，就发 `vrelay link <id>` 生成的链接。
  - 文件大时用后台 exec，读到 id 就先回复，再等进程结束确认 `sha256`。
  - 对方不用等传完，传到哪下到哪。
- **V 发到 Air**：V 上 put，再用节点 exec 让 Air 执行 `vrelay get <id> <目录>`。反方向就在 Air 上 put，V 上 get。
- 下载中断了，重跑同一条 `vrelay get` 会续传。put 也一样。

## 规则

- **一次只跑一个 `vrelay put`。** V 的上传限速 45 Mbit 是按进程算的，并发几个 put 就是几倍，会挤占模型请求。多个文件先打包，或者一个传完再传下一个。下载（get）可以并发。
- **中转站上的文件 7 天后自动删除。** 要长期保存的，接收方取到后自己存好。用完可以 `vrelay rm <id>`。
- 签名链接任何拿到的人都能下载。只发给要文件的人，不要贴进群；有效期按需要设短一点。
- 配置在 `~/.config/vrelay/config.json`（权限 600），里面是这台机器自己的令牌。不要读出来、打印或转发。
- 报错 `not configured` 或 `401`，说明这台机器没装好或令牌被吊销。告诉 Tianyi，不要自己找别的令牌。

## 常见问题

- `no new parts ... for 600 s`：发送端停了。查发送端的进程，重跑 put 会续传，然后重跑 get。
- `sha256 mismatch`：临时文件已经自动删除，重新 get 即可。
- 速度：晚高峰跨境会慢一些，工具会自动多路并行、处理卡住的连接。不要自己加 `--concurrency`。
