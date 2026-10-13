export interface SenderNameLookupUser {
    userid?: string;
    name?: string;
}
export interface SenderNameLookupPayload {
    users?: SenderNameLookupUser[];
}
export declare function parseSenderNameLookup(payload: unknown, userid: string): string | undefined;
export interface SenderNameResolverOptions {
    lookup: (accountId: string, userid: string) => Promise<unknown>;
    timeoutMs?: number;
    positiveTtlMs?: number;
    negativeTtlMs?: number;
    maxEntries?: number;
}
export declare class SenderNameResolver {
    private readonly options;
    private readonly cache;
    private readonly inflight;
    private readonly timeoutMs;
    private readonly positiveTtlMs;
    private readonly negativeTtlMs;
    private readonly maxEntries;
    constructor(options: SenderNameResolverOptions);
    resolve(accountId: string, userid: string): Promise<string | undefined>;
    private remember;
    private waitWithinBudget;
}
