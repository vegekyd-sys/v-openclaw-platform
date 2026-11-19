import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export function readSkillUsageRows(dbPath) {
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return database
      .prepare(
        `SELECT skill_file, skill_key, skill_name, skill_source,
                first_used_at_ms, last_used_at_ms, use_count, last_agent_id
           FROM skill_usage
          ORDER BY use_count DESC, last_used_at_ms DESC, skill_key ASC`,
      )
      .all();
  } finally {
    database.close();
  }
}

export function buildSkillUsageReport(rows, baseline = []) {
  const baselineByFile = new Map(
    baseline.map((row) => [row.skillFile, Number(row.useCount ?? 0)]),
  );
  const skills = rows.map((row) => {
    const useCount = Number(row.use_count ?? 0);
    const baselineUseCount = baselineByFile.get(row.skill_file) ?? 0;
    return {
      skillFile: row.skill_file,
      skillKey: row.skill_key,
      skillName: row.skill_name,
      skillSource: row.skill_source,
      firstUsedAtMs: Number(row.first_used_at_ms),
      lastUsedAtMs: Number(row.last_used_at_ms),
      useCount,
      baselineUseCount,
      deltaUseCount: Math.max(0, useCount - baselineUseCount),
      lastAgentId: row.last_agent_id ?? null,
    };
  });
  skills.sort(
    (left, right) =>
      right.deltaUseCount - left.deltaUseCount ||
      right.useCount - left.useCount ||
      left.skillKey.localeCompare(right.skillKey),
  );
  return {
    generatedAt: new Date().toISOString(),
    trackedSkills: skills.length,
    totalActivations: skills.reduce((sum, row) => sum + row.useCount, 0),
    deltaActivations: skills.reduce(
      (sum, row) => sum + row.deltaUseCount,
      0,
    ),
    skills,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--db") options.dbPath = argv[++index];
    else if (argument === "--baseline") options.baselinePath = argv[++index];
    else if (argument === "--write-baseline") {
      options.writeBaselinePath = argv[++index];
    } else if (argument === "--limit") options.limit = Number(argv[++index]);
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!options.dbPath) throw new Error("--db is required");
  return options;
}

function readBaseline(baselinePath) {
  if (!baselinePath) return [];
  const parsed = JSON.parse(readFileSync(baselinePath, "utf8"));
  return Array.isArray(parsed?.skills) ? parsed.skills : [];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = readSkillUsageRows(resolve(options.dbPath));
  const report = buildSkillUsageReport(
    rows,
    readBaseline(options.baselinePath),
  );
  if (Number.isFinite(options.limit) && options.limit >= 0) {
    report.skills = report.skills.slice(0, options.limit);
  }
  if (options.writeBaselinePath) {
    writeFileSync(
      resolve(options.writeBaselinePath),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
