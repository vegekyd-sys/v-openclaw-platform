// Records every file a Node process loads, for the Gateway/Worker load manifest
// (docs/worker-roll-scope.md). Preload with `--import <this file>`; Worker
// processes inherit it through process.execArgv (worker-pool.mjs keeps every
// flag except --inspect), worker_threads through their default execArgv.
//
// One append-only file per process and thread under LOAD_TRACE_DIR, written
// synchronously at first load so a SIGKILLed process still leaves its list.
// Without LOAD_TRACE_DIR it does nothing.
import { appendFileSync, mkdirSync } from "node:fs";
import { registerHooks } from "node:module";
import { isMainThread, threadId } from "node:worker_threads";

const dir = process.env.LOAD_TRACE_DIR;
if (dir && !globalThis.__vLoadTraceInstalled) {
  globalThis.__vLoadTraceInstalled = true;
  const role = process.env.VLAB_WORKER_CHILD === "1"
    ? "worker"
    : process.argv.some((arg) => /\/dist\/index\.js$/.test(arg)) && process.argv.includes("gateway")
      ? "gateway"
      : "other";
  const file = `${dir}/${role}-${process.pid}-t${isMainThread ? 0 : threadId}.log`;
  mkdirSync(dir, { recursive: true });
  appendFileSync(file, `#argv ${JSON.stringify(process.argv.slice(1, 4))}\n`);
  const seen = new Set();
  registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith("file:") && !seen.has(url)) {
        seen.add(url);
        appendFileSync(file, `${Date.now()} ${url}\n`);
      }
      return nextLoad(url, context);
    },
  });
}
