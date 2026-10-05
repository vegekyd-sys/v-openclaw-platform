# V Experience 多渠道：配置部分与上线顺序

设计和实测见 `docs/v-experience.md` 第 12–17 节。这次发版分三类东西，走三条路，但同进同出（一个 R 槽位）：

| 部分 | 内容 | 怎么上 VLab / V |
|---|---|---|
| 运行时字节 | core（command-auth V3、Telegram 补丁、secret-entry `channels-v1`），钉钉连接器、企微插件的补丁文件 | `vlab.mjs package/stage/deploy` → `promote-to-v.mjs`（组件表 `scripts/lib/runtime-components.mjs` 负责映射、捕获、哨兵） |
| 旁路服务 | 接管服务 + 插件（`apps/v-desktop-handoff`）、凭据链接服务（`apps/v-secret-entry`） | `scripts/install-desktop-host.sh`、`scripts/install-secret-entry-host.sh`，两台机器用同一个提交；parity 比对 `/opt/[vlab-]v-desktop-handoff`、`/opt/[vlab-]v-secret-entry` |
| 配置 | 本目录：`config.mjs`（纯函数）+ `activate.mjs`（受控重启写入） | `activate.mjs vlab` / `activate.mjs production` |

## 配置改什么

- **V**：只有 `commands.allowFrom` 加上 `telegram`、`dingtalk-connector`、`wecom` = `["*"]`。owner、渠道、绑定、插件都不动。
  前提：运行时的 `command-auth-*.js` 已是 V3（`activate.mjs` 检查 `V_MODEL_COMMAND_ONLY_V3`；V2 只认飞书，先改配置会让钉钉 / 企微非 owner 拿到全部非 owner 命令）。
- **VLab**：VLab 自己的测试机器人（与 `lab/candidate/live-experience.mjs` 相同）：
  - `channels.dingtalk-connector` / `wecom` / `telegram`，凭据写成 `${VLAB_DINGTALK_TEST_CLIENT_ID}` 这类引用，值只在 `secrets.env`（共享 Gateway 的 EnvironmentFile；没有时加 drop-in `97-v-experience-secrets.conf`）。配置里已有非引用的凭据就拒绝。
  - 钉钉、企微 `open`；Telegram 只放行 Tianyi（`5368086561`），并加为 owner。
  - 三个插件 enabled 并在 `plugins.allow`；`bindings` 指向 `makaron`；`commands.allowFrom` 同 V。
  - drop-in `97-v-experience-dingtalk-card.conf`：`V_DINGTALK_QUESTION_CARD_TEMPLATE` = 钉钉公开示例模板（只在 VLab；生产要先导入到我们自己的应用）。
- Worker 配置不单独写：Gateway 启动时由 `worker-config-derive` 派生（#172）；运行时没有它时脚本拒绝。

```sh
node config.mjs production /home/openclaw/.openclaw/openclaw.json                     # 只看计划
node config.mjs vlab <VLab 配置> --secrets /srv/.../db91-parity/secrets.env          # 只看计划（只读名字，不读值）
sudo <node> activate.mjs vlab --owner <lease owner>        # VLab：持 lease，拿共享操作锁，空闲栅栏 → 停 → 写 → 起 → health
sudo <node> activate.mjs production                       # V
sudo <node> activate.mjs <vlab|production> --rollback [--owner <o>]   # 按最新 receipt 原样恢复配置、删 drop-in
```

每次激活把原配置原样留成 `<配置>.before-v-experience-multichannel-<时间>`，receipt 在 `/var/lib/v-release-config/v-experience-multichannel/`。回滚只在配置仍是激活时写的那份时执行，否则拒绝并给出备份路径。

## 一轮完整顺序（VLab → V → ALIGNED）

前提：`scripts/vlab-channel-plugins-prep.mjs --apply` 已在 VLab 上跑过（钉钉、企微在 runtime/ 里），之后 `vlab.mjs baseline` + `align`。VLab 上的 server 工具副本已含 `extensions` 目标（`lab/shared/files.mjs`，手工更新）。

1. VLab，持 lease：`install-desktop-host.sh`（`UNIT_PREFIX=vlab-`）、`install-secret-entry-host.sh`（`UNIT_PREFIX=vlab- GATEWAY_UNIT=openclaw-vlab-production-mirror-v8.service PUBLIC_BIND=fd7a:115c:a1e0::e539:be40`），用 R 的同一个提交。
2. VLab：`activate.mjs vlab --owner <o>`（重启一次，Gateway 读到 `V_SECRET_ENTRY_*` 和卡片模板）。**必须在 stage 之前**：stage 记下配置 hash，deploy 和 accept 都要求它不变。此时运行时还是 V2，脚本只提示不拦。
3. VLab：`package/stage/deploy` 运行时字节（R），deploy 再重启一次，V3 和渠道补丁生效。
4. 真机验收（钉钉 / 企微 / Telegram 测试机器人），`vlab.mjs accept`。parity：`node scripts/vlab-v-parity.mjs --pending <R 的 plan>`，plan 里写 `"sidecars": ["secret-entry", "handoff"]`，应为 `AHEAD`。
5. V：`install-desktop-host.sh`、`install-secret-entry-host.sh`（同一提交；cloudflared 加 `/secret-entry`，见脚本输出）。**必须在第 6 步之前**，否则第 6 步末尾的 align 会因旁路服务不同而拒绝（脚本会提示改装旁路服务再 align，不会提示 sync）。
6. `promote-to-v.mjs --release <R> --name <V 发版名> --owner <o> --apply`：装字节、捕获 `<name>{,.worker,.feishu,.dingtalk,.wecom}`、更新哨兵、align。
7. V：`activate.mjs production`（这次重启让运行时字节和 `V_SECRET_ENTRY_*` 生效）。
8. 收尾：提交捕获 + CHANGELOG（`release-notes.mjs`，钉钉 / 企微第一次出现会写成"首次纳入存档"），发版 PR，打 tag；接管旁路服务对齐后把组件表里 `handoff` 改成 `blocking: true`。

不上线：VLab 上先 `vlab.mjs rollback`（它也核对 stage 时的配置 hash，所以配置要保持激活状态），再 `activate.mjs vlab --rollback --owner <o>`，最后 `install-secret-entry-host.sh` 的 `MODE=uninstall`、接管服务装回 V 的提交。
