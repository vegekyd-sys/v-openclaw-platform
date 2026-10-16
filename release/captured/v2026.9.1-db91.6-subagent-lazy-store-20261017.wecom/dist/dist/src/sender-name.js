export function parseSenderNameLookup(payload, userid) {
    let value = payload;
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        }
        catch {
            return undefined;
        }
    }
    if (!value || typeof value !== "object")
        return undefined;
    const users = value.users;
    if (!Array.isArray(users))
        return undefined;
    const exact = users.find((user) => user?.userid === userid);
    const folded = exact ??
        users.find((user) => typeof user?.userid === "string" &&
            user.userid.toLocaleLowerCase() === userid.toLocaleLowerCase());
    const name = folded?.name?.trim();
    return name || undefined;
}
export class SenderNameResolver {
    options;
    cache = new Map();
    inflight = new Map();
    timeoutMs;
    positiveTtlMs;
    negativeTtlMs;
    maxEntries;
    constructor(options) {
        this.options = options;
        this.timeoutMs = options.timeoutMs ?? 1_500;
        this.positiveTtlMs = options.positiveTtlMs ?? 10 * 60_000;
        this.negativeTtlMs = options.negativeTtlMs ?? 30_000;
        this.maxEntries = options.maxEntries ?? 1_000;
    }
    async resolve(accountId, userid) {
        const normalizedAccountId = accountId.trim();
        const normalizedUserid = userid.trim();
        if (!normalizedAccountId || !normalizedUserid)
            return undefined;
        const key = `${normalizedAccountId}\u0000${normalizedUserid}`;
        const cached = this.cache.get(key);
        if (cached && cached.expiresAt > Date.now())
            return cached.name;
        if (cached)
            this.cache.delete(key);
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
    remember(key, name) {
        if (this.cache.size >= this.maxEntries) {
            const oldest = this.cache.keys().next().value;
            if (typeof oldest === "string")
                this.cache.delete(oldest);
        }
        this.cache.set(key, {
            name,
            expiresAt: Date.now() + (name ? this.positiveTtlMs : this.negativeTtlMs),
        });
    }
    async waitWithinBudget(task) {
        let timer;
        try {
            return await Promise.race([
                task,
                new Promise((resolve) => {
                    timer = setTimeout(() => resolve(undefined), this.timeoutMs);
                }),
            ]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
}
