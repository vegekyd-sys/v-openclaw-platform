# Handoff：/vds = Codex harness + DeepSeek V4.1 Flash（合入共享 VLab）

- 交接方：Claude Code 会话（owner `claude-vds-20260922`）
- 接手方：Codex 会话，在下一次共享 VLab 发版窗口合入
- 分支：`codex/vds-codex-deepseek`（worktree `~/v-worktrees/vds-codex-deepseek`，基于 dev `748a085`）
- 写于 2026-09-22 CST。下面所有「已验证」都指 **candidate 独立副本**，不是共享 VLab。按
  [[isolated-proves-mechanism-not-benefit]]：candidate 证明机制成立，共享 VLab / 飞书上还要再验一遍。

## 1. 目标

Tianyi 要在 V / VLab 上把 **Codex 当主力编程 harness、模型用 DeepSeek V4.1 Flash**，用户在同一个对话里
发 `/vds` 切过去，发 `/vcodex`（GPT-5.6-Sol on Codex）、`/ds-flash`（DeepSeek on OpenClaw 原生）切回来。

## 2. 结论（candidate 已验证）

`/vds` = `deepseek/deepseek-flash` + `agentRuntime.id=codex`，给 `@openclaw/codex@2026.9.1` 打 4 处补丁后：

| 切换 | 结果 |
|---|---|
| `/vds` 写代码（改文件、跑测试） | ✅ |
| `/vds` → `ds-flash` → `/vds` | ✅ 上下文接得上 |
| `/vcodex` → `/vds` | ✅ 不读文件答对上一轮内容 |
| `/vds` → `/vcodex` | ✅ GPT 那轮零工具调用，答对 DeepSeek 轮写下的内容 |

判断「真走了 Codex」**不能只看回复**：要看 Codex home 的 `sessions/**/rollout-*.jsonl`，
`session_meta.model_provider=deepseek`、`turn_context.model=deepseek-flash`。补丁 3 没打时，运行会
**静默退回 openclaw 原生 harness**，回复照样正常，结果里只有 `runner: embedded`。

为什么 `/vds` → `/vcodex` 不再报错：DeepSeek 线程关了 code mode（补丁 4），GPT 线程开着，线程配置指纹不同，
插件每次跨切都新开 Codex 线程，并用 OpenClaw 会话记录做连续性投影（`applyFreshThreadContinuityProjection`），
GPT 读不到 DeepSeek 的明文 reasoning。不打补丁 4 时同线程续用，OpenAI 会报
`invalid_request_error [array_above_max_length] input[N].content`。

## 3. 本分支里的文件

| 文件 | 用途 |
|---|---|
| `lab/release-files/vds-codex-deepseek/patch-codex-plugin.mjs` | **发版用**。给已安装的 `@openclaw/codex@2026.9.1` 打 4 处补丁；幂等、每个锚点必须恰好匹配一次；`--check` 只检查不写 |
| `lab/candidate/vds-codex-switch.mjs` + `.plan.json` | candidate 端到端切换测试（A/B/C 三个会话）。`VDS_DIAG=1`（`vds-codex-diag.plan.json`）只做诊断 |
| `lab/candidate/vds-db-diag.mjs` + plan、`vds-inspect.plan.json` | 诊断工具：看 candidate Gateway 打开了哪些 sqlite、配置/环境里是否残留共享路径 |
| `lab/release-files/vds-switch-guard/` | 拦截 `/vds`→`/vcodex` 的插件 + 单测。**不要部署**：补丁 4 之后这条路径能用，插件反而会挡住它 |

candidate 回执在 `~/v-worktrees/vds-codex-deepseek/tmp/candidate/`（gitignored）。最后一次全绿：
`candidate-f017cec3-0806-4259-8744-772a9fea5005.json`。

## 4. 4 处补丁（`patch-codex-plugin.mjs` 里有原文锚点）

1. `harness-*.js`：`DEFAULT_CODEX_HARNESS_PROVIDER_IDS` 加 `"deepseek"`（白名单写死，不在 configSchema 里）。
2. 同文件：`provider route compatibility with Codex is not declared` 这条对 deepseek 放行。
3. 同文件：`requestTransportOverrides === "present"` 对 deepseek 放行。OpenClaw 的 deepseek provider 带
   `baseUrl` + `api=openai-completions`；Codex 不复现这条传输，它走自己 config.toml 的 `[model_providers.deepseek]`。
4. `run-attempt-*.js`：provider 为 deepseek 时 `nativeCodeModeEnabled=false`。code mode 给模型一个自定义
   `exec` 工具，DeepSeek 报 `Unsupported custom tool: 'exec'. Only 'apply_patch' is supported.`

## 5. 共享 VLab 当前状态（2026-09-22 核对）

- lease 空；current release `feishu-secret-entry-v1`；pending 无；configSha `861244ae…`。**发版前重新 `status`。**
- **共享 VLab 的 codex harness 一直不可用**：`@openclaw/codex` 经 `plugins.load.paths` 加载
  （`runtime/npm/projects/openclaw-codex-…`），`origin=config`，不是 registry-owned。Gateway 每次启动都报
  `native compaction requires the registry-owned "codex" harness` 和
  `only bundled plugins can claim reserved command ownership: codex`，`agentHarnessIds=[]`。
  所以现在 VLab 上 makaron 的 `/vcodex`（已配 `agentRuntime=codex`）也跑不起来。生产 V 是 npm 正式安装，无此告警。
- makaron `agents.entries.makaron.models["openai/gpt-5.6-sol"]` = `{alias:"vcodex", agentRuntime:{id:"codex"}}`（与生产一致）。
- `agents.defaults.models["deepseek/deepseek-flash"]` = `{alias:"DeepSeek V4.1 Flash", agentRuntime:{id:"vlab-worker"}}`；不在 `modelPolicy.allow` 里。
- `state/agents/makaron/agent/codex-home` 不存在（Codex 在共享 VLab 上从没成功跑过）。
- codex 插件没设 `appServer.homeScope` → 默认 `agent`，即 `<agentDir>/codex-home`，**不读** env `CODEX_HOME`。
- VLab 上没有任何 OpenAI/Azure key，Gateway 的 Codex home 里也没有 Codex 登录。

## 6. 合入步骤（建议顺序；都需要 lease，都会改共享配置/状态）

合入 dev 的决定权在 Tianyi（`lab/README.md`）。以下假设已批准。

1. `vlab.mjs status` → `lease --owner <owner>`。备份 `state/shared-vlab-20260909-v3/openclaw.json`
   与 `state/npm/`，恢复一律 `cp -a`，不要重新序列化 JSON（`configSha` 会变）。
2. **codex 插件改为正式安装**（以 `lab-db91-parity` 身份、共享实例的 env）：
   - 从 `plugins.load.paths` 删掉 `…/@openclaw/codex` 那一项。
   - `openclaw plugins install @openclaw/codex@2026.9.1 --pin --force --accept-capabilities --acknowledge-install-policy-warning`
     → 装到 `state/npm/projects/openclaw-codex-…`，`origin=global`、`trustedOfficialInstall=true`。
   - **不要从本地路径装**：安全扫描会因包内 `node_modules/openclaw` 软链接拒绝。
3. `node patch-codex-plugin.mjs <state>/npm/projects/openclaw-codex-*/node_modules/@openclaw/codex --check`，再去掉 `--check` 执行。
4. 配置（`openclaw config set … --strict-json --merge`，改前 `--dry-run` 过 schema）：
   - `agents.defaults.models["deepseek/deepseek-flash"]` 和 `agents.entries.makaron.models["deepseek/deepseek-flash"]`
     = `{"alias":"vds","agentRuntime":{"id":"codex"},"params":{"thinking":"high"}}`。
     注意这会把原来 defaults 里这个模型的 `vlab-worker` 映射和别名 `DeepSeek V4.1 Flash` 替换掉；`/ds-flash`
     是 `deepseek/deepseek-v4-flash`，不受影响。
   - `agents.defaults.modelPolicy.allow` 加 `deepseek/deepseek-flash`。
5. **Codex home 里加 DeepSeek provider**（见 §7 待定项 1）：
   ```toml
   [model_providers.deepseek]
   name = "DeepSeek"
   base_url = "https://api.deepseek.com/v1"
   wire_api = "responses"
   env_key = "DEEPSEEK_API_KEY"
   ```
   `DEEPSEEK_API_KEY` 已在 Gateway env（`EnvironmentFile=…/secrets.env`）。
6. 共享 VLab `reload=off`：以上改完需要**重启一次 Gateway**（`deploy` 或受控 restart）。
7. 验证（见 §8），`accept`，释放 lease。

## 7. 待定项（candidate 和共享 VLab 的差异，发版前要拍板或实测）

1. **Codex home 用哪个**。candidate 用的是 `appServer.homeScope="user"` + env `CODEX_HOME=/srv/vlab-production-mirror/labs/vds-codex-home`
   （里面有 root 的 ChatGPT Pro 登录、DeepSeek provider、自定义模型目录）。共享 VLab 默认是
   `state/agents/makaron/agent/codex-home`（不存在）。两条路：
   - 保持 agent scope：把上面 toml 写进 `state/agents/makaron/agent/codex-home/config.toml`；要确认插件启动时不覆盖它。
   - 改 `homeScope="user"`：服务 env 已有 `CODEX_HOME=/srv/…/db91-parity/codex`（无登录），provider 写到那里。
2. **没有 OpenAI 登录时 `/vds` 能不能跑**：candidate 里 Codex home 有 ChatGPT 登录，所以这点**没验证过**。
   DeepSeek provider 用 `env_key`，理论上不需要 OpenAI 登录；若 app-server 因无登录拒绝，需要给该 home 一份
   Codex 登录（只能人工 `codex login`，或从 root 交接，见 §9）。`/vcodex` 要在 VLab 上可用则必须有登录。
3. **自定义模型目录要不要**。candidate 的 home 配了 `model_catalog_json`（GPT 最新条目 + `deepseek/deepseek-flash`
   + 隐藏的 `deepseek-flash`）。那是早先「伪装成 openai 模型」方案的产物；方案 C 下它只给 `deepseek-flash`
   提供元数据。补丁 4 关掉 code mode 后可能已不需要（无目录时 Codex 会警告
   `Model metadata for deepseek-flash not found` 但能跑）。**建议不配**，省掉一份要随 OpenAI 新模型维护的文件；
   合入前用 candidate 去掉目录跑一次确认。如果要配：`model_catalog_json` 会**整体替换**内置目录，必须带上最新 GPT
   条目；`apply_patch_tool_type` 只接受 `freeform`，写别的会让整个目录解析失败、GPT 一起挂。
4. **`discovery.timeoutMs`**：candidate 设过 30000，是为「伪装」方案做的，方案 C 用不上，不必带入。
5. **补丁怎么纳入受控发布**：正式安装后插件在 `state/npm/projects/…`，不在 `runtime/`；现有 plan 的 target 都是
   `openclaw/dist/…`、`production-worker/…`。需要确认 state 下的改动是否进 release fingerprint、该走哪种记录方式。
   另外 `openclaw plugins install/update` 或 doctor 修复会把补丁冲掉，发版后要用 `--check` 复核。

## 8. 验证清单（共享 VLab）

- Gateway 启动日志不再出现 `registry-owned "codex" harness` / `reserved command ownership: codex`；
  `openclaw plugins inspect codex --runtime --json` 里 `agentHarnessIds` 含 `codex`。
- `patch-codex-plugin.mjs … --check` 四项都是 `already`。
- 用 `vlab-dev-*` 会话、`deliver:false` 跑一轮 `--model deepseek/deepseek-flash`，然后看 Codex home 的最新
  rollout：`model_provider=deepseek`、`model=deepseek-flash`。**只看回复不算。**
- 按 `lab/candidate/vds-codex-switch.mjs` 的 A/B/C 三组复跑切换（需要 `/vcodex` 有 Codex 登录才能测 GPT 方向）。
- **飞书真实发 `/vds`**：CLI `openclaw agent --message "/vds"` 不解析别名，文字会交给 agent，agent 会自己去
  「修配置」。别名切换只在渠道入口生效，必须在飞书测（需要 Tianyi 授权发消息）。
- 共享 VLab 只能证伪不能证真（4 核、CPU 配额封顶、空载）；耗时不作为结论。

## 9. 回滚

- 配置：`cp -a` 备份的 `openclaw.json`（不要重序列化）。
- 插件：删 `state/npm/projects/openclaw-codex-*` 的安装记录与目录，把 `…/@openclaw/codex` 加回 `plugins.load.paths`，重启。
  回到「codex harness 不可用」的原状。
- Codex home：删掉加进去的 `[model_providers.deepseek]` 段。

## 10. 一定要避开的坑（都真实发生过）

- **candidate 里别整份合并共享 `secrets.env`**：它带 `OPENCLAW_DB91_INTEGRITY_STATE_ROOT=<共享 state>`，会让副本
  Gateway 的启动预检只读扫描共享 agent 库（makaron 7.1G），并在共享 `state/.db91-integrity/` 留一个空 epoch 目录
  （2026-09-22 17:48 服务器时间那个就是这样来的，未清理）。只取需要的 key。
- candidate Gateway 要以 `lab-db91-parity` 跑（root 跑会把 uid 977 的插件全部判为 suspicious ownership），并把
  `TMPDIR`、`XDG_CACHE_HOME`、`npm_config_cache` 指到 candidate 目录，否则日志写进共享
  `tmp/openclaw-977/openclaw-<date>.log`、npm 修复去碰共享 `cache/npm`。
- candidate 里的 agent 和共享 VLab 是同一个系统用户，能改共享文件。别让它处理 `/vds` 这类它会误解成「帮我改配置」的文字。
- Codex 在 VLab 上的 bwrap 沙箱对 lab 用户起不来（`loopback: Failed RTM_NEWADDR`）；Gateway 里 codex 是
  `danger-full-access`，不受影响。直接跑 `codex exec` 做实验时注意。
- OpenClaw 只为 agent **默认模型**的 runtime 加载 harness 模型目录（`augmentModelCatalogWithAgentHarness`），
  所以「Codex 目录里的自定义模型」在 makaron 上永远是 `Unknown model`。这是放弃「伪装成 openai 模型」、改走方案 C 的原因。

## 11. 本次实验留下的状态（需要收尾）

- `/root/.codex/config.toml` 末尾追加了 `[model_providers.deepseek]`，备份 `config.toml.bak-vds-20260922-174342`。
- `/srv/vlab-production-mirror/labs/vds-codex-home/`：candidate 用的 Codex home，含一份从 `/root/.codex/auth.json`
  **交接**来的 ChatGPT Pro 登录（两份哈希一致 `66352f14…`，测试期间未刷新）。OpenAI refresh token 用一次换一次，
  **两份不能同时被使用**；实验结束应只保留一份（删 candidate 那份，或把刷新后的那份拷回 root）。
- `/tmp/vds-probe/`、`/root/vds-lab/`：临时实验目录，可删。

## 12. 相关记忆

`~/.claude/projects/-Users-tianyicai-v-openclaw-platform/memory/`：
`codex-deepseek-vds.md`（完整过程）、`vlab-shared-instance-traps.md`（secrets.env / 身份 / 目录坑）、
`v-model-alias-harnesses.md`（`/vcodex` 要看 agent 级配置）。
