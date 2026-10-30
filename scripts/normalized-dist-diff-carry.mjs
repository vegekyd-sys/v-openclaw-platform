// Carries verdicts from an earlier normalized-dist-diff run onto a new one, so a
// rerun (a fix merged, a new fork build) only asks for verdicts where the code
// changed. An item keeps its verdict only when its diff text is the same as the
// one that was judged; everything else is listed for a fresh verdict.
//
// usage: node scripts/normalized-dist-diff-carry.mjs --old <run dir> --new <run dir>
//          --verdicts a.md,b.md --out <file.md>
// A run dir holds one <layer>/report.json per layer. Verdict files are markdown
// tables: "| #n | layer/file | unit | verdict | ..." or "| file | unit | verdict | ...",
// verdict one of 等价 / 有意差异 / 翻错 / 工具误报.
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const SETTLED = new Set(["identical", "identical-renamed", "format-only", "renamed-only", "reprint-only"]);

function load(dir) {
  const items = new Map();
  for (const layer of fs.readdirSync(dir)) {
    const file = path.join(dir, layer, "report.json");
    if (!fs.existsSync(file)) continue;
    for (const f of JSON.parse(fs.readFileSync(file, "utf8"))) {
      for (const u of f.units) items.set(`${layer}/${f.file}\0${u.key}\0v`, { layer, file: f.file, key: u.key, side: "v", status: u.status, diff: u.diff ?? "" });
      for (const u of f.forkOnly ?? []) items.set(`${layer}/${f.file}\0${u.key}\0fork`, { layer, file: f.file, key: u.key, side: "fork", status: "differs", diff: u.diff ?? "" });
    }
  }
  return items;
}

const LABELS = new Set(["等价", "有意差异", "翻错", "工具误报"]);
// table cells hold a one-line, possibly shortened unit key
const shortKey = (k) => k.replace(/^`|`$/g, "").split("\n")[0].replace(/\\\|/g, "|").slice(0, 40).trim();
const body = (d) => d.split("\n").filter((l) => !l.startsWith("@@")).join("\n");

const verdicts = new Map();
for (const vf of args.verdicts.split(",")) {
  for (const line of fs.readFileSync(vf, "utf8").split("\n")) {
    // team A: | #n | layer/file | key | verdict | ... ; team B: | file | key | verdict | ...
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 6) continue;
    const a = /^#\d+$/.test(cells[1]);
    const [id, file, key, verdict] = a ? cells.slice(1, 5) : [path.basename(vf), ...cells.slice(1, 4)];
    if (!/\.(m?js|json|md)$/.test(file) || !LABELS.has(verdict)) continue;
    const k = `${file.replace(/^[\w-]+\//, "")}\0${shortKey(key)}`;
    const list = verdicts.get(k) ?? [];
    list.push({ id, verdict });
    verdicts.set(k, list);
  }
}

const oldItems = load(args.old);
const newItems = load(args.new);
const carried = [];
const redo = [];
const resolved = [];
for (const [k, n] of newItems) {
  if (SETTLED.has(n.status)) {
    const o = oldItems.get(k);
    if (o && !SETTLED.has(o.status)) resolved.push({ ...n, was: verdicts.get(`${n.file}\0${shortKey(n.key)}`) ?? [] });
    continue;
  }
  const o = oldItems.get(k);
  const v = verdicts.get(`${n.file}\0${shortKey(n.key)}`) ?? [];
  if (o && !SETTLED.has(o.status) && o.status === n.status && body(o.diff) === body(n.diff) && v.length) carried.push({ ...n, verdicts: v });
  else redo.push({ ...n, reason: !o ? "new item" : !v.length ? "no verdict found" : o.status !== n.status ? `${o.status} -> ${n.status}` : "diff changed", old: o, verdicts: v });
}

const out = [];
out.push(`# normdiff carry-over`, "", `old: ${args.old}`, `new: ${args.new}`, "");
out.push(`- carried (same diff, verdict kept): ${carried.length}`);
out.push(`- now settled (was pending): ${resolved.length}`);
out.push(`- needs a fresh verdict: ${redo.length}`, "");
const tally = {};
for (const c of carried) for (const v of c.verdicts) tally[v.verdict] = (tally[v.verdict] ?? 0) + 1;
out.push(`carried verdicts: ${JSON.stringify(tally)}`, "", "## now settled", "");
for (const r of resolved) out.push(`- ${r.layer}/${r.file} \`${r.key}\` -> ${r.status} (was ${r.was.map((v) => `${v.id} ${v.verdict}`).join(", ") || "?"})`);
out.push("", "## needs a fresh verdict", "");
for (const r of redo) {
  out.push(`### ${r.layer}/${r.file} \`${r.key}\` (${r.side}) — ${r.reason}; earlier: ${r.verdicts.map((v) => `${v.id} ${v.verdict}`).join(", ") || "none"}`);
  if (r.diff) out.push("```diff", r.diff.trimEnd(), "```");
  if (r.old?.diff && r.old.diff !== r.diff) out.push("earlier diff:", "```diff", r.old.diff.trimEnd(), "```");
}
fs.writeFileSync(args.out, `${out.join("\n")}\n`);
console.log(`carried ${carried.length}, settled ${resolved.length}, redo ${redo.length} -> ${args.out}`);
