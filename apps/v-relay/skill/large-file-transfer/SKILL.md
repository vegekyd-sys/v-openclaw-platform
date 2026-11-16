---
name: large-file-transfer
description: 在 V、V 的节点（MacBook Air、mirror-v-portal、V-Shanghai）和 Tianyi 的 Mac 之间传大文件，用 vrelay（Cloudflare R2 中转）。文件超过约 50 MB，或者任何文件要交给另一台机器或节点时使用。关键词：传文件、发给我、拷到 Mac、下载到节点、大文件、视频、素材包、scp、rsync、vrelay。
---

# 大文件传输：vrelay

V 和节点之间、V 和 Tianyi 的 Mac 之间传文件，一律用 `vrelay`。不要用 scp、rsync 或节点 exec 搬大文件：跨境走 Tailscale，scp 实测 10 分钟只传了 17 MB。不要往飞书里塞大附件。

vrelay 把文件分块传到 Cloudflare R2，接收方并行下载，两端各算一次 sha256 校验。2026-11-16 实测 590 MB：V → 家里约 2 分钟，Mac → V 约 1.5 分钟。

## 什么时候用

- 文件超过约 50 MB。
- 任何文件（不论大小）要给另一台机器：节点、Tianyi 的 Mac、另一台服务器。

## 用法

```sh
vrelay put <file>              # 一开始就在 stderr 打出 "id <id> ..."，传完 stdout 再打一次 id
vrelay get <id> [目标路径或目录] # 校验 sha256 后改名到位；put 还没传完也能开始
vrelay link <id> --hours 24    # 免令牌的下载链接（最长 7 天），浏览器或 curl 都能用
vrelay ls | stat <id> | rm <id>
```

- **在 V 上发**：`vrelay put` 一开始，就在 stderr 读 `id` 那一行，马上把 id 和接收命令发给对方。对方不用等传完，传到哪下到哪。
  - 文件大时用后台 exec，读到 id 就先回复，再等进程结束确认 `sha256`。
- **往节点发**：在 V 上 put，再用节点 exec 让节点执行 `vrelay get <id> <目录>`。也可以反过来，在节点上 put、在 V 上 get。
- **发给 Tianyi**：在飞书里给出 id 和一行命令 `vrelay get <id> ~/Downloads/`。Tianyi 不在电脑前、要在手机上看，就给 `vrelay link <id>` 生成的链接。
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
