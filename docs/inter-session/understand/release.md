**结论**

1. **怎么声明和发布补丁**：每个组件都是整文件替换。改出来的字节必须由 V 现在跑的字节生成，并用测试钉死。新测试必须登记进 catalog。新加的 `scripts/patch-*.mjs` 必须登记成 adaptation，并写指纹。v-session-relay 插件目前不属于任何可发布组件，CI 也不跑它的测试。
2. **candidate 改代码的两种方式**：plan 的 `files` 会做 before 哈希校验，并写进 receipt。在测试脚本里直接改 `$VLAB_CANDIDATE_RUNTIME` 不会被 receipt 记下。
3. **共享 VLab**：只有一个发版槽。stage 要求 lease、dev 上的提交，并且 VLab 已和 V 对齐。出口只有两个：上 V 后 align，或者 rollback。合入 dev 和上 V 都要 Tianyi 针对这次变更明确批准，重启 V 另由人决定。
4. **CI**：`npm test`、`node --test tests/workboard-*-patch.test.mjs`、`./tests/vlab-static.sh`。
5. **PR 和 CHANGELOG**：PR 用中文写，带 candidate ID 和前后哈希。上 V 之后，捕获和 CHANGELOG 放同一个 PR。dev→main 发版 PR 和 tag 目前落后。

---

## (1) 各组件怎么声明和发布

**通用做法（已验证）**
- 产物放在 `lab/release-files/<名>/`，里面是补丁脚本，加上生成文件或整份文件。
- 发版 plan 是 `lab/<名>.plan.json`，写 `source / target / before / after`，`baseRelease` 先写 `"REPLACE_AT_STAGE"`（`lab/session-info-subagent-index.plan.json`）。
- 共享 VLab 只接受这几类目标前缀：`openclaw/`、`production-worker/`、`npm/`、`extensions/` 等（`lab/shared/files.mjs:21`）。
- 组件只认一张表：`scripts/lib/runtime-components.mjs:43-103`。

**"由 V 线上字节生成"的测试，目前有三种写法（已验证）**
- **读捕获再比对**：读 `release/captured/<当前V发版>/dist/<file>`，打补丁，断言结果等于提交的 generated 文件。例子是 `tests/sessions-send-reply-once.test.mjs:8-17`。它固定读 `v2026.9.1-db91.6-subagent-index-20261020`，V 之后再改这个文件时，测试要改指向。
- **反向还原再比哈希**：把发布文件反向还原，断言 sha 等于 plan 的 `before`（固定为 `V_BYTES_SHA256`）。例子是 `lab/session-info-subagent-index.test.mjs:19-27`。
- **build 脚本**：`lab/build-*.mjs --base <V 的文件>` 从 V 字节重建，测试把产物叠在捕获上跑（Worker 的例子，见下）。

**core 的捕获只存和 npm 不同的文件（已验证）**
- 捕获只放与 `npm:openclaw@2026.9.1` 不同的文件。没改过的文件按 `release/captured/base/openclaw@2026.9.1.json` 的哈希对照，见 `release/captured/README.md`。
- 插件（feishu / worker / codex / dingtalk / wecom）是整目录捕获（manifest `baseDir: none`）。

**catalog 规则（已验证）**
- `scripts/` 和 `experiments/` 下每个 `patch-*.mjs` 都必须登记成 adaptation，并写 `sourceSha256`，否则报 "Unregistered adaptation"（`platform/core.mjs:29-49,116-128`）。`lab/release-files/*` 不在扫描范围内，不需要登记。
- `scripts / tests / lab / platform / experiments` 下每个 `*.test.mjs`，要么进 `offlineSuites`，要么进 `deferredTestFiles`（`core.mjs:91-104`）。
- `platform/platform.test.mjs:29` 写死了计数 `adaptations:31, offlineFiles:310`，加测试时要同时改这个数。
- reply-once 测试已经登记在 `channel-patches` 套件里（`platform/catalog.json:152-172`）。当前 audit 结果是 `catalogValid=true`。

**各组件**
- **core 和 Telegram**：Telegram 打包在 core dist 里，目标写 `openclaw/dist/…`，例子见 `lab/release-files/v-experience-channels/`（已验证）。
- **Feishu 插件**
  - 目标前缀：`npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/…`。
  - 捕获路径多一层 dist：`release/captured/<名>.feishu/dist/dist/<file>`（`tests/patch-feishu-progress-stream.test.mjs:22-25`）。
  - V 上的 Feishu 目录是 `/opt/openclaw-experiments/worker-visible-progress-…/feishu`。
- **DingTalk 和 WeCom**
  - 补丁在 `apps/v-experience/{dingtalk,wecom}/patch.mjs`。
  - `*/baseline/` 放 V 未打补丁的字节，产物目录里的 `manifest.json` 记 before/after（`apps/v-experience/README.md:20-27`，`lab/release-files/v-experience-channels/README.md`）。
  - 目标：DingTalk 是 `npm/projects/dingtalk-real-ai-dingtalk-connector-aa54111b45__…/dist/…`，WeCom 是 `extensions/wecom-openclaw-plugin/dist/src/…`。
- **Worker**
  - `lab/build-<名>.mjs --base` 读 V 的 `…/worker/` 生成 `index.mjs`，plan 记 `before`。
  - 测试叠在 `release/captured/<名>.worker/dist` 上跑（`lab/build-worker-config-roll.mjs:1-30`，`tests/worker-config-roll.test.mjs:15-25`）。
- **Codex 插件**
  - 目标前缀：`npm/projects/openclaw-codex-8902d781d4__…g-b42d646e5561ece2/node_modules/@openclaw/codex/dist/…`。
  - VLab 的 Gateway 实际加载的是 `state/npm/projects/openclaw-codex-*` 那一份，发版通道写不到，要手工 `cp -a` 同步，否则 align 会被拒（`docs/vlab-v-sync-flow.md:207-208`；`CHANGELOG.md:178` 的 #426 例子）。
  - 按 V 字节重新生成的产物有时单独开 PR，例如 #427 "release(codex): …发版产物（按 V 线上字节生成）"。
- **v-session-relay 插件**：`runtime-components.mjs` 和 `vlab-static.sh` 里都没有它（已验证）。`apps/v-session-relay/plugin/tests/relay.test.mjs` 不在 audit 扫描的目录里，CI 不跑。要上 V，要么在组件表里加一项并做第一次捕获，要么像 sidecar 那样写一个安装脚本（推断）。

## (2) candidate 怎么换文件

- **plan 的 `files`（已验证）**
  - 客户端把每个文件读成 `{content, sha256, target, before}`（`lab/candidate/client.mjs:22`）。
  - 服务器先用 reflink 复制共享 VLab 当前发版的缓存 runtime，再按 target 覆盖。给了 `before` 就比对哈希，不符直接失败（`runner.mjs:153,180-193`）。
  - receipt 里记下 files 的 before/after（`runner.mjs:231`）。
  - `baseRelease` 可选；给了就必须等于当前发版（`runner.mjs:150`）。
- **在脚本里直接改**
  - 例子：`lab/candidate/session-relay-native.mjs:70-83` 在私有 runtime 里调用 `patchSessionsSendReplyOnce`；`:61-68` 只在 candidate 里放开 Feishu 的 trusted-plugin 门（已验证）。
  - 这些改动不会出现在 receipt 的 files 里（推断）。
  - 对照组用 `RELAY_NO_PATCH=1` 跑（`lab/candidate/session-relay-native-control.plan.json`）。
- **交付前要换成 `files` 方式**：README 要求提交后核对被测文件的哈希（`lab/AGENT-QUICKSTART.md:23`）。用 `files` 加 `before` 做证据，才能和发版 plan 一一对应（推断）。

## (3) 共享 VLab 和授权

- **流程**（`lab/README.md:51-105`）：
  1. Tianyi 批准合入 dev。
  2. `vlab.mjs merge`，或在 GitHub 上合并后把本机 `~/vlab-dev` 同步到 origin/dev。
  3. `package --commit <dev HEAD>`：dev 必须干净，文件从 `git show commit:source` 读（`lab/vlab.mjs:60-66`）。
  4. 依次 `lease` → `stage` → `deploy` → `accept --evidence`（evidence 至少 20 字，并引用真实功能结果），或者 `rollback` → `lease --release true`。
- **服务器端的强制规则（已验证）**
  - stage、deploy、align、accept 都要持有 lease（`lab/shared/server.mjs:39-40,149-151`）。
  - stage 要求 `branch==='dev'`、`current().v.aligned===true`（`syncFromV` 例外）、`baseRelease` 等于 current、runtime 指纹没变，并逐个校验 `before`（`server.mjs:195-206`）。
  - deploy 把状态记成 `aligned:false, aheadBy`（`server.mjs:118-119`）。
  - align 只接受本机 parity 跑出的 `ALIGNED`（`server.mjs:224`）。
  - `vlab.mjs test` 发消息用 `deliver:false`，不走任何渠道；要在业务会话或真实渠道上验收，需要另外明确授权（`lab/README.md:45`）。
- **一个槽、两个出口**：上 V（`promote-to-v.mjs --apply`）后 align，或者 `rollback`（`docs/vlab-v-sync-flow.md:23-67,148-160`）。
- **`promote-to-v.mjs` 做什么**（`scripts/promote-to-v.mjs:11-33,54-78`）：
  - 要求发版已在 VLab accept、`branch dev`、lease 归自己，并且 V 上每个目标都还是 `before` 字节。
  - 先备份 V 原文件并写 undo.json，再装文件，然后重新捕获全部组件、更新哨兵、align。
  - 它不重启 V。重启用 `v-self-restart`，重启前先确认没有正在进行的用户回合（记忆 v-self-restart）。
- **需要 Tianyi 授权的事**
  - 合入 dev：要针对这次变更明确批准，测试通过或修复请求都不算（`AGENTS.md`；`lab/README.md:3,51`）。
  - 上 V：需要生产授权（`lab/README.md:111`）。catalog 的 `assemblyBlockers` 还写着要绑定精确 release ID 并经用户批准。
  - 顺序：review → 合 dev → 打包 → 部署（记忆 merge-before-deploy）。

## (4) PR 至少要过的检查

```sh
npm ci && npm test                       # = node platform/cli.mjs test：catalog 里 310 个测试，并发 2
node --test tests/workboard-*-patch.test.mjs
./tests/vlab-static.sh                   # Feishu 补丁测试、捕获可重建校验、每个捕获都有 CHANGELOG 一节、scan-secrets
node platform/cli.mjs audit              # 新补丁、新测试都已登记，指纹无漂移
```

- CI 配置在 `.github/workflows/vlab-static.yml`，触发条件是 PR 和 push dev/main，用 Node 22。
- 和这次改动相关的定向测试：
  - `node --test tests/sessions-send-reply-once.test.mjs tests/v-experience.test.mjs tests/patch-feishu-progress-stream.test.mjs tests/patch-feishu-task-status.test.mjs`
  - `node --test apps/v-session-relay/plugin/tests/relay.test.mjs`（CI 不跑，要手动跑）
  - 加组件时再跑 `node --test scripts/promote-to-v.test.mjs scripts/lib/runtime-components.test.mjs`
  - 改 lab 工具时跑 `node --test lab/shared/files.test.mjs lab/config.test.mjs`
- 合并时先单独跑 `gh pr checks <n> --watch`，确认全绿后再 `gh pr merge`，两步不要用管道或分号串起来（记忆 merge-only-after-green-checks）。
- `vlab-static.sh:47` 的 `CURRENT_V` 还写死在 `media-relay-20260925`，已过时（已验证）。

## (5) PR 和 CHANGELOG 惯例

- **功能 PR**：中文，分「结论 / 证据 / 改动 / 未覆盖·后续」四段。写明 candidate ID、V 字节 `before → after` 的哈希、plan 路径、是否需要 v-self-restart、"已登记进 catalog"。第一个提交放 V 原字节，方便看 diff。正文末尾加 🤖 行（参考 #437）。
- **上 V 之后**：开一个 PR 叫「release: 捕获 V（<名>，#N 上线）+ CHANGELOG」，同时提交 `release/captured/<名>{,.worker,.feishu,.codex,.dingtalk,.wecom}` 和 CHANGELOG 一节（参考 #438；记忆 changelog-with-capture-pr）。
  - 文件变化用 `node scripts/release-notes.mjs --from <上版> --to <名>` 生成：先打临时 tag，用 `--at HEAD`。
  - 摘要、上线时间、重启记录、验收、遗留由人写（`CHANGELOG.md:1-12,14-40`）。
- **命名**：V 发版名是 `v2026.9.1-db91.6-<主题>-<YYYYMMDD>`，对应的 VLab 发版 ID 是 `<主题>-<YYYYMMDD>`。
- **dev→main 发版 PR 加 tag 已经落后（已验证）**：origin/main 最后一次是 #394（10/16）；远端没有 10/17–10/20 这几个发版的 tag。