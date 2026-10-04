// The relay ledger: one JSON file per relay in a directory shared by the Gateway
// and its workers. Tools (which may run in a worker) only create `queued` records;
// every later state change is made by the Gateway-only dispatcher, so there is a
// single writer per record after creation. Files survive a Gateway restart, which
// is what lets a reply that was still pending be collected and delivered later.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ID = /^r_[0-9a-z]+$/u;

export class RelayStore {
  constructor(dir) {
    if (typeof dir !== "string" || !path.isAbsolute(dir)) {
      throw new Error(`session relay store dir must be an absolute path, got ${JSON.stringify(dir)}`);
    }
    this.dir = dir;
  }

  newId(now = Date.now()) {
    return `r_${now.toString(36)}${crypto.randomBytes(3).toString("hex")}`;
  }

  file(id) {
    if (!ID.test(id)) {
      throw new Error(`invalid relay id ${JSON.stringify(id)}`);
    }
    return path.join(this.dir, `${id}.json`);
  }

  write(record) {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const file = this.file(record.id);
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);
    return record;
  }

  read(id) {
    try {
      return JSON.parse(fs.readFileSync(this.file(id), "utf8"));
    } catch {
      return null;
    }
  }

  update(id, patch, now = Date.now()) {
    const current = this.read(id);
    if (!current) {
      return null;
    }
    return this.write({ ...current, ...patch, updatedAt: now });
  }

  /** All records, oldest first. Records older than `keepMs` that are finished are pruned. */
  list({ keepMs = 7 * 24 * 3600_000, now = Date.now(), prune = false } = {}) {
    let names = [];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    const records = [];
    for (const name of names) {
      if (!name.endsWith(".json") || !ID.test(name.slice(0, -5))) {
        continue;
      }
      const record = this.read(name.slice(0, -5));
      if (!record) {
        continue;
      }
      if (prune && isFinished(record) && now - (record.updatedAt ?? record.createdAt ?? now) > keepMs) {
        fs.rmSync(path.join(this.dir, name), { force: true });
        continue;
      }
      records.push(record);
    }
    return records.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }
}

export function isFinished(record) {
  return record.status === "done" || record.status === "failed" || record.status === "interrupted";
}
