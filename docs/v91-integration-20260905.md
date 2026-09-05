# V 9.1 集成收口 — 2026-09-05

协调任务：`01a06fbe-7654-7331-8d6e-73a8cd2dcd7e`。
用户授权统筹完成以下四项，生产变更统一由协调任务实施。
其他任务可以独立实验、只读生产诊断，不自行改生产配置或重启。

| 工作 | 负责人任务 | 当前证据 / 剩余门槛 |
| --- | --- | --- |
| GPT-6 Astra | `01a06fb6-6216-7c63-aadf-18a0101567bc` | 适配候选 2df5a026；旧 Codex CLI 拒绝模型；新 0.153.4 需两种 runtime 的真实工具/回复验证。保留业务默认模型，仅增加可选项 |
| Worktree + 运行实例隔离 | 同上 | 018ff167 起：独立代码/UID/HOME/STATE/config/runtime/ports/cgroup；需两个真实实例相互隔离及共享实例不变证明 |
| Control UI 公网 HTTPS | `01a06fc2-a70a-73b1-bd17-bbce0063f899` | 现有域名 openclaw.tianyi.live；403 proxy_attribution_required；私有隧道大历史传输不稳定。需严格代理头来源、原生设备认证、真实页面稳定性验收 |
| V Browser 恢复 | 协调任务 | 主 Gateway 和主 CLI 已9.1；专用 Browser Relay 服务仍7.1。设备/租约/列表可用，9.1 页面识别失败。需 Lab 接管-快照-操作-释放，再生产验证 |

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
