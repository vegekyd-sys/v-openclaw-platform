# Main-DM pending-delivery notice race

## Observed failure

A successful Feishu DM final reply was visible while its streaming-card finalization was still in progress. A following inbound message arrived in that interval and caused the fixed English `delivery-mirror` uncertainty notice to be emitted.

## Cause

The pending-final state uses `unknown` as a pre-dispatch marker after platform I/O starts, so a crash cannot blindly replay a possibly delivered reply. The same transition also created `pendingDeliveryNotice: owed`, although the live send still had a finalization owner. The next inbound turn consumed that premature debt before the successful finalization cleared it.

## Fix

Create notice debt only when an already-claimed `unknown` delivery is affirmed as terminally unknown (`unknown -> unknown`). Do not create it for the live pre-dispatch transition (`queued -> unknown`).

For Feishu direct messages, terminal ambiguity remains stored as `unresolved` for diagnosis but the implementation-level English sentence is not sent to the user or appended to the transcript. Other routes keep their existing recovery notice behavior.

This preserves the important safety behavior:

- successful finalization moves the delivery to `delivered` without a user notice;
- a live send failure affirms `unknown` and creates notice debt;
- a process loss after platform I/O remains recoverable as an ambiguous delivery and recovery can create the notice debt;
- a real Feishu-DM ambiguity remains visible internally as `unresolved` without exposing the fixed English implementation text;
- blind replay remains prohibited.

## Scope

Two bundled OpenClaw files change. No configuration, database schema, channel credential, model setting, or production state changes.
