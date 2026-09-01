import assert from "node:assert/strict";
import test from "node:test";

import { NIGHT_SHIFT_CHANGELOG } from "../client/src/changelog.js";

test("Night Shift changelog covers the first release through the current release", () => {
  assert.equal(NIGHT_SHIFT_CHANGELOG.at(-1).title, "Night Shift 第一版");
  assert.equal(NIGHT_SHIFT_CHANGELOG.at(-1).date, "2026-08-22");
  assert.ok(NIGHT_SHIFT_CHANGELOG.length >= 8);
  for (const [index, entry] of NIGHT_SHIFT_CHANGELOG.entries()) {
    assert.deepEqual(Object.keys(entry).sort(), ["date", "items", "title"]);
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.title.length > 0);
    assert.ok(entry.items.length >= 1 && entry.items.length <= 3);
    if (index > 0) assert.ok(entry.date <= NIGHT_SHIFT_CHANGELOG[index - 1].date);
  }
});
