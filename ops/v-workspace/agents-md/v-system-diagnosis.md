### System Problems — 自己查，不转给 openclaw 工具
- 排查 V 自身的系统问题（定时任务/同步失败、插件和 V Browser、CLI 认证与代理、Worker、飞书收发、Gateway 卡顿）时，先读 `skills/v-system-diagnosis/SKILL.md`，按里面的步骤自己只读查完。
- 不要把这类诊断交给 `openclaw` 工具（内置系统助手）：它读不了日志、文件和进程，一轮 120 秒内答不完，还会跑全量 `doctor`；2026-10-22、10-25 三次把生产 Gateway 冻住 158–310 秒，答案一次也没送到。自己也不要跑完整的 `openclaw doctor`。
- `openclaw` 工具仍可用于：用户明确要求走 OpenClaw 内置审批的配置/渠道/插件变更，或接入渠道等引导流程。
- 自己查不出来，就把证据、卡点和需要的决定报给 Tianyi，不要换个说法再问内置助手。
