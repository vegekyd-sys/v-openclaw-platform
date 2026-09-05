# V 9.1 集成收口 — 2026-09-05

协调任务：`01a06fbe-7654-7331-8d6e-73a8cd2dcd7e`。
用户授权统筹完成以下四项，生产变更统一由协调任务实施。
其他任务可以独立实验、只读生产诊断，不自行改生产配置或重启。

| 工作 | 负责人任务 | 当前证据 / 剩余门槛 |
| --- | --- | --- |
| GPT-6 Astra | `01a06fb6-6216-7c63-aadf-18a0101567bc` | 已部署并通过生产双 runtime 工具/回复验收，默认模型保持不变 |
| Worktree + 运行实例隔离 | 同上 | labctl 已在 VLab 安装；两个真实实例的 PID/UID/状态/代码隔离及原生 Worker 工具验收通过 |
| Control UI 公网 HTTPS | `01a06fc2-a70a-73b1-bd17-bbce0063f899` | 已部署；公网大历史、真实工具回复、切会话、刷新免重复登录通过；保留认证与设备配对 |
| V Browser 恢复 | 协调任务 | 独立 Browser 服务迁到9.1；Lab 原生读写及生产真实 Mac 页面快照/DOM/截图/释放通过 |

## 环境分配

- Astra/隔离实例：26100 起、每实例间隔20，labctl owner/commit 必填。
- Control UI QA：25993 Gateway、25994严格代理、25995仅本机模拟入口。
- Browser：独立代码 worktree `/Users/tianyicai/v-browser-openclaw91`；既有
  Lab Browser 24793、Broker 24890/24891 与专属测试 Chrome，避免另起大 Gateway。
- 24993 是共享集成验收，只有持 integration lease 的任务可写/重启。
- Lab 4核15GB，个人实例最多两个；UI额外QA Max2G/CPU100%；启动前核查总预算。
- 同一 Feishu/WeCom 凭证不能连接多个 Gateway。

## 发布原则

1. 不重复已经有可靠证据的验收，但跨版本协议/实际消息链路必须测。
2. 每项交付精确 commit、运行版本、配置增量、回滚方法；不能整份覆盖主配置。
3. Browser 专用服务先修复，主 Gateway 的变更合并安排一次安全窗口。
4. 公网入口保留认证、TLS和设备配对；不开放 CDP、长期 token 或调试端口。
5. 阶段区分：代码完成、Lab验收、生产部署、生产验收，四者不能混写。

## Worker 候选不混入本次其他发布

`0.2.10-rc.1` 的 native capabilities / 普通参数透传已在Lab验证语音；
Feishu `/stop` Lab验收未通过。用户确认生产 `/stop` 可用，应先对照环境差异，
不能把该结果直接归因为生产Worker缺陷。本次Astra/UI/Browser发布不能顺手
带入此未完成候选。生产基线 Worker 为 bb69480-transcript-v1（需上线时再核实）。

## 生产验收与时间线（Asia/Shanghai）

- 14:34:32 仅重启 Browser Gateway/Broker，主 Gateway 未重启。原 Browser 服务独立指向7.1是遗漏原因；主 Gateway 与主 CLI 本来已9.1。
- 14:44:19 主 Gateway 安全窗口停服，14:44:22 启动，14:45:56 ready。冷启动约94秒，不将这段中断描述为无感上线。
- Astra 的两个独立测试 Session：`astra-prod-smoke-1788590853514-d740eb61`（makaron/vlab-worker）和 `astra-prod-smoke-1788590882329-9d365f78`（v-codex/codex）。各实际运行一次 printf，history 中都有 ASTRA_PROD_TOOL_OK 与 ASTRA_PROD_REPLY_OK，模型 openai/gpt-6-astra，无fallback。
- 测试仅授予 operator.read/write，不能使用 admin Session patch 改模型：9.1 admin 模型选择可能持久化默认值。主配置及 Worker overlay 的所有默认模型与发布前逐项比对一致。
- 生产 Browser 经主 Gateway 原生 browser.request 读取 Mac 授权测试页、AI snapshot、DOM title/readyState、截图均成功，随后 activeRoutes=0、pendingCommands={}。截图 `/home/openclaw/.openclaw/media/browser/dfee0617-d3e9-4414-a407-e981d38281e6.png`。
- 14:48:03–14:50:55 公网 UI WebSocket 持续连接至主动刷新；207k上下文主DM历史可读，14:48:55发送工具测试，14:49:13可见 V_HTTPS_REPLY_OK；91k群历史切换成功，刷新后无再次认证且订阅177ms。详见 Control UI 专项报告。
- 收尾 health：ok=true、plugins.errors=[]、Feishu connected=true，Worker 0.2.9-rc.2 / maxActiveSessions=45、pending=0、queued=0，NRestarts=0。Event Loop degraded=false、P99=26.9ms、ELU=0.123；MemoryCurrent约6.3GB。它们是采样值，不是全天峰值。

## 使用与版本

- Astra 是新增可选 `openai/gpt-6-astra`，别名 `astra`，未全局切换。普通 Agent 外层 vlab-worker / Worker 内 openclaw；VCodex 仍 codex。Codex 插件专用二进制0.153.4，不覆盖系统CLI。
- 公网入口：<https://openclaw.tianyi.live/n6tfdf/>。仍需原生 token/设备配对，未开放匿名 RPC；CDP/管理端口没有新增公网暴露。
- 实验遵循 `lab/README.md`：一个任务一个 worktree，一个独立 Gateway 实例；共享机器人真实渠道验收需唯一 integration lease。当前已验证运维入口为本机 vlab91 SSH；生产 V 用户没有名为 vlab 的 SSH 别名，不能告诉 V 直接执行 `ssh vlab`。本轮未分发新的管理员凭据。
- Browser 发布目录 `/srv/vlab-browser/releases/native-browser91-20260905`，核心为独立9.1副本，Broker使用官方9.1 relay auth；原有设备配对与授权范围保留。

## 回滚与下一次升级检查

- Astra 备份 `/home/openclaw/.openclaw/backups/astra-ui-20260905`；按 cli、models、code 三个 scoped rollback 脚本逆序恢复，随后统一安排主 Gateway 重启。CAS 校验拒绝覆盖并行修改。不可整份回灌旧 openclaw.json。
- UI 备份 `/home/openclaw/.openclaw/backups/control-ui-https-20260905`；`sudo node /tmp/deploy-control-ui-https.mjs rollback` 仅恢复本次代理字段、默认 ingress 和 nginx stanza；主 Gateway 配置生效仍需协调重启。回滚会退回原入口问题，不是自动获得可用旧公网 UI。
- Browser：`sudo node /tmp/v-browser91-deploy.mjs rollback` 只恢复 Browser/Broker 的原 systemd 启动配置并重启二者，无需重启主 Gateway；备份位于上述 Browser release 的 backups/。
- 下次升级必须分别记录并验收：主 Gateway 实际 ExecStart/package、默认 shell CLI、Worker overlay 与运行 release、Codex 插件指定 CLI、Browser 专用 Gateway/Broker/relay auth、各 systemd ExecStartPre 补丁、nginx/Cloudflare ingress。仅 `openclaw --version` 不能代表全系统升级完成。
- 每项记录精确代码 hash 和真实路径证据；代码集成分支与已部署运行版本分开记录，不宣称未推送的 Git main 已合入。

## 保留观察项

首次对既有 docs.openclaw.ai 标签 attach 曾30秒超时；新建独立测试页通过，尚不能证明所有旧标签无陈旧连接问题。没有为此清理用户业务标签或扩大浏览器权限。
公网大页面曾发生一次鼠标工具等待超时但实际切换成功；短时重连验收通过不等于长期稳定 SLA。冷启动和大页面渲染仍可后续优化。
Worker 0.2.10-rc.1 语音/取消候选保持 Lab-only，未混入本次四项发布，不能把本次成功视为该候选已验收。
