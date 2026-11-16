<!-- Snippet for ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md on Tianyi's Mac
     (keep the two copies identical). -->

### 大文件传输（vrelay）

和 V、V 的节点（MacBook Air、mirror-v-portal、V-Shanghai）之间传文件：超过约 50 MB，或任何要放到另一台机器上的文件，都用 `vrelay`。不要用 scp/rsync（跨境 Tailscale 很慢），也不要经 Gateway 或飞书附件。

- 这台 Mac：`/opt/homebrew/bin/vrelay`（包装脚本，实际代码在 `~/.local/share/vrelay/vrelay.mjs`，由 v-openclaw-platform 的 `apps/v-relay/install.mjs` 装），配置 `~/.config/vrelay/config.json`（600，本机令牌）。系统 DNS 是 Clash fake-IP 时，它会自动直连，不用改 Clash。
- 发：`vrelay put <file>`，stderr 第一行就有 `id <id>`，对方立刻可以开始取，不用等传完。收：`vrelay get <id> [目录]`，会校验 sha256、断了重跑会续传。免令牌链接：`vrelay link <id> --hours 24`。
- 让 V 取：`ssh v "sudo -n -u openclaw vrelay get <id> <目录>"`；V 发给这台 Mac：V 上 `sudo -n -u openclaw vrelay put <file>`，这里 `vrelay get <id>`。节点上同样是 `vrelay get/put`。
- 一次只跑一个 put；中转站上的文件 7 天后自动删除，用完可以 `vrelay rm <id>`。
- `~/.config/vrelay/relay-secrets.json` 是所有机器的令牌清单，只给 `apps/v-relay/install.mjs` 用。不要读出、打印，也不要拷到别处。
- 新机器、重装：`node apps/v-relay/install.mjs --dry-run`，再去掉 `--dry-run`（说明见 apps/v-relay/README.md）。
