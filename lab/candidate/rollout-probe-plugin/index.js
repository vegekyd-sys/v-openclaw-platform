// Candidate-only probe, never in a release plan. It records every before_tool_call it sees and
// applies the rules in ROLLOUT_PROBE_DIR/rules.json, so a scenario can ask which harness calls the
// hook for which tool, and what block, requireApproval and a slow hook do there.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIR = process.env.ROLLOUT_PROBE_DIR ?? "/tmp/rollout-probe";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rules = () => { try { return JSON.parse(fs.readFileSync(path.join(DIR, "rules.json"), "utf8")); } catch { return []; } };
const note = (o) => { try { fs.appendFileSync(path.join(DIR, "hook.jsonl"), `${JSON.stringify({ at: Date.now(), pid: process.pid, ...o })}\n`); } catch {} };

function noisePng(side) {
  const raw = Buffer.alloc((side * 3 + 1) * side);
  crypto.randomFillSync(raw);
  for (let y = 0; y < side; y++) raw[y * (side * 3 + 1)] = 0;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(side, 0); ihdr.writeUInt32BE(side, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
}

export default {
  id: "rollout-probe",
  register(api) {
    api.on("before_tool_call", async (event, ctx) => {
      const text = JSON.stringify(event.params ?? {});
      const rule = rules().find((r) => (r.tool ? event.toolName === r.tool : true) && (r.match ? text.includes(r.match) : true));
      note({ tool: event.toolName, params: text.slice(0, 240), runId: ctx?.runId, sessionKey: ctx?.sessionKey, rule: rule?.action ?? null });
      if (!rule) return undefined;
      if (rule.action === "sleep-block") { await sleep(rule.ms); note({ tool: event.toolName, sleptMs: rule.ms }); return { block: true, blockReason: "rollout-probe slow block" }; }
      if (rule.action === "block") return { block: true, blockReason: "rollout-probe block" };
      if (rule.action === "approve") return { requireApproval: { title: "rollout-probe approval", description: `probe ${event.toolName}`, severity: "warning", timeoutMs: rule.timeoutMs ?? 120_000 } };
      return undefined;
    });
    api.registerTool({
      name: "hr_probe",
      label: "Rollout probe",
      description: "Candidate probe. Writes the given marker file and returns it.",
      parameters: { type: "object", additionalProperties: false, properties: { marker: { type: "string" } }, required: ["marker"] },
      async execute(_id, params) {
        fs.mkdirSync(path.join(DIR, "markers"), { recursive: true });
        fs.writeFileSync(path.join(DIR, "markers", path.basename(params.marker)), "tool\n");
        return { content: [{ type: "text", text: `probe ran: ${params.marker}` }] };
      },
    });
    api.registerTool({
      name: "hr_screenshot",
      label: "Rollout screenshot",
      description: "Candidate probe standing in for a computer screenshot. Returns one image and the frame number.",
      parameters: { type: "object", additionalProperties: false, properties: { frame: { type: "number" } }, required: ["frame"] },
      async execute(_id, params) {
        const side = Number(process.env.ROLLOUT_FRAME_SIDE ?? 320);
        return { content: [{ type: "text", text: `frame ${params.frame}` }, { type: "image", data: noisePng(side).toString("base64"), mimeType: "image/png" }] };
      },
    });
  },
};
