// lark-cli wrapper. The meeting APIs (bot join, meeting events, in-meeting messages, screenshot)
// have no OpenClaw channel equivalent, so they go through lark-cli with the app identity (--as bot).
// lark-cli keeps the app credentials in its own store; nothing here reads or passes a secret.
// Every call is an async child process: the Gateway's event loop never waits on Feishu.

import { execFile } from "node:child_process";

const MEETING_ENDED_RE = /\b(20001|121004|MEETING_END(ED)?)\b|meeting (has )?ended|会议已结束/iu;
const NOT_READY_RE = /not (yet )?start|未开始|not allowed|不允许|permission|forbidden|121001|121002|121003/iu;

export class LarkCliError extends Error {
  constructor(message, { code, output } = {}) {
    super(message);
    this.code = code;
    this.output = output;
  }
}

/** The first value under `key` anywhere in a parsed JSON tree. */
export function findKey(obj, key, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return undefined;
  if (Object.hasOwn(obj, key)) return obj[key];
  for (const v of Object.values(obj)) {
    const hit = findKey(v, key, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

export function classifyError(output) {
  const text = String(output ?? "");
  if (MEETING_ENDED_RE.test(text)) return "MEETING_ENDED";
  if (NOT_READY_RE.test(text)) return "NOT_READY";
  return "FAILED";
}

/**
 * `exec(bin, args, opts)` resolves `{ code, stdout, stderr }`; injectable for tests.
 * `profile` selects a lark-cli profile (an app other than the CLI default, e.g. VLab's bot).
 */
export function createLarkCli({ bin = "lark-cli", profile, env, timeoutMs = 30_000, exec = defaultExec } = {}) {
  async function run(args, { cwd, timeout = timeoutMs } = {}) {
    const full = [...args, "--format", "json", ...(profile ? ["--profile", profile] : [])];
    const res = await exec(bin, full, { cwd, timeout, env: env ? { ...process.env, ...env } : process.env });
    const out = `${res.stdout ?? ""}${res.stderr ? `\n${res.stderr}` : ""}`;
    let json;
    try { json = JSON.parse(res.stdout); } catch { json = undefined; }
    const failed = res.code !== 0 || json?.ok === false || (typeof json?.code === "number" && json.code !== 0);
    if (failed) throw new LarkCliError(`lark-cli ${args.slice(0, 2).join(" ")} failed: ${out.trim().slice(-400)}`, { code: classifyError(out), output: out.slice(-2000) });
    return json?.data ?? json ?? {};
  }

  return {
    run,
    async join(meetingNumber) {
      const data = await run(["vc", "+meeting-join", "--as", "bot", "--meeting-number", String(meetingNumber)]);
      const meetingId = findKey(data, "meeting")?.id ?? findKey(data, "meeting_id");
      if (!meetingId) throw new LarkCliError("join returned no meeting id", { code: "FAILED", output: JSON.stringify(data).slice(0, 500) });
      return { meetingId: String(meetingId), data };
    },
    async events(meetingId, pageToken) {
      const args = ["vc", "+meeting-events", "--as", "bot", "--meeting-id", meetingId, "--page-all", "--page-size", "100"];
      if (pageToken) args.push("--page-token", pageToken);
      const data = await run(args);
      return { events: Array.isArray(data.events) ? data.events : [], pageToken: data.page_token || pageToken || null };
    },
    async sendText(meetingId, text, uuid) {
      const data = await run(["vc", "+meeting-message-send", "--as", "bot", "--meeting-id", meetingId, "--msg-type", "text", "--text", text, ...(uuid ? ["--uuid", uuid] : [])]);
      const id = findKey(data, "message_id");
      return { messageId: id != null ? String(id) : null };
    },
    async react(meetingId, emoji) {
      await run(["vc", "+meeting-message-send", "--as", "bot", "--meeting-id", meetingId, "--msg-type", "reaction", "--emoji-type", emoji]);
    },
    async leave(meetingId) {
      await run(["vc", "+meeting-leave", "--as", "bot", "--meeting-id", meetingId]);
    },
    /** `cwd` + relative `output`: lark-cli refuses absolute output paths. */
    async screenshot(meetingId, { cwd, output }) {
      const data = await run(["vc", "+meeting-screenshot", "--as", "bot", "--meeting-id", meetingId, "--output", output, "--overwrite"], { cwd });
      return { path: findKey(data, "path") ?? findKey(data, "file_path") ?? null, data };
    },
  };
}

function defaultExec(bin, args, { cwd, timeout, env }) {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd, timeout, env, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? err?.message ?? "") });
    });
  });
}
