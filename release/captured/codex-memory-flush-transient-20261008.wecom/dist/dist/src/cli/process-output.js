export class BoundedOutputCollector {
    maxBytes;
    keep;
    buffer = Buffer.alloc(0);
    originalBytes = 0;
    constructor(maxBytes, keep = "head") {
        this.maxBytes = maxBytes;
        this.keep = keep;
    }
    append(chunk) {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        this.originalBytes += data.length;
        if (this.maxBytes <= 0)
            return;
        if (this.keep === "head") {
            const remaining = this.maxBytes - this.buffer.length;
            if (remaining > 0)
                this.buffer = Buffer.concat([this.buffer, data.subarray(0, remaining)]);
            return;
        }
        if (data.length >= this.maxBytes) {
            this.buffer = Buffer.from(data.subarray(data.length - this.maxBytes));
            return;
        }
        const combined = Buffer.concat([this.buffer, data]);
        this.buffer =
            combined.length <= this.maxBytes
                ? combined
                : Buffer.from(combined.subarray(combined.length - this.maxBytes));
    }
    result() {
        let text = this.buffer.toString("utf8");
        if (this.keep === "head")
            text = text.replace(/\uFFFD+$/, "");
        else
            text = text.replace(/^\uFFFD+/, "");
        return {
            text,
            originalBytes: this.originalBytes,
            truncated: this.originalBytes > this.buffer.length,
        };
    }
}
