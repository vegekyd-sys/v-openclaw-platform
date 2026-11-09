// Loaded with `node --import` into a candidate Gateway: records every event-loop stall over 100 ms
// (timer drift on a 50 ms tick) to <EL_PROBE_OUT>.<pid>.jsonl. It writes only when a stall happens,
// so it adds no steady load and does not call into the Gateway.
import fs from "node:fs";

const out = process.env.EL_PROBE_OUT;
if (out) {
  const file = `${out}.${process.pid}.jsonl`;
  const tick = 50;
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const gapMs = now - last - tick;
    last = now;
    if (gapMs > 100) fs.appendFileSync(file, `${JSON.stringify({ at: Date.now(), gapMs: Math.round(gapMs) })}\n`);
  }, tick);
  timer.unref();
}
