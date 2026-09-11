import { Console } from "node:console";
import { performance } from "node:perf_hooks";

const sink = new Console({
  stdout: process.stdout,
  stderr: process.stderr,
  ignoreErrors: true,
});
const stages = new Set([
  "gateway-dispatch-function-enter",
  "gateway-dispatch-wrapper-call",
  "gateway-media-transcript-run",
  "gateway-work-admission-run",
  "gateway-dispatch-inbound-enter",
  "gateway-plugin-media-await-enter",
  "gateway-plugin-media-await-end",
  "gateway-projected-dispatch-enter",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Temporary VLab diagnostic. Rows contain timing and a validated run id only;
// no session key, body, prompt, tool argument, path or credential is emitted.
export function createGatewayDispatchPhaseObserver(runId) {
  if (
    process.env.OPENCLAW_GATEWAY_DISPATCH_PHASES !== "1" ||
    typeof runId !== "string" ||
    !uuid.test(runId)
  ) {
    return () => {};
  }
  const startedAt = performance.now();
  const startedCpu = process.cpuUsage();
  const startedElu = performance.eventLoopUtilization();
  return (stage) => {
    try {
      if (!stages.has(stage)) return;
      const cpu = process.cpuUsage(startedCpu);
      const elu = performance.eventLoopUtilization(startedElu);
      sink.error(
        "[gateway-dispatch-phases] " +
          JSON.stringify({
            v: 1,
            stage,
            runId,
            pid: process.pid,
            atMs: Date.now(),
            monoMs: performance.now(),
            elapsedMs: performance.now() - startedAt,
            cpuUserMs: cpu.user / 1000,
            cpuSystemMs: cpu.system / 1000,
            eventLoopUtilization: elu.utilization,
          }),
      );
    } catch {
      // Observation must not affect dispatch.
    }
  };
}
