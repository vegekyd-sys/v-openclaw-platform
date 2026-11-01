#!/usr/bin/env node
// Compare files V runs (a capture) with the same chunks from a source build of
// the openclaw-versa fork. Used to check that a backlog translation reproduces
// what production runs (docs/upgrade-lts/patch-catch-up-plan.md, step 1).
//
//   node scripts/compare-captured-to-build.mjs <capture dist dir> <build dist dir> <file>...
//
// Chunk names carry content hashes, so a file is matched by its name with the
// hash stripped; hash references and comments are ignored when comparing. The
// output is the remaining line diff per file: empty means the build carries
// exactly V's code.

import fs from "node:fs";
import path from "node:path";

const HASHED = /-[A-Za-z0-9_-]{8}(?=\.(?:m?js|d\.ts|json)\b)/g;

function stem(rel) {
  return rel.replace(HASHED, "-#");
}

export function normalize(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, "").replace(HASHED, "-#").trim())
    .filter(Boolean);
}

// Plain LCS line diff; the files involved are a few thousand lines at most.
export function lineDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`- ${a[i]}`);
      i += 1;
    } else {
      out.push(`+ ${b[j]}`);
      j += 1;
    }
  }
  while (i < n) out.push(`- ${a[i++]}`);
  while (j < m) out.push(`+ ${b[j++]}`);
  return out;
}

function findChunk(buildDir, rel) {
  const dir = path.join(buildDir, path.dirname(rel));
  const want = stem(path.basename(rel));
  if (!fs.existsSync(dir)) return undefined;
  const hits = fs.readdirSync(dir).filter((f) => stem(f) === want);
  return hits.length === 1 ? path.join(dir, hits[0]) : undefined;
}

function main() {
  const [captureDir, buildDir, ...files] = process.argv.slice(2);
  if (!captureDir || !buildDir || files.length === 0) {
    console.error("usage: compare-captured-to-build.mjs <capture dist> <build dist> <file>...");
    process.exit(2);
  }
  let differing = 0;
  for (const rel of files) {
    const chunk = findChunk(buildDir, rel);
    if (!chunk) {
      console.log(`${rel}: no unique chunk in the build`);
      differing += 1;
      continue;
    }
    const diff = lineDiff(
      normalize(fs.readFileSync(path.join(captureDir, rel), "utf8")),
      normalize(fs.readFileSync(chunk, "utf8")),
    );
    console.log(`${rel} -> ${path.relative(buildDir, chunk)}: ${diff.length ? `${diff.length} differing lines` : "same"}`);
    for (const line of diff.slice(0, 40)) console.log(`  ${line}`);
    if (diff.length) differing += 1;
  }
  process.exit(differing ? 1 : 0);
}

main();
