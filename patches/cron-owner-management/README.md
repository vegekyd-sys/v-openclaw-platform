# Owner 跨群管理 Cron（OpenClaw 2026.9.1 候选补丁）

2026-09-10：仅在 VLab 机器的隔离代码副本验收。未合入主分支、未改共享 VLab、未部署生产。用户要求后续明确合入，再进入共享 VLab 验收，最后决定上线。

## 修复内容

9.1 把任务的执行归属（sessionKey/accountId）同时用于交互管理权限。结果是同一位 owner 换群后无法管理任务；没有 owner 的旧任务修改 toolsAllow 时会失败。

本补丁给显式配置的 agent 增加独立的管理 owner：使用 Gateway 原始消息中的已认证 senderId、channel、accountId，以及原生 senderIsOwner 标志。群 session 不再是管理权限的唯一依据。身份进入现有签名和运行生命周期校验；模型参数及 Worker 请求不能自报 owner。

- 在受管理 agent 下，只有配置的 owner 可交互创建、查看、修改、停用和删除任务。其他用户在原创建群中也没有管理权限。
- 这是一位系统 owner 管理该 agent 的命名空间，**不是多租户的逐任务创建者 ACL**。仅适用于 V 这种 owner 管理的助手；不得直接套用于多人各自拥有私有任务的 agent。
- 跨群修改保留原执行 owner 和原 account policy。历史缺失 owner 的任务在正常原生 update 中补齐，仍经过参数校验、锁内复验和持久化。
- 不允许跨 account、channel 或 agent，不扩大已有 toolsAllow。原生执行权限、审批和 sandbox 仍然有效。若要扩大工具能力，需要单独 operator 授权。
- 原生 operator 管理面不变；未配置的 agent 保持上游行为。原生签名的当前任务自删能力保留。
- 配置缺失/无效时拒绝访问；权限与活跃运行在提交前重新检查。

## 配置（合入后再由集成负责人部署）

由 Gateway 进程环境提供 `OPENCLAW_CRON_OWNER_POLICY=/absolute/operator-owned/cron-owner-policy.json`。文件必须由运维维护，不允许模型或 Worker 写入。例如：

```json
{
  "version": 1,
  "agents": {
    "makaron": {
      "owners": [
        {"version": 1, "channel": "feishu", "accountId": "default", "senderId": "REPLACE_WITH_VERIFIED_OWNER_ID"}
      ]
    }
  }
}
```

实际 senderId 应从可信消息入口与既有 owner 配置核对，不从聊天正文提取。还需确认原始 turn 的 `senderIsOwner=true`。空 owners 数组撤销该 agent 的交互管理权限；删除 agent 条目会回到上游策略，不等价于撤权。

## 验证证据

隔离副本来自当时共享 VLab 的 2026.9.1 代码；只复制可达模块（约 43 MiB），复用不可变 baseline 的 npm 依赖。没有建立 Gateway 实例、监听端口、接入机器人或调用模型。以非 root 用户运行，文件系统只读（仅测试结果目录可写），网络禁用，CPU 50%、内存 1 GiB。

- 原始代码：复现旧 ownerless 任务修改 toolsAllow 失败，以及同 owner 跨群修改失败。
- 修复代码：原生 Cron tool → 签名身份 → Gateway handlers → CronService/SQLite，通过跨群创建/改时间/改内容/停用/删除；拒绝非 owner；拒绝伪造 owner 参数和扩大 toolsAllow。
- 原生 Gateway host capability：身份取自原始 admission，忽略 Worker 伪造身份；签名被篡改和已关闭能力均拒绝。
- 撤权发生在预检与锁内提交之间时拒绝修改；已结束运行不能重放。新建 CronService 从磁盘读取验证持久化结果。
- 单元及安装测试 9 项通过：策略边界、缺失配置、撤权、安装幂等性、回滚 checksum 与精确恢复、版本不匹配拒绝。

`acceptance/vlab-patch-manifest.json` 记录已测基线及产物 SHA-256。测试中的用户、群和任务均为合成数据。飞书 receive → Worker dispatch → visible reply 与实际业务定时执行尚未验收；应在共享 VLab 获得 lease 后完成。Universal Memory CLI 权限是独立问题，本补丁不迁移/运行同步业务。

## 重现和合入

1. 在新的小 worktree 保存独立补丁；不复制生产 config、state、凭据、会话和数据库。
2. 用 `scripts/prepare-cron-owner-repro.py` 制作独立代码副本。必须保留至少 3 GiB 可用磁盘，不写共享 runtime，不使用指向可变代码的 hardlink。
3. 在断网、限资源沙箱中运行 `tests/cron-owner-management/native-repro.mjs CORE FRESH_STATE baseline`，再在副本执行下面的 apply，使用另一空目录运行 `fixed`。
4. `CRON_PATCH_BASELINE=/code-only/unpatched-fixture node --test tests/cron-owner-management/runtime.test.mjs tests/cron-owner-management/patcher.test.mjs`。
5. 明确获准合入后再合并候选提交；共享 VLab 集成前通过 labctl 获取 lease 并交接。核对当时基线，若 SHA/结构变化则重建候选和重测，不覆盖其他任务改动。部署配置后真实验证 owner 在 A/B/C 群管理和非 owner 拒绝。
6. 生产另行决定；使用同一已验收产物、备份与回滚，且仅通过 Tailscale 连接 V。

```sh
node scripts/patch-openclaw91-cron-owner-management.mjs /isolated/core --check
node scripts/patch-openclaw91-cron-owner-management.mjs /isolated/core --apply
node scripts/patch-openclaw91-cron-owner-management.mjs /isolated/core --rollback
```

安装前先完成全部 anchor/语法检查；同一版本重复 apply 为 no-op。回滚仅在所有产物与安装 manifest 一致时执行，避免覆盖后续修改。备份目录保留供审计，回滚后重新安装前应由负责人归档该备份。生产集成仍需遵守现有发布流程，不直接对正在运行的 bundle 热改。
