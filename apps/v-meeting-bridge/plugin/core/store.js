// One JSON record per meeting under <stateDir>/v-meeting-bridge/meetings/. The record is what
// survives a Gateway restart: binding (session, chat), page token, seen event ids, lines not yet
// shown to V. Writes are atomic (tmp + rename) and serialized per record.
//
// The transcript and raw events live next to the agent's memory (transcriptDir), not here, so the
// group, the DM and memory_search all reach the same meeting.

import fs from "node:fs/promises";
import path from "node:path";

const SAFE_ID = /^[\w.-]{1,80}$/u;

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.chains = new Map();
  }

  file(id) {
    if (!SAFE_ID.test(id)) throw new Error(`bad meeting record id ${id}`);
    return path.join(this.dir, `${id}.json`);
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    return this;
  }

  save(record) {
    const file = this.file(record.id);
    const body = JSON.stringify(record, null, 2);
    const prev = this.chains.get(record.id) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(async () => {
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, body, { mode: 0o600 });
      await fs.rename(tmp, file);
    });
    this.chains.set(record.id, next);
    return next;
  }

  async list() {
    let names = [];
    try { names = await fs.readdir(this.dir); } catch { return []; }
    const out = [];
    for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
      try { out.push(JSON.parse(await fs.readFile(path.join(this.dir, name), "utf8"))); } catch { /* torn or foreign file */ }
    }
    return out;
  }
}

/** Append-only text helpers for the transcript directory. */
export async function appendLines(file, lines) {
  if (!lines.length) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, lines.map((l) => `${l}\n`).join(""));
}

export async function writeFileEnsured(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}
