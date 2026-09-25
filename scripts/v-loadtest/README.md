# V production load test

Drives real sessions through the real channel at a chosen concurrency, then
reads the results back out of production telemetry.

    python3 run-stage.py --concurrency 30 --stage C
    python3 collect.py --stage C
    python3 analyze.py stage-C.json

`tasks.py` holds six templates: three short three-step tasks and three long
five-step ones, all with tool calls, so the load resembles real work rather than
a prompt flood.

## Rules learned the hard way

- **Wait for steady state.** Gateway uptime moves first-token latency more than
  concurrency does: the same code measured 201s at 15 hours of uptime and 80s at
  32 minutes. A test run 8 minutes after a restart charges cold-start cost to
  whatever you are testing. Wait for uptime over 20 minutes, RSS drift under
  200MB between samples, and zero liveness warnings, three cycles running.
  `gate.sh` checks this.
- **Never stack a load test on an existing fault.** It has taken production down.
- **Both sides of an A/B need comparable uptime.** State it explicitly when they
  do not.
- A clean A/B on the shared lab instance does not carry to production. The lab
  has half the cores and a smaller heap, and its numbers stop being predictive
  right around the concurrency knee.

`gate.sh` aborts on: Gateway RSS over 9G, event-loop P99 over 1000ms, any
stalled session, disk under 20G, host memory under 4G, any OOM, any restart.
