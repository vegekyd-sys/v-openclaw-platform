#!/usr/bin/env node
// Runs contracts against targets and prints the matrix. A contract holds when it
// passes on V's bytes and on the fork, and fails on stock (the reverse control:
// a contract stock also passes never reached the patched path). A contract with
// `parity: true` instead returns a value that must be identical on V and the fork.
//
// usage: run.mjs --targets <dir> [--only <substring>] [--on stock,v,fork-c5] [--out <file>]
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { boot } from "./lib/harness.mjs";

const { values: a } = parseArgs({
  options: { targets: { type: "string" }, only: { type: "string" }, on: { type: "string" }, out: { type: "string" } },
});
if (!a.targets) throw new Error("--targets is required");
const on = (a.on ?? "stock,v,fork-c5").split(",");
const here = path.dirname(fileURLToPath(import.meta.url));
const cases = [];
for (const f of readdirSync(path.join(here, "cases")).sort()) {
  const mod = await import(pathToFileURL(path.join(here, "cases", f)));
  const list = Array.isArray(mod.default) ? mod.default : [mod.default];
  cases.push(...list.filter((c) => !a.only || c.id.includes(a.only)));
}

function assert(cond, message) {
  if (!cond) throw Object.assign(new Error(message), { contract: true });
}

function diffValues(a, b, at = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (Array.isArray(a) && Array.isArray(b) && a.every((x) => typeof x === "string") && b.every((x) => typeof x === "string")) {
    return [{ at, onlyV: a.filter((x) => !b.includes(x)), onlyFork: b.filter((x) => !a.includes(x)) }];
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diffValues(a[k], b[k], `${at}/${k}`));
  }
  return [{ at, v: a, fork: b }];
}

const results = [];
for (const c of cases) {
  const row = { id: c.id, ledger: c.ledger, runs: {} };
  for (const t of on) {
    const started = Date.now();
    let gw;
    try {
      gw = await boot(path.join(a.targets, t), c.boot ?? {});
      const timeoutMs = c.timeoutMs ?? 180_000;
      let timer;
      const note = await Promise.race([
        c.run({ gw, assert, target: t }),
        new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`no result in ${timeoutMs} ms`)), timeoutMs))),
      ]).finally(() => clearTimeout(timer));
      row.runs[t] = c.parity
        ? { pass: true, value: note, note: `${JSON.stringify(note).length} bytes`, ms: Date.now() - started }
        : { pass: true, note, ms: Date.now() - started };
    } catch (e) {
      // A harness failure is not a reverse-control failure: only assertions count.
      row.runs[t] = { pass: false, kind: e.contract ? "contract" : "harness", note: String(e.message).slice(0, 400), ms: Date.now() - started };
    } finally {
      await Promise.race([gw?.stop().catch(() => {}), new Promise((r) => setTimeout(r, 15_000))]);
    }
    console.log(`${c.id} [${t}] ${row.runs[t].pass ? "pass" : `FAIL(${row.runs[t].kind})`} ${row.runs[t].ms} ms: ${row.runs[t].note ?? ""}`);
  }
  const r = row.runs;
  row.holds = c.parity
    ? r.v?.pass === true && r["fork-c5"]?.pass === true && JSON.stringify(r.v.value) === JSON.stringify(r["fork-c5"].value)
    : r.v?.pass === true && r["fork-c5"]?.pass === true && r.stock?.pass === false && r.stock?.kind === "contract";
  if (c.parity && !row.holds && r.v?.value && r["fork-c5"]?.value) {
    row.diff = diffValues(r.v.value, r["fork-c5"].value);
    console.log(`${c.id} differs: ${JSON.stringify(row.diff).slice(0, 1200)}`);
  }
  results.push(row);
}
const held = results.filter((r) => r.holds).length;
console.log(`\n${held}/${results.length} contracts hold (pass on v and fork, contract failure on stock)`);
for (const r of results.filter((x) => !x.holds)) console.log(`  not holding: ${r.id}`);
if (a.out) writeFileSync(a.out, JSON.stringify(results, null, 2) + "\n");
process.exit(held === results.length ? 0 : 1);
