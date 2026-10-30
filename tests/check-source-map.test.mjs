import assert from "node:assert/strict";
import test from "node:test";

import { checkSourceMap } from "../scripts/check-source-map.mjs";

const layers = { core: { base: null }, feishu: { base: "feishu.json" }, worker: { exempt: true } };
const base = { "dist/a.js": "aaa", "dist/b.js": "bbb" };
const readBase = () => base;

function capture(release, layer, capturedAt, files) {
  return { release, layer, capturedAt, files: Object.entries(files).map(([path, sha256]) => ({ path, sha256 })) };
}

function map(entries, since = "2026-10-29T12:00:00Z") {
  return { since, layers, entries };
}

test("backlog bytes captured before the cutoff may stay pending", () => {
  const captures = [
    capture("r1", "core", "2026-10-28T00:00:00Z", { "dist/x.js": "x1" }),
    capture("r1.feishu", "feishu", "2026-10-28T00:00:00Z", { "dist/a.js": "aaa", "dist/b.js": "b2" }),
  ];
  const r = checkSourceMap({
    map: map([
      { layer: "core", path: "dist/x.js", sha256: "x1", source: "pending:backlog" },
      { layer: "feishu", path: "dist/b.js", sha256: "b2", source: "pending:backlog" },
    ]),
    captures,
    readBase,
  });
  assert.deepEqual(r.errors, []);
  assert.equal(r.report.core.pending, 1);
  // a.js equals the published plugin, so it is not a patch at all
  assert.equal(r.report.feishu.patched, 1);
});

test("a change captured after the cutoff must name its source", () => {
  const captures = [
    capture("r1", "core", "2026-10-28T00:00:00Z", { "dist/x.js": "x1" }),
    capture("r2", "core", "2026-10-30T00:00:00Z", { "dist/x.js": "x2" }),
  ];
  const pending = checkSourceMap({
    map: map([{ layer: "core", path: "dist/x.js", sha256: "x2", source: "pending:backlog" }]),
    captures,
    readBase,
  });
  assert.equal(pending.errors.length, 1);
  assert.match(pending.errors[0], /changed after/);

  const sourced = checkSourceMap({
    map: map([
      {
        layer: "core",
        path: "dist/x.js",
        sha256: "x2",
        source: "versa:0123456789a",
        equivalence: "normdiff:0123456789a",
      },
    ]),
    captures,
    readBase,
  });
  assert.deepEqual(sourced.errors, []);
  assert.equal(sourced.report.core.versa, 1);
  assert.equal(sourced.report.core.compared, 1);
});

test("a fork commit without a recorded comparison with V fails", () => {
  const captures = [capture("r1", "core", "2026-10-28T00:00:00Z", { "dist/x.js": "x1", "dist/y.json": "y1" })];
  const entry = (path, sha256, equivalence) => ({ layer: "core", path, sha256, source: "versa:0123456789a", equivalence });
  const missing = checkSourceMap({
    map: map([entry("dist/x.js", "x1"), entry("dist/y.json", "y1", "looks-fine")]),
    captures,
    readBase,
  });
  assert.equal(missing.errors.length, 2);
  assert.ok(missing.errors.every((e) => /records no comparison with V/.test(e)));
  assert.equal(missing.report.core.compared, 0);

  const recorded = checkSourceMap({
    map: map([entry("dist/x.js", "x1", "normdiff:fedcba98765"), entry("dist/y.json", "y1", "identical:fedcba98765")]),
    captures,
    readBase,
  });
  assert.deepEqual(recorded.errors, []);
  assert.equal(recorded.report.core.compared, 2);
});

test("unmapped patched files and malformed sources fail; only the latest capture counts", () => {
  const captures = [
    capture("r1", "core", "2026-10-01T00:00:00Z", { "dist/old.js": "o1" }),
    capture("r2", "core", "2026-10-02T00:00:00Z", { "dist/new.js": "n1" }),
  ];
  const r = checkSourceMap({
    map: map([{ layer: "core", path: "dist/old.js", sha256: "o1", source: "somewhere" }]),
    captures,
    readBase,
  });
  assert.ok(r.errors.some((e) => e.startsWith("unmapped: core dist/new.js")));
  assert.ok(r.errors.some((e) => e.startsWith('bad source "somewhere"')));
  assert.equal(r.stale.length, 1);
});

test("exempt layers are not checked", () => {
  const captures = [capture("r1.worker", "worker", "2026-10-30T00:00:00Z", { "index.mjs": "w" })];
  const r = checkSourceMap({ map: map([]), captures, readBase });
  assert.deepEqual(r.errors, []);
  assert.equal(r.report.worker, undefined);
});
