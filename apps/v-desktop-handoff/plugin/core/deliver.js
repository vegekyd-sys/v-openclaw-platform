import { execFile } from "node:child_process";

// Sends a private message through the OpenClaw CLI (the same path Night Shift
// uses for its Feishu cards). A control link issued in a group must never be
// posted into the group: the link is a bearer token, so it goes to the
// requester's DM instead.
export function deliverPrivately({ channel, target, text, command = "openclaw", accountId, env = process.env, runner = defaultRunner, timeoutMs = 30_000 }) {
  if (!channel || !target) {
    return Promise.reject(new Error("private delivery needs the channel and the requester id"));
  }
  const args = ["message", "send", "--channel", channel, "--target", target, "--message", text, "--json", ...(accountId ? ["--account", accountId] : [])];
  return runner(command, args, { env, timeoutMs });
}

function defaultRunner(command, args, { env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { env, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} message send failed: ${String(stderr || error.message).slice(0, 300)}`));
        return;
      }
      resolve(String(stdout).slice(0, 2000));
    });
  });
}
