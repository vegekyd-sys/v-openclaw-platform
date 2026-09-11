# Native Memory search query isolation

## Incident found by final VLab regression

The VLab mirror carried a production-derived Makaron memory index but did not carry the corresponding `memory/` source corpus. The first real `memory_search` after aligning the Gemini embedding configuration returned the new 25-second timeout, while its detached on-search sync continued in the Gateway process and reconciled the stale mirror index from 3,690 files / 31,472 chunks to the four files visible in VLab.

Production was read-only checked over Tailscale and was not changed. It still had 3,809 files / 32,174 chunks with the same index scope hash. This proves the VLab deletion was mirror-source drift, not a Native execution difference, and also proves that a tool-layer timer alone does not cancel source reconciliation.

## Repair

Interactive `memory_search` acquires a short-lived `search` manager. The manager may read the published index and create the bounded query embedding, but it does not start watchers, startup catch-up, on-search synchronization, first-index bootstrap, or missing-identity rebuild. CLI indexing keeps its existing `cli` purpose and behavior. Search managers are closed after each tool call.

This separates the user-facing query latency contract from index maintenance. An absent or incompatible index fails closed with the existing status/rebuild guidance instead of turning a search request into an unbounded write operation.

## Release boundary

This is a follow-up patch discovered during VLab acceptance. It is intentionally isolated in its own worktree and must not be merged into `dev` or deployed to shared VLab until the user approves that new patch.
