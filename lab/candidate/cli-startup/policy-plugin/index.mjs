// Candidate-only before_tool_call probe: a marker in the call's params means the call must be blocked.
import fs from "node:fs";
export default {
  id: "relay-policy-probe",
  register(api) {
    const logPath = api.pluginConfig?.logPath;
    api.on("before_tool_call", (event) => {
      const text = JSON.stringify(event?.params ?? {});
      const blocked = text.includes("RELAYPROBEBLOCK");
      if (logPath && text.includes("RELAYPROBE")) fs.appendFileSync(logPath, JSON.stringify({ at: Date.now(), tool: event?.toolName, blocked, text: text.slice(0, 160) }) + "\n");
      return blocked ? { block: true, blockReason: "relay policy probe" } : undefined;
    }, { priority: 50 });
  },
};
