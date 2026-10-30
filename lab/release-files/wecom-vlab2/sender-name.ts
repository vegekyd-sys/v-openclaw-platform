export interface SenderNameLookupUser {
  userid?: string;
  name?: string;
}

export interface SenderNameLookupPayload {
  users?: SenderNameLookupUser[];
}

export function parseSenderNameLookup(payload: unknown, userid: string): string | undefined {
  let value = payload;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  if (!value || typeof value !== "object") return undefined;
  const users = (value as SenderNameLookupPayload).users;
  if (!Array.isArray(users)) return undefined;

  const exact = users.find((user) => user?.userid === userid);
  const folded =
    exact ??
    users.find(
      (user) =>
        typeof user?.userid === "string" &&
        user.userid.toLocaleLowerCase() === userid.toLocaleLowerCase(),
    );
  const name = folded?.name?.trim();
  return name || undefined;
}

export interface SenderNameResolverOptions {
  lookup: (accountId: string, userid: string) => Promise<unknown>;
  timeoutMs?: number;
  positiveTtlMs?: number;
  negativeTtlMs?: number;
  maxEntries?: number;
}

type CacheEntry = { name?: string; expiresAt: number };

export class SenderNameResolver {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<string | undefined>>();
  private readonly timeoutMs: number;
  private readonly positiveTtlMs: number;
  private readonly negativeTtlMs: number;
  private readonly maxEntries: number;

  constructor(private readonly options: SenderNameResolverOptions) {
    this.timeoutMs = options.timeoutMs ?? 1_500;
    this.positiveTtlMs = options.positiveTtlMs ?? 10 * 60_000;
    this.negativeTtlMs = options.negativeTtlMs ?? 30_000;
    this.maxEntries = options.maxEntries ?? 1_000;
  }

  async resolve(accountId: string, userid: string): Promise<string | undefined> {
    const normalizedAccountId = accountId.trim();
    const normalizedUserid = userid.trim();
    if (!normalizedAccountId || !normalizedUserid) return undefined;

    const key = `${normalizedAccountId}\u0000${normalizedUserid}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.name;
    if (cached) this.cache.delete(key);

    let task = this.inflight.get(key);
    if (!task) {
      task = this.options
        .lookup(normalizedAccountId, normalizedUserid)
        .then((payload) => parseSenderNameLookup(payload, normalizedUserid))
        .catch(() => undefined)
        .then((name) => {
          this.remember(key, name);
          return name;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, task);
    }

    return await this.waitWithinBudget(task);
  }

  private remember(key: string, name: string | undefined): void {
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (typeof oldest === "string") this.cache.delete(oldest);
    }
    this.cache.set(key, {
      name,
      expiresAt: Date.now() + (name ? this.positiveTtlMs : this.negativeTtlMs),
    });
  }

  private async waitWithinBudget(task: Promise<string | undefined>): Promise<string | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), this.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
