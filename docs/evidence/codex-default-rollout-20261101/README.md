# Default harness rollout evidence, 2026-11-01

Results of `lab/candidate/harness-rollout-<name>.plan.json`, VLab candidates, for
`docs/codex-default-harness-rollout.md`. Only `rollout` and `scenario` lines are kept. Prompts are
automated test text; no real session content.

- `pin-a` default /vds. `pin-b` plus `subagents.model`. `pin-d` plus the Workboard patch.
  `pin-c` default flash with `channels.modelByChannel`.
- `policy`, `policy2` which tools reach `before_tool_call`; block, approval, slow hook, stdin.
- `hook` slow hooks and approvals with a route. `hookrepeat` the same repeated, approval held.
- `hookdelay` relay CLI started late. `hookdelay-fixed` with the relay deadline patch.
- `voice-off`, `voice-on` consult harness and spoken confirmation gate.
- `computer` 20 frames in one turn; 413 mid-turn.
- `migrate` reload plan, an existing session across the switch and back, Feishu group entries.

The 4-core host ran other jobs at the same time, so durations show mechanism, not production gain.
