#!/usr/bin/env node
// Every byte V runs that differs from upstream OpenClaw (core and official or
// third-party channel plugins) must map to a source: a commit on the
// openclaw-versa fork, an upstream commit we cherry-picked, or a module source
// in this repository. Changes captured before the cutoff may stay "pending"
// (the backlog); anything captured later must name its source.
//
// See docs/upgrade-lts/patch-catch-up-plan.md (step 0).
//
//   node scripts/check-source-map.mjs            # check, exit 1 on violations
//   node scripts/check-source-map.mjs --report   # also print backlog per layer
//   node scripts/check-source-map.mjs --list-unmapped
//
// Offline: the plugin bases are committed hash lists, core is diffed by the
// capture itself (its manifest only lists files that differ from npm).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_RE = /^(versa:[0-9a-f]{7,40}|upstream:[0-9a-f]{7,40}|platform:\S+|pending:\S+)$/;

export function layerOfRelease(release, layers) {
  const suffix = release.split(".").pop();
  return Object.hasOwn(layers, suffix) && suffix !== "core" ? suffix : "core";
}

function normalizePath(p) {
  return p.startsWith("./") ? p.slice(2) : p;
}

export function loadCaptures(capturedDir, layers) {
  const out = [];
  for (const name of fs.readdirSync(capturedDir)) {
    const file = path.join(capturedDir, name, "manifest.json");
    if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    out.push({
      release: name,
      layer: layerOfRelease(name, layers),
      capturedAt: manifest.capturedAt,
      files: manifest.files.map((f) => ({ path: normalizePath(f.path), sha256: f.sha256 })),
    });
  }
  return out;
}

export function checkSourceMap({ map, captures, readBase }) {
  const errors = [];
  const warnings = [];
  const report = {};
  const since = Date.parse(map.since);
  const entries = new Map();
  for (const e of map.entries) {
    if (!SOURCE_RE.test(e.source)) errors.push(`bad source "${e.source}" for ${e.layer} ${e.path}`);
    entries.set(`${e.layer}\0${e.path}\0${e.sha256}`, e);
  }

  // A pending entry is only legitimate for bytes that already existed before
  // the cutoff: the backlog is frozen.
  const seenBeforeCutoff = new Set();
  for (const c of captures) {
    if (Date.parse(c.capturedAt) >= since) continue;
    for (const f of c.files) seenBeforeCutoff.add(`${c.layer}\0${f.path}\0${f.sha256}`);
  }

  const used = new Set();
  for (const [layer, spec] of Object.entries(map.layers)) {
    if (spec.exempt) continue;
    const latest = captures
      .filter((c) => c.layer === layer)
      .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
      .at(-1);
    if (!latest) {
      warnings.push(`layer ${layer}: no capture found`);
      continue;
    }
    const base = spec.base ? readBase(spec.base) : null;
    const counts = { release: latest.release, patched: 0, versa: 0, upstream: 0, platform: 0, pending: 0, unmapped: 0 };
    for (const f of latest.files) {
      if (base && base[f.path] === f.sha256) continue;
      counts.patched += 1;
      const key = `${layer}\0${f.path}\0${f.sha256}`;
      const e = entries.get(key);
      if (!e) {
        counts.unmapped += 1;
        errors.push(`unmapped: ${layer} ${f.path} ${f.sha256.slice(0, 12)} (${latest.release})`);
        continue;
      }
      used.add(key);
      const kind = e.source.split(":")[0];
      counts[kind] += 1;
      if (kind === "pending" && !seenBeforeCutoff.has(key)) {
        errors.push(
          `${layer} ${f.path} changed after ${map.since} but its source is "${e.source}": add the fork commit (versa:<sha>) or module source (platform:<path>)`,
        );
      }
    }
    report[layer] = counts;
  }
  const stale = map.entries.filter((e) => !used.has(`${e.layer}\0${e.path}\0${e.sha256}`));
  if (stale.length) warnings.push(`${stale.length} entries no longer match any live file (prune with --prune)`);
  return { errors, warnings, report, stale };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const mapFile = path.join(root, "release/source-map.json");
  const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  const captures = loadCaptures(path.join(root, "release/captured"), map.layers);
  const readBase = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")).files;
  const result = checkSourceMap({ map, captures, readBase });
  const args = new Set(process.argv.slice(2));

  if (args.has("--report")) {
    console.log("layer           patched  versa  upstream  platform  pending  unmapped  release");
    for (const [layer, c] of Object.entries(result.report)) {
      console.log(
        `${layer.padEnd(15)} ${String(c.patched).padStart(7)} ${String(c.versa).padStart(6)} ${String(c.upstream).padStart(9)} ${String(c.platform).padStart(9)} ${String(c.pending).padStart(8)} ${String(c.unmapped).padStart(9)}  ${c.release}`,
      );
    }
  }
  if (args.has("--prune") && result.stale.length) {
    const stale = new Set(result.stale);
    map.entries = map.entries.filter((e) => !stale.has(e));
    fs.writeFileSync(mapFile, `${JSON.stringify(map, null, 2)}\n`);
    console.log(`pruned ${result.stale.length} stale entries`);
  }
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  if (args.has("--list-unmapped")) {
    for (const e of result.errors.filter((x) => x.startsWith("unmapped"))) console.log(e);
  }
  if (result.errors.length) {
    for (const e of result.errors) console.error(`error: ${e}`);
    console.error(`source-map: ${result.errors.length} violation(s). See docs/upgrade-lts/patch-catch-up-plan.md`);
    process.exit(1);
  }
  console.log("source-map: ok");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
