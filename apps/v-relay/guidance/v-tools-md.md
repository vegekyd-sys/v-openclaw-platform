<!-- Text to add to V's workspace TOOLS.md (live workspace, committed there per
     v-core CONTRIBUTING.md; v-core picks it up at its next sync). Keep it this
     short: the details live in the large-file-transfer skill, which
     apps/v-relay/install.mjs installs from git. -->

### 大文件传输（vrelay）
- 文件超过约 50 MB，或任何文件要交给另一台机器（节点、Tianyi 的 Mac）：用 `vrelay put <file>` / `vrelay get <id>`，详见技能 `large-file-transfer`。不要用 scp、rsync 或飞书附件搬大文件。
- put 一开始就把 id 发给接收方（飞书里给 Tianyi：id 和 `vrelay get <id> ~/Downloads/`，或 `vrelay link <id>` 生成的链接）；对方不用等传完。
- 一次只跑一个 put（限速按进程算）；中转站上的文件 7 天后自动删除。
