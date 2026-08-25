const ACTIONS = new Set(["approve", "changes", "reject"]);

export function parseReviewArgs(args = "") {
  const [action, token, ...extra] = String(args).trim().split(/\s+/);
  if (!ACTIONS.has(action) || !/^[A-Za-z0-9_-]{24,128}$/.test(token ?? "") || extra.length > 0) {
    throw new Error("审核指令格式无效，请使用最新的 Night Shift 通知卡片");
  }
  return { action, token };
}
