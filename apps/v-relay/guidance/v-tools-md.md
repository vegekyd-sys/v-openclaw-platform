<!-- Text to add to V's workspace TOOLS.md (live workspace, committed there per
     v-core CONTRIBUTING.md; v-core picks it up at its next sync). Keep it this
     short: the details live in the large-file-transfer skill, which
     apps/v-relay/install.mjs installs from git. -->

### 跨境大文件（vrelay）
- 只用于 V（新加坡）↔ Tianyi 上海家里的 Mac / MacBook Air：文件超过约 50 MB 时用 `vrelay put <file>` / `vrelay get <id>`，详见技能 `large-file-transfer`。put 一开始就把 id 发给对方（飞书里给 Tianyi：id 和 `vrelay get <id> ~/Downloads/`，或 `vrelay link <id>` 的链接），对方不用等传完。
- 同一侧直接 scp/rsync：V ↔ mirror-v-portal 等新加坡腾讯云主机、Mac ↔ Air。V-Shanghai 不走 vrelay，也不要往它上面传大文件（上行约 3 Mbit，承载语音设备）。
- 一次只跑一个 put（限速按进程算）；中转站上的文件 7 天后自动删除。
