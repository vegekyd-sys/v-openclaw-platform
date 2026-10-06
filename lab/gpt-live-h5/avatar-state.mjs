// Only a coarse visual category crosses the wire; never arguments or results.
export const AVATAR_POSES = Object.freeze({
  idle: 'v-signal-idle-20261006.png',
  memory: 'v-signal-memory-20261006.png',
  web: 'v-signal-web-20261006.png',
  calendar: 'v-signal-calendar-20261006.png',
  background: 'v-signal-background-20261006.png',
});
export const AVATAR_FILES = Object.values(AVATAR_POSES);
export const ACTIVITY_LABELS = Object.freeze({memory:'正在查记忆', web:'正在查资料', calendar:'正在查日程', background:'后台处理中'});
export function taskActivity(name, args = {}, depth = 0) {
  if (['end_call','openclaw_end_call','openclaw_live_call_control','cancel_task','current_time'].includes(name)) return 'control';
  if (['memory_search','memory_get'].includes(name)) return 'memory';
  if (['web_search','web_fetch'].includes(name)) return 'web';
  if (name === 'feishu_calendar') return 'calendar';
  // Wrapped native tools have the same visual identity, without forwarding args.
  if (name === 'openclaw_tool' && depth === 0) {
    try { return taskActivity(args.tool, JSON.parse(args.arguments), 1); } catch { return 'background'; }
  }
  // An actual read-only calendar CLI invocation, not a guess from the user prompt.
  if (name === 'exec' && typeof args?.command === 'string' && !/[;&|`\n$]/u.test(args.command) && /^\s*['"]?lark-cli['"]?\s+['"]?calendar['"]?\s+['"]?\+agenda(?:['"]?\s|['"]?$)/u.test(args.command)) return 'calendar';
  return 'background';
}
export function createAvatarTasks() {
  const pending = new Map();
  return {
    consume(event) {
      if (typeof event?.callId !== 'string' || !event.callId) return;
      if (event.type === 'tool.call') {
        const activity = Object.hasOwn(ACTIVITY_LABELS, event.activity) || event.activity === 'control'
          ? event.activity : taskActivity(event.name);
        if (activity !== 'control' && !pending.has(event.callId)) pending.set(event.callId, activity);
      } else if (['tool.result','tool.error'].includes(event.type)) pending.delete(event.callId);
    },
    clear() { pending.clear(); },
    get size() { return pending.size; },
    get pose() { return [...pending.values()].at(-1) ?? 'idle'; },
  };
}
