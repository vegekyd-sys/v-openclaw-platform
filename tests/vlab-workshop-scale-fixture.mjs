import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const stateDir = process.env.OPENCLAW_STATE_DIR ?? "/srv/vlab/state";
const workshopDir = join(stateDir, "skill-workshop");
const proposalsDir = join(workshopDir, "proposals");
const manifestPath = join(workshopDir, "proposals.json");
const prefix = "vlab-tool-parity-scale-";
const action = process.argv[2];
const requestedCount = Number(process.argv[3] ?? 400);
const requestedStatus = process.argv[4] ?? "rejected";

function manifestEntry(record) {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    title: record.title,
    description: record.description,
    skillName: record.target.skillName,
    skillKey: record.target.skillKey,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    scanState: record.scan.state,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

let manifest = await readJson(manifestPath);
const retained = manifest.proposals.filter(
  (proposal) => !proposal.id.startsWith(prefix),
);

if (action === "clean") {
  const entries = await readFile(manifestPath, "utf8").then(JSON.parse);
  for (const proposal of entries.proposals) {
    if (!proposal.id.startsWith(prefix)) {
      continue;
    }
    await rm(join(proposalsDir, proposal.id), {
      recursive: true,
      force: true,
    });
  }
  await writeJson(manifestPath, {
    ...manifest,
    updatedAt: new Date().toISOString(),
    proposals: retained,
  });
  process.stdout.write(
    `${JSON.stringify({ ok: true, action, retained: retained.length })}\n`,
  );
  process.exit(0);
}

assert.equal(action, "seed", "usage: seed [count] or clean");
assert.ok(
  Number.isInteger(requestedCount) && requestedCount >= 1 && requestedCount <= 500,
  "count must be an integer between 1 and 500",
);
assert.ok(
  ["pending", "rejected"].includes(requestedStatus),
  "status must be pending or rejected",
);
let sourceId = retained[0]?.id;
let generatedSource = false;
if (!sourceId) {
  const tempDir = process.env.TMPDIR ?? "/srv/vlab/tmp";
  const draftPath = join(tempDir, `${prefix}seed-PROPOSAL.md`);
  await mkdir(tempDir, { recursive: true, mode: 0o700 });
  await writeFile(
    draftPath,
    "# VLab Workshop scale fixture\n\nSynthetic proposal. Never apply.\n",
    { encoding: "utf8", mode: 0o600 },
  );
  try {
    execFileSync(
      process.execPath,
      [
        process.env.VLAB_OPENCLAW_CLI ??
          "/opt/vlab/current/node_modules/openclaw/openclaw.mjs",
        "skills",
        "workshop",
        "--agent",
        "makaron",
        "propose-create",
        "--name",
        `${prefix}seed`,
        "--description",
        "Synthetic VLab Workshop scale source",
        "--proposal",
        draftPath,
        "--json",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: process.env.VLAB_HOME ?? "/srv/vlab",
          OPENCLAW_HOME: process.env.VLAB_HOME ?? "/srv/vlab",
          OPENCLAW_STATE_DIR: stateDir,
          OPENCLAW_CONFIG_PATH:
            process.env.OPENCLAW_CONFIG_PATH ??
            "/srv/vlab/state/openclaw.json",
          OPENCLAW_WORKSPACE_DIR:
            process.env.OPENCLAW_WORKSPACE_DIR ?? "/srv/vlab/workspace",
          TMPDIR: tempDir,
        },
      },
    );
  } finally {
    await rm(draftPath, { force: true });
  }
  manifest = await readJson(manifestPath);
  sourceId = manifest.proposals.find((proposal) =>
    proposal.id.startsWith(`${prefix}seed`),
  )?.id;
  generatedSource = true;
}
assert.ok(sourceId, "could not create a synthetic Workshop source proposal");
const sourceRecord = await readJson(
  join(proposalsDir, sourceId, "proposal.json"),
);
const now = new Date().toISOString();
const synthetic = [];
for (let index = 0; index < requestedCount; index += 1) {
  const id = `${prefix}${String(index).padStart(4, "0")}`;
  const record = {
    ...sourceRecord,
    id,
    kind: "update",
    status: requestedStatus,
    title: `VLab tool parity scale fixture ${index}`,
    description: "Synthetic VLab-only proposal used to test Worker tool parity.",
    createdAt: now,
    updatedAt: now,
    createdBy: "vlab-tool-parity-test",
    statusReason:
      requestedStatus === "rejected" ? "Synthetic fixture; never apply." : undefined,
    target: {
      ...sourceRecord.target,
      skillName: "vlab-tool-parity-scale",
      skillKey: "vlab-tool-parity-scale",
    },
  };
  delete record.appliedAt;
  delete record.quarantinedAt;
  delete record.staleAt;
  delete record.rejectedAt;
  if (requestedStatus === "rejected") {
    record.rejectedAt = now;
  }
  const dir = join(proposalsDir, id);
  await mkdir(dir, { recursive: false, mode: 0o700 });
  await writeJson(join(dir, "proposal.json"), record);
  await writeFile(
    join(dir, "PROPOSAL.md"),
    "# Synthetic VLab tool parity fixture\n\nNever apply.\n",
    { encoding: "utf8", mode: 0o600 },
  );
  synthetic.push(manifestEntry(record));
}
if (generatedSource) {
  await rm(join(proposalsDir, sourceId), { recursive: true, force: true });
}

await writeJson(manifestPath, {
  ...manifest,
  updatedAt: now,
  proposals: [...synthetic, ...retained],
});
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    action,
    added: synthetic.length,
    total: synthetic.length + retained.length,
    prefix,
    status: requestedStatus,
  })}\n`,
);
