const APPROVAL_PATTERNS = [
  /\b(prod|production|deploy|release|publish|merge|push)\b/i,
  /生产|上线|发布|合入|推送|付款|转账|群发|删除(?:数据库|用户|资源)/,
];

const GATEWAY_PATTERNS = [
  /查询|搜索|总结|解释|调研|状态|健康|日志|对话|消息|记忆|session/i,
  /\b(search|research|summari[sz]e|explain|status|health|logs?|messages?|memory|session)\b/i,
];

const SANDBOX_PATTERNS = [
  /开发|改代码|修复|重构|跑测试|构建|编译|安装依赖|生成项目|脚本|复现 bug/i,
  /\b(code|implement|fix|refactor|test|build|compile|npm|pnpm|pip|pytest|script|reproduce)\b/i,
];

export function routeWork(input) {
  const text = String(input?.request ?? input?.text ?? "").trim();
  const hasProject = Boolean(input?.projectPath || input?.repository);
  const reason = [];

  if (APPROVAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      route: "approval",
      reason: "请求可能修改生产、对外发布或产生不可逆影响，必须由人确认范围后执行",
      automatic: false,
    };
  }

  if (hasProject || SANDBOX_PATTERNS.some((pattern) => pattern.test(text))) {
    if (hasProject) reason.push("包含项目工作区");
    if (SANDBOX_PATTERNS.some((pattern) => pattern.test(text))) reason.push("包含开发、构建或测试工作");
    return {
      route: "sandbox",
      reason: reason.join("；"),
      automatic: true,
      defaults: { cpu: "1", memory: "2Gi", networkProfile: "offline" },
    };
  }

  if (GATEWAY_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      route: "gateway",
      reason: "只读查询或沟通任务应留在原 Agent/Gateway，避免不必要地创建开发环境",
      automatic: true,
    };
  }

  return {
    route: "gateway",
    reason: "未发现需要执行不受信任代码的信号；默认保留现有 Agent 能力",
    automatic: true,
  };
}
