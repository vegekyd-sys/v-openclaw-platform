import assert from 'node:assert/strict';

// db91 integrity reuse after a legitimate SQLite shrink.
//
// Every memory_search opens the agent database anew and reuses the Gateway's integrity
// proof only while the file is no smaller than when it was verified. The WAL maintenance
// timer runs PRAGMA incremental_vacuum (agent databases use auto_vacuum=INCREMENTAL), so
// after deletes the file shrinks and the next open ran the full integrity pass on the
// Gateway main thread: 106.6 s and 122.1 s on V's 12 GB makaron database on 2026-10-02,
// each followed by the host-thaw restart loop.
//
// A shrink that SQLite made is visible in the main file header: after the checkpoint that
// truncates the file, header page count x page size equals the file size. A file cut short
// behind SQLite's back keeps the old header page count and still fails reuse, as before.

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchDb91ShrinkReuse(source) {
  let out = replaceExactlyOnce(
    source,
    "  if (!Number.isSafeInteger(receipt.minimumFileBytes) || receipt.minimumFileBytes < 0 || fs.statSync(filename).size < receipt.minimumFileBytes) return false;\n",
    "  if (!Number.isSafeInteger(receipt.minimumFileBytes) || receipt.minimumFileBytes < 0) return false;\n" +
      "  const size = fs.statSync(filename).size;\n" +
      "  if (size < receipt.minimumFileBytes && !shrunkBySqlite(filename, size)) return false;\n",
    'reuse size check',
  );
  out = replaceExactlyOnce(
    out,
    'function sameIdentity(left, right) {',
    '// incremental_vacuum shrinks the file legitimately; SQLite then writes the new page count\n' +
      '// into the header (offset 28, valid while the change counter at 24 equals the one at 92).\n' +
      'export function shrunkBySqlite(filename, size) {\n' +
      '  let fd;\n' +
      '  try {\n' +
      '    fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);\n' +
      '    const header = Buffer.alloc(100);\n' +
      '    if (fs.readSync(fd, header, 0, 100, 0) !== 100 || header.toString("latin1", 0, 16) !== "SQLite format 3\\u0000") return false;\n' +
      '    const rawPageSize = header.readUInt16BE(16);\n' +
      '    const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;\n' +
      '    if (header.readUInt32BE(24) !== header.readUInt32BE(92)) return false;\n' +
      '    const pages = header.readUInt32BE(28);\n' +
      '    return pages > 0 && pages * pageSize === size;\n' +
      '  } catch {\n' +
      '    return false;\n' +
      '  } finally {\n' +
      '    if (fd !== undefined) fs.closeSync(fd);\n' +
      '  }\n' +
      '}\n\n' +
      'function sameIdentity(left, right) {',
    'identity comparison',
  );
  return out;
}
