// lab/candidate scripts and plans that use this plugin must point at files that exist: the 1.x
// candidates (session-relay*.mjs and their plans) imported modules plugin 2.0 deleted. What is
// left of that family is session-relay-native*, which only applies the core patch and is kept
// as the historical v2 reference.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const repo = new URL("../../../../", import.meta.url).pathname;
const candidateDir = path.join(repo, "lab", "candidate");
const PLUGIN_PREFIX = "apps/v-session-relay/";

test("candidates: every plan and script that names a v-session-relay file names one that exists", () => {
  const missing = [];
  for (const name of fs.readdirSync(candidateDir)) {
    const file = path.join(candidateDir, name);
    if (name.endsWith(".plan.json")) {
      const plan = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const p of [...(plan.support ?? []), ...(plan.command ?? [])]) {
        if (typeof p === "string" && p.startsWith(PLUGIN_PREFIX) && !fs.existsSync(path.join(repo, p))) missing.push(`${name}: ${p}`);
      }
    } else if (name.endsWith(".mjs")) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(/["'`]((?:\.\.\/)+apps\/v-session-relay\/plugin\/[^"'`$]+)["'`]/gu)) {
        if (!fs.existsSync(path.resolve(candidateDir, m[1]))) missing.push(`${name}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("candidates: the 1.x session-relay candidates are gone; session-relay-native* stays, marked historical", () => {
  const left = fs.readdirSync(candidateDir).filter((n) => n.startsWith("session-relay")).sort();
  assert.deepEqual(left, [
    "session-relay-native-async.plan.json",
    "session-relay-native-control.plan.json",
    "session-relay-native.mjs",
    "session-relay-native.plan.json",
  ]);
  const head = fs.readFileSync(path.join(candidateDir, "session-relay-native.mjs"), "utf8").split("\n").slice(0, 15).join("\n");
  assert.match(head, /HISTORICAL/u);
  assert.match(head, /sessions-send-relay/u, "points at the v3 core patch");
});
