# 2026.9.1 rehearsal boundaries

The compatible Worker source is developed in branch `codex/worker-openclaw91`,
based on the reviewed 0.2.8 Worker branch. Do not copy uncommitted 8.1 cutover
scripts into a production run.

The old mirror runs from a transient systemd unit, so stopping it unloads its
unit definition. Recreate it explicitly with the same isolated state, workspace,
environment file references and port. Never infer a successful restart from an
inactive unit's now-empty properties.

The initial streamed backup `vlab-mirror-pre91.INCOMPLETE.tar.zst` on the operator
machine is incomplete and is NOT a rollback source. A separate local VLab archive
must pass decompression and archive validation before mutation.
