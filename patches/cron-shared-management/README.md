# 员工共享管理 Cron（OpenClaw 2026.9.1 候选补丁）

2026-09-10 用户明确：V 是企业级 AI，员工可以管理所有共享 Cron，不按创建人或管理员名单区分。本候选替代此前误设的 owner 专属方案。仅在 VLab 机器的隔离副本测试，未合入主分支、共享 VLab 或生产。

## 行为

沿用 V 原有消息入口的访问控制。通过入口准入的员工可在不同群管理同一 agent 的所有共享任务：甲创建、乙修改、丙停用，任何员工均可查看和删除。**不要求 `senderIsOwner=true`，不维护个人 owner 白名单，不以任务创建者或创建群限制管理。**

Gateway 从原始消息提取 senderId、channel、accountId，使用现有签名及活跃运行校验传递身份；模型正文、工具参数和 Worker 请求不能自报身份。补丁不添加员工登录或准入流程，也不会放宽既有消息入口的 allowlist/配对/群访问规则。是否为获准使用 V 的员工由现有入口负责，而非本模块重新查员工目录。

执行归属和管理权限分开：修改共享任务保留原执行 owner/session/account 及其执行策略。历史缺失 owner 的任务在原生 update 的预检、锁内校验及正常持久化中补齐，不手改数据库。不扩大已有工具执行上限，不改变审批或 sandbox。其他 agent、原生 operator shell/监控任务、定时任务及子代理的自动运行不因此获得共享管理权；原生签名的当前任务自删能力保留。

## 配置

由 Gateway 环境设置 `OPENCLAW_CRON_SHARED_POLICY=/absolute/operator-owned/cron-shared-policy.json`：

```json
{
  "version": 1,
  "agents": {
    "makaron": { "mode": "shared", "enabled": true }
  }
}
```

配置只指定哪些 agent 使用共享管理，无个人名单。文件由运维管理，模型及 Worker 不可写。`enabled:false` 关闭该 agent 的共享交互管理；未配置的 agent 保持上游行为（删除条目不等于关闭访问）。启用环境变量后，文件缺失/格式错误会拒绝请求。锁内提交前复验配置及运行有效性。

## 验证与边界

使用 VLab 原有 2026.9.1 的隔离代码副本（约 43 MiB），复用不可变 baseline 的 npm 依赖；没有新建 Gateway、监听端口、接入机器人或调用模型。测试以非 root 身份、只读文件系统、单独可写结果目录、禁网、CPU 50%、内存 1 GiB 运行。

原始代码已复现：旧任务修改 toolsAllow 的 owner 不匹配报错，以及跨群管理失败。新版验收覆盖：

- 三名普通员工（`senderIsOwner:false`）跨群创建、查看、改时间、改内容、停用、删除同一共享任务。
- 旧 ownerless 任务正常更新；新 CronService 从磁盘重新读取验证执行归属和数据。
- 没有可信 sender 的请求被拒绝；Worker 伪造来源、签名篡改、已结束运行重放被拒绝。
- 预检与提交之间关闭共享权限时拒绝修改。
- 单元与安装测试验证跨来源管理、定时/子代理限制、版本检查、幂等安装、精确回滚和保护后续修改。

`acceptance/` 保存合成场景结果和已测产物 SHA-256；不包含账号、凭据、生产状态或数据库。真实飞书 receive → dispatch → visible reply 和业务定时执行仍需合入共享 VLab 后验收。Universal Memory CLI 权限是独立问题，本候选不迁移或运行该业务。

## 重现、合入与回滚

使用独立 worktree 保存补丁。`scripts/prepare-cron-owner-repro.py` 只复制代码到新目录，不复制 config/state/凭据，保留至少 3 GiB 可用磁盘。脚本保留历史文件名，与权限模型无关。

```sh
node tests/cron-shared-management/native-repro.mjs /isolated/core /fresh/baseline-state baseline
node scripts/patch-openclaw91-cron-shared-management.mjs /isolated/core --check
node scripts/patch-openclaw91-cron-shared-management.mjs /isolated/core --apply
node tests/cron-shared-management/native-repro.mjs /isolated/core /fresh/fixed-state fixed
CRON_PATCH_BASELINE=/code-only/unpatched-fixture node --test tests/cron-shared-management/runtime.test.mjs tests/cron-shared-management/patcher.test.mjs
node scripts/patch-openclaw91-cron-shared-management.mjs /isolated/core --rollback
```

原 owner 专属候选不得与此补丁叠加：先按旧 manifest 回滚，再安装新版。安装前检查全部 anchor 与语法；重复 apply 为 no-op。回滚前核对每个文件 SHA，不覆盖后续任务修改；备份保留，回滚后重新安装须归档旧备份。

用户明确要求后才合并候选分支。共享 VLab 集成前通过 labctl 获取 lease 并交接；核对当时基线，变化则重建并重测，不覆盖其他任务。部署后用不同普通员工在不同群做真实验收，再决定生产发布。生产仅经 Tailscale，使用同一已验收产物并保留回滚。
