// Test-only: add call tracing to a copy of sqlite-readonly-location-*.js in the candidate runtime.
//   node trace-inject.mjs <dist file>
import fs from 'node:fs';
const file = process.argv[2];
let src = fs.readFileSync(file, 'utf8');
if (src.includes('__snapTrace')) { console.log('trace-inject: already traced'); process.exit(0); }
const names = ['prepareSqliteReadOnlyLocationInProcess', 'prepareSqliteReadOnlyLocationSyncInProcess', 'prepareSqliteReadOnlyLocation',
  'prepareSqliteReadOnlyLocationSync', 'createStableReadOnlyCopyInTempDirectory', 'createOnlineReadOnlyBackup',
  'createPrivateSqliteTempDirectorySync', 'createPrivateSqliteTempDirectory', 'removeTempDirectory'];
let n = 0;
for (const name of names) {
  const re = new RegExp(`^((?:async )?function ${name}\\([^)]*\\) \\{)$`, 'm');
  if (!re.test(src)) throw new Error(`no ${name}`);
  src = src.replace(re, (m) => { n++; return `${m}\n\t__snapTrace(${JSON.stringify(name)}, arguments);`; });
}
const helper = `
import __snapFs from "node:fs";
function __snapTrace(fn, args) {
\tconst out = process.env.OPENCLAW_SNAPSHOT_TRACE; if (!out) return;
\tconst stack = String(new Error().stack).split("\\n").slice(2, 40).map((l) => l.trim().replace(/^at /, "")).filter((l) => !l.includes("node:internal")).map((l) => l.replace(/\\(?file:\\/\\/[^)]*\\/dist\\//, "").replace(/\\)$/, ""));
\t__snapFs.appendFileSync(out, JSON.stringify({ t: Date.now(), pid: process.pid, ppid: process.ppid, fn, arg: typeof args[0] === "string" ? args[0] : null, stack }) + "\\n");
}
`;
src = src.replace(/(\nimport \{ randomUUID \} from "node:crypto";\n)/, `$1${helper}`);
if (!src.includes('__snapFs')) throw new Error('helper not placed');
fs.writeFileSync(file, src);
console.log(`trace-inject: ${n} functions`);
