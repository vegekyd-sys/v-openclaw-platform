<!-- Snippet for ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md on Tianyi's Mac
     (keep the two copies identical). -->

### 跨境大文件（vrelay）

这台 Mac 和 MacBook Air 在上海家里，V 在新加坡腾讯云。**只有这条跨境线用 `vrelay`**：Mac/Air ↔ V，文件超过约 50 MB 时用。scp/rsync 跨境走 Tailscale 很慢。

- 同一侧直接拷：Mac ↔ Air 走局域网；V ↔ mirror-v-portal 等新加坡腾讯云主机，在 V 上直接 scp/rsync。V-Shanghai 不走 vrelay，也不要往它上面传大文件（上行约 3 Mbit，承载语音设备）。
- 这台 Mac：`/opt/homebrew/bin/vrelay`（包装脚本，实际代码在 `~/.local/share/vrelay/vrelay.mjs`，由 v-openclaw-platform 的 `apps/v-relay/install.mjs` 装），配置 `~/.config/vrelay/config.json`（600，本机令牌）。系统 DNS 是 Clash fake-IP 时，它会自动直连，不用改 Clash。
- 发：`vrelay put <file>`，stderr 第一行就有 `id <id>`，对方立刻可以开始取，不用等传完。收：`vrelay get <id> [目录]`，会校验 sha256、断了重跑会续传。免令牌链接：`vrelay link <id> --hours 24`。
- 让 V 取：`ssh v "sudo -n -u openclaw vrelay get <id> <目录>"`；V 发给这台 Mac：V 上 `sudo -n -u openclaw vrelay put <file>`，这里 `vrelay get <id>`。
- 一次只跑一个 put；中转站上的文件 7 天后自动删除，用完可以 `vrelay rm <id>`。
- `~/.config/vrelay/relay-secrets.json` 是所有机器的令牌清单，只给 `apps/v-relay/install.mjs` 用。不要读出、打印，也不要拷到别处。
- 新机器、重装：`node apps/v-relay/install.mjs --dry-run`，再去掉 `--dry-run`（说明见 apps/v-relay/README.md）。
