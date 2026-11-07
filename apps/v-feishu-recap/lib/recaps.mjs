// Recaps are made when someone opens the page and kept until the transcript moves past
// them, so an idle group costs nothing however often it is opened.
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export class Busy extends Error {}

export class Recaps {
  constructor({ file = null, limit = 512, concurrency = 2, forcePerMinute = 6, now = Date.now }) {
    Object.assign(this, { file, limit, concurrency, forcePerMinute, now });
    this.entries = new Map();
    this.flying = new Map();
    this.running = 0;
    this.forced = new Map();
    if (file) {
      try {
        for (const [key, value] of JSON.parse(readFileSync(file, "utf8"))) this.entries.set(key, value);
      } catch { /* no cache yet, or an unreadable one: start empty */ }
    }
  }

  persist() {
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify([...this.entries]), { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, this.file);
  }

  remember(key, value) {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    this.persist();
  }

  /** A viewer may force a remake a few times a minute; beyond that they get the cached one. */
  allowForce(viewer) {
    const minute = Math.floor(this.now() / 60_000);
    const seen = this.forced.get(viewer);
    const count = seen?.minute === minute ? seen.count : 0;
    if (count >= this.forcePerMinute) return false;
    if (this.forced.size >= 4096) this.forced.clear();
    this.forced.set(viewer, { minute, count: count + 1 });
    return true;
  }

  /** key names a chat, mark is the transcript position, make() produces the recap. */
  async get({ key, mark, force = false, viewer = "", make }) {
    const cached = this.entries.get(key);
    const current = cached?.mark === mark;
    if (current && !(force && this.allowForce(viewer))) return { ...cached, cached: true };
    const flying = this.flying.get(key);
    if (flying) return flying;
    if (this.running >= this.concurrency) {
      if (cached) return { ...cached, cached: true, stale: !current };
      throw new Busy("too_many_recaps");
    }
    this.running += 1;
    const work = (async () => {
      try {
        const value = { ...(await make()), mark, generatedAt: this.now() };
        this.remember(key, value);
        return { ...value, cached: false };
      } finally {
        this.running -= 1;
        this.flying.delete(key);
      }
    })();
    this.flying.set(key, work);
    return work;
  }
}
