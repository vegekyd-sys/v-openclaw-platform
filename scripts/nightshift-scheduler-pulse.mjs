#!/usr/bin/env node

const endpoint = process.argv[2] ?? process.env.NIGHTSHIFT_SCHEDULER_URL;
if (!endpoint) throw new Error("Usage: nightshift-scheduler-pulse.mjs <loopback-scheduler-url>");

const url = new URL(endpoint);
if (!(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) {
  throw new Error("Night Shift scheduler endpoint must be loopback-only");
}

const response = await fetch(url, {
  method: "POST",
  signal: AbortSignal.timeout(Number(process.env.NIGHTSHIFT_SCHEDULER_PULSE_TIMEOUT_MS ?? 75_000)),
});
if (!response.ok) {
  throw new Error(`Night Shift scheduler pulse failed with HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
}
const result = await response.json();
if (!result || typeof result !== "object" || !Array.isArray(result.warnings)) {
  throw new Error("Night Shift scheduler returned an invalid result");
}
if (result.warnings.length > 0) {
  process.stderr.write(`Night Shift scheduler warnings: ${result.warnings.join("; ")}\n`);
}
process.stdout.write("NO_REPLY\n");
