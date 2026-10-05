// Creates (or binds) a DingTalk robot for VLab tests by DingTalk's one-click
// QR registration — the same flow the connector's `channels add` wizard uses
// (device-auth.ts), without the wizard's Gateway restart.
//
//   node register-test-bot.mjs <secrets.env> <url-file>
//
// Writes the authorization URL to <url-file> for a person to scan with
// DingTalk, waits, and appends VLAB_DINGTALK_TEST_CLIENT_ID / _SECRET to
// <secrets.env>. The credentials are never printed. Run it on the VLab host.
import fs from "node:fs";

const [secretsFile, urlFile] = process.argv.slice(2);
if (!secretsFile || !urlFile) throw new Error("usage: register-test-bot.mjs <secrets.env> <url-file>");
const BASE = process.env.DINGTALK_REGISTRATION_BASE_URL?.trim() || "https://oapi.dingtalk.com";
const SOURCE = process.env.DINGTALK_REGISTRATION_SOURCE?.trim() || "DING_DWS_CLAW";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (data?.errcode !== 0) throw new Error(`${path}: ${data?.errmsg ?? "error"} (errcode=${data?.errcode})`);
  return data;
}

const { nonce } = await call("/app/registration/init", { source: SOURCE });
const begin = await call("/app/registration/begin", { nonce });
fs.writeFileSync(urlFile, `${begin.verification_uri_complete}\n`, { mode: 0o600 });
console.log(`authorization URL written; expires in ${begin.expires_in ?? 7200}s`);

const interval = Math.max(2, Number(begin.interval ?? 3)) * 1000;
const deadline = Date.now() + Math.max(60, Number(begin.expires_in ?? 7200)) * 1000;
while (Date.now() < deadline) {
  await sleep(interval);
  let polled;
  try { polled = await call("/app/registration/poll", { device_code: begin.device_code }); }
  catch (error) { console.log(`poll error: ${error.message}`); continue; }
  const status = String(polled.status ?? "").toUpperCase();
  if (status === "WAITING") continue;
  if (status === "SUCCESS" && polled.client_id && polled.client_secret) {
    const existing = fs.existsSync(secretsFile) ? fs.readFileSync(secretsFile, "utf8") : "";
    const kept = existing.split("\n").filter((l) => !/^VLAB_DINGTALK_TEST_CLIENT_(ID|SECRET)=/.test(l)).join("\n").replace(/\n*$/, "\n");
    fs.writeFileSync(secretsFile, `${kept}VLAB_DINGTALK_TEST_CLIENT_ID=${polled.client_id}\nVLAB_DINGTALK_TEST_CLIENT_SECRET=${polled.client_secret}\n`);
    fs.rmSync(urlFile, { force: true });
    console.log("SUCCESS: DingTalk test robot credentials stored (not shown)");
    process.exit(0);
  }
  console.log(`status ${status}${polled.fail_reason ? `: ${polled.fail_reason}` : ""}`);
  if (status === "FAIL" || status === "EXPIRED") process.exit(1);
}
console.log("timed out waiting for authorization");
process.exit(1);
