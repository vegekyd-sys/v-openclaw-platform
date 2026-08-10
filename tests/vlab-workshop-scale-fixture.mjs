import assert from "node:assert/strict";
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

const manifest = await readJson(manifestPath);
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
assert.ok(retained.length > 0, "at least one real VLab proposal is required");

const sourceId = retained[0].id;
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
