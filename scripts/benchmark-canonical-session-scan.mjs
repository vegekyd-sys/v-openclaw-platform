// Read-only native canonical-key validation benchmark; no database/config copy.
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {registerHooks} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";

assert.equal(os.hostname(), "VM-0-4-ubuntu");
const owner = process.argv[2]; assert(/^[a-f0-9-]{36}$/.test(owner));
const root = "/srv/vlab-production-mirror/labs/instances/db91-parity";
const lease = "/srv/vlab-production-mirror/labs/control/integration.json";
const assertLease = () => assert.equal(JSON.parse(fs.readFileSync(lease, "utf8")).owner, owner);
assertLease();
const filename = "session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
const original = join(root, "runtime/openclaw/dist", filename);
const candidate = fs.readFileSync(new URL("../lab/release-files/" + filename, import.meta.url), "utf8");
const before = createHash("sha256").update(fs.readFileSync(original)).digest("hex");
assert.equal(before, "686ae2059ab36a85f9c93a9de9fdc8c75212b5fc978ebcb780c6abca1bd595e5");
const scratch = fs.mkdtempSync(join(os.tmpdir(), "canonical-scan-diag-"));
process.env.OPENCLAW_STATE_DIR = scratch;
process.env.OPENCLAW_CONFIG_PATH = join(scratch, "unused-config.json");
const baselineURL = pathToFileURL(original).href, candidateURL = baselineURL + "?canonical-scan-candidate";
const hook = registerHooks({load(url, context, nextLoad) {
  return url === candidateURL ? {format: "module", source: candidate, shortCircuit: true} : nextLoad(url, context);
}});
let database;
try {
  const baseline = (await import(baselineURL)).g, proposed = (await import(candidateURL)).g;
  assert.equal(typeof baseline, "function"); assert.equal(typeof proposed, "function");
  const pathname = join(root, "state/agents/makaron/agent/openclaw-agent.sqlite");
  const db = new DatabaseSync(pathname, {readOnly: true}); database = db;
  db.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 1000; BEGIN");
  const shape = db.prepare(`SELECT count(*) AS rows, sum(length(entry_json)) AS sourceChars,
    sum(length(CASE WHEN entry_valid = 1 AND json_valid(entry_json) THEN json_remove(entry_json, '$.skillsSnapshot', '$.systemPromptReport') ELSE entry_json END)) AS validationChars
    FROM session_nodes`).get();
  console.log(JSON.stringify({stage: "shape", before, ...shape}));
  console.log(JSON.stringify({stage: "field-sizes", fields: db.prepare(`SELECT j.key AS field, count(*) AS rows,
    sum(length(j.value)) AS chars FROM session_nodes n, json_each(CASE WHEN json_valid(n.entry_json) THEN n.entry_json ELSE '{}' END) j
    WHERE typeof(j.key) = 'text' GROUP BY j.key ORDER BY chars DESC LIMIT 12`).all()}));
  const results = [];
  for (const variant of ["baseline", "candidate", "candidate", "baseline", "baseline", "candidate"]) {
    assertLease(); const start = performance.now(), cpu = process.cpuUsage();
    const count = (variant === "baseline" ? baseline : proposed)({db, path: pathname, agentId: "makaron"});
    const used = process.cpuUsage(cpu);
    const row = {variant, count, ms: Math.round((performance.now() - start) * 10) / 10, cpuMs: (used.user + used.system) / 1000};
    results.push(row); console.log(JSON.stringify(row));
  }
  assert.equal(new Set(results.map(x => x.count)).size, 1);
  db.exec("ROLLBACK");
  console.log(JSON.stringify({completed: true, sameValidatedCount: true, readOnly: true}));
} finally {
  database?.close(); hook.deregister(); fs.rmSync(scratch, {recursive: true, force: true});
}
