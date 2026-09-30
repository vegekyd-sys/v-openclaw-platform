# /vcodex → GPT-6.1 Sol 候选

目标：将 `/vcodex` 接到 `openai/gpt-6.1-sol`，保持 Codex 订阅运行时和 `medium` thinking。生产旧 `gpt-6-sol` 改用 `/vcodex60`；共享 VLab 的旧 5.6 别名改用 `/vcodex56`。不改变默认模型、Luna、Astra、DeepSeek、渠道或机器人权限。

官方模型元数据来源：https://developers.openai.com/api/docs/models/gpt-6.1-sol 。旧 9.1 运行时增加双路由模型标识、订阅 forward-compatible resolver 和推理档位。该模型只接受 low/medium/high/xhigh/max；off/minimal 映射 low，并过滤发现结果中的不支持档位。

**还需要 Codex 0.159.2。** V 的 0.156.1、VLab 的 0.156.0 均早于 Sol 6.1；实际候选请求在 0.156.0 下返回 `The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.`，升级私有客户端后真实模型与工具测试成功。官方 2026-09-29 的 0.159.1 首次把 Sol 6.1 加入内置模型目录，0.159.2 是本次验证的精确版本：https://learn.chatgpt.com/docs/changelog 。`codex-client.json` 固定 wrapper 和 Linux x64 包的 npm integrity。客户端安装在新版本目录，旧二进制保留回退。

## 产物

`release.plan.json` 声明两个精确 runtime 文件及修改前 hash；提交中的 JS 就是待部署文件。`patch.mjs` 可在独立目录重建，带锚点断言和幂等检查，不能用于线上热改。

`config.mjs` 是独立配置迁移工具，适用于 Gateway 和 Worker 的各自配置。继承已有 Sol 参数，保留其他字段；拒绝未知 `/vcodex` 路由、重复回退别名及未获模型策略允许的模型。配置只在服务器处理，不进入 Git。

```sh
node config.mjs /absolute/openclaw.json  # 只显示别名计划
node config.mjs /absolute/openclaw.json --codex-bin /absolute/codex-0.159.2/vendor/bin/codex --apply
```

配置迁移属于单独的配置步骤，不混进代码 package。实际 Gateway 配置路径须从运行进程确认，不能猜 `state/openclaw.json`；共享 VLab 当前实际加载 `state/shared-vlab-20260909-v3/openclaw.json`。生产 Worker 配置也需迁移，不能用 Gateway 配置覆盖 Worker 配置。

`--apply` 强制传入且实测检查 0.159.2 的二进制；有 Codex 插件配置时只改 `appServer.command`，保留 mode、serviceTier、sandbox、homeScope 与其他插件选项。没有该插件配置的 Worker 不新增插件配置。

## 候选验证

```sh
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner TASK_ID --plan lab/candidate/vcodex-sol61.plan.json
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner TASK_ID --plan lab/candidate/vcodex-sol61-live.plan.json
```

第一项验证实际 runtime 模块的订阅路由、能力参数、推理过滤、旧模型路由、补丁幂等，以及真实配置副本的别名迁移/保留/冲突拒绝和客户端命令迁移。第二项在私有目录安装精确 Codex 0.159.2，注册原生 Codex harness 并复用当前已打补丁的 harness 代码；只把服务器 agent DB 的 auth 表复制到私有空库，复用登录，不复制 7 GB 会话库。调用实际候选 OpenClaw CLI 执行 Sol 6.1 的文件写入、读回和回复，检查模型/provider 与文件内容，并回归旧 Sol/Astra/VDS。登录与会话不回传、不提交；候选工具回收测试目录。

2026-09-30 候选实测：

- `candidate-4af9966f-795c-4c6a-9307-c842e1e5fa93`：最终 runtime/配置候选测试 2/2 通过，服务器 5.616 秒、客户端总计 7.724 秒。
- `candidate-e32d4a3d-b7f6-473a-85b5-ea7b39b99c6a`：通过；服务器 113.747 秒、客户端总计 115.837 秒，包含安装客户端、插件、私有状态初始化和四次真实模型调用。`gpt-6.1-sol / openai` 写入并读回 `SOL61_TOOL_1790733680826`，回复同一标记；`gpt-6-sol / openai`、`gpt-6-astra / openai`、`deepseek-flash / deepseek` 均返回对应回归标记。
- Codex Linux x64 二进制 SHA256：`1748767b230ebfc3d4ab7e4e254920d0c0ad9691fd8c11f190e7d44511a4a92e`。
- 运行时基线 `feishu-ask-user-inline-v4` / `104e6efcf47bda3d96e7cc329a1a4400b01d46e3ea579d00a30372130d22ef39`；共享进程前后 PID 都为 `808138`，receipt 的 `sharedUnchanged=true`。
- 两个修改后 runtime 文件 SHA256：contract `efb465d2bc7f474f7173bfbc6586d5a767e8970b7aa4031e6358543cb6f0384e`，provider `46bc8cc01badf720ab5d3443bf66cc2885b998f90a072b3588d6694566935df2`。已核对产物与补丁重建结果逐字节一致，并通过 `node --check`。

结果仅证明独立候选 CLI 的真实模型/工具路径。共享 Gateway、飞书接收和可见卡片、生产 V 均未部署或验收。

## 合入与上线

当前为候选，需 Tianyi 明确批准才合入 dev。之后获取空闲 integration lease，基于当前 release 重新核对 before hashes，package/stage/deploy；在 lease 内将 `@openai/codex@0.159.2` 安装到新的 tools 版本目录，核对 npm integrity 与候选二进制 SHA256，再迁移 Gateway/Worker 配置并协调重启。按新版别名做真实飞书 receive → dispatch → visible reply 验收，同时核对模型 `gpt-6.1-sol`、provider `openai`、runtime `codex`。检查生产 `/vcodex60` 回退入口及其他别名保留。

通过后按授权使用 `scripts/promote-to-v.mjs` 部署同一精确产物；在生产新版本目录独立安装并核对相同 Codex 0.159.2 二进制，迁移生产 Gateway/Worker 配置，等待业务 drain 后协调重启，再做生产真实消息验收及 align。生产只通过 `ssh v`。不能把候选 CLI 回复写成共享飞书或生产验收。

回退：恢复本次配置备份（确认无并发配置修改），重新指向保留的旧 Codex 二进制，通过受控 rollback/生产 undo 恢复两个代码文件，协调重启并核对别名、模型回复及 parity。备份位于服务器，不能提交 Git。
