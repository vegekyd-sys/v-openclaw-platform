// Add new updates at the top. Keep the format to date + title + 1–3 user-facing items.
export const NIGHT_SHIFT_CHANGELOG = [
  {
    date: "2026-08-25",
    title: "审核回到飞书",
    items: [
      "项目进入待审核或完成时，会主动通知最初创建任务的人。",
      "点击通过或拒绝后，原卡片直接显示最终状态并收起按钮。",
    ],
  },
  {
    date: "2026-08-25",
    title: "接入共享 Worker",
    items: [
      "夜班任务与日常聊天共用 OpenClaw 的弹性 Worker 池。",
      "Agent 的会话、执行过程和异常恢复继续由 Gateway 统一管理。",
    ],
  },
  {
    date: "2026-08-24",
    title: "严格检查每一步的真实交付",
    items: [
      "缺少 Workflow 约定结果的任务，不会被提前标为完成。",
      "付费生产和外部发布必须分别获得人工授权。",
    ],
  },
  {
    date: "2026-08-24",
    title: "V 的 Workflow 控制室",
    items: [
      "在一张生产线视图里查看多个项目、阶段和 Agent 的工作状态。",
      "桌面与手机都可以查看任务、审核结果和交付内容。",
    ],
  },
  {
    date: "2026-08-23",
    title: "阶段交接清晰可见",
    items: [
      "每张卡只展示当前阶段收到的输入、产出的结果和下一步去向。",
      "交付链接、机器 QC、Agent Session 和执行证据可以直接查看。",
    ],
  },
  {
    date: "2026-08-23",
    title: "多 Agent 并行生产",
    items: [
      "同一项目里的独立内容可以并行推进，不再排成一条长队。",
      "阻塞任务修复后可以重新执行，不必重建整个项目。",
    ],
  },
  {
    date: "2026-08-22",
    title: "一个 workflow.md，承接多个项目",
    items: [
      "V 可以通过自然语言创建、导入和修改 Workflow。",
      "发布后的 Workflow 会冻结版本，新项目自动使用最新版本。",
    ],
  },
  {
    date: "2026-08-22",
    title: "Night Shift 第一版",
    items: [
      "Workflow 编译器、自动调度器与 Live Board 首次上线。",
      "原生 Workboard 成为任务、状态、执行记录与人工审核的唯一来源。",
    ],
  },
];
