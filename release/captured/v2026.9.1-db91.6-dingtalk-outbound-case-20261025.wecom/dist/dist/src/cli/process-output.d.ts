export type CollectedOutput = {
    text: string;
    originalBytes: number;
    truncated: boolean;
};
export declare class BoundedOutputCollector {
    private readonly maxBytes;
    private readonly keep;
    private buffer;
    private originalBytes;
    constructor(maxBytes: number, keep?: "head" | "tail");
    append(chunk: Buffer | string): void;
    result(): CollectedOutput;
}
