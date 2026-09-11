# Worker first-command readiness candidate 2026-09-12

## Evidence

The first readiness candidate moved the process-local prepared-model work from
the first request into Worker startup: the measured prepared-runtime span fell
from 5.383 s to 0.171 s. It did not remove the whole cold-process penalty. On
the first real Agent command in a newly spawned process, command entry still
preceded bundle preparation by about 6.7 s; a process that had already handled
one turn needed about 1.4 s in the same C5 run.

The Agent command chunk owns fourteen lazy module loaders used by session,
skills, ACP, delivery, transcript, compaction, and attempt preparation. They
were intentionally lazy for CLI startup, but a Worker is a long-lived serving
process: charging their first import to an admitted user request makes elastic
expansion visible as first-text latency.

An isolated compatibility run against the exact installed VLab runtime loaded
the candidate command chunk and all fourteen runtimes in 5.215 s without an
Agent, model, or tool request. That independently accounts for the measured
new-process command gap before the live candidate is deployed.

## Candidate

The Agent command chunk and its semantic public facade now expose
`prewarmAgentCommandRuntimes()`, which only loads those existing modules. The
opt-in Worker readiness pass calls it after acquiring the same static
prepared-model lease and before reporting `ready`.
It does not create a session, write a transcript, invoke a model, or run a
tool. If the exact OpenClaw command runtime does not expose the contract or an
import fails, readiness reports `deferred-to-normal-turn` and preserves the
old fail-open behavior.

The artifact changes only the Agent command chunk, its two-line semantic
facade, and the existing opt-in runtime-prewarm helper. VLab configuration separately sets
`warmSpareWorkers: 0` during the final min1/min5 comparison so an unrequested
sixth Worker cannot compete with admitted traffic. Production V is outside
this candidate.

## Acceptance

Acceptance requires the installed-runtime compatibility check, a fresh-process
C1 proving that command-entry-to-bundle latency moved before `ready`, repeated
C1/C5/C10/C15 with HTTP/RPC, event-loop, memory and OOM gates, same-background
min1 versus min5 comparison, Worker generation reload coverage, and a visible
VLab Feishu reply with process streaming and final delivery. The release stays
unaccepted if readiness itself overlaps admitted traffic or merely shifts the
stall elsewhere.
