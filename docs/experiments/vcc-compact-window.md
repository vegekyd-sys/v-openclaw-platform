# /vcc: auto-compaction only fires 3% below the 1M limit (2026-10-11)

## Incident

Production V, group `oc_5f39adc3…` ("V｜Computer Use 研究｜1003"), `/vcc`
(claude-opus-5-5 on the claude-cli harness), 12:30 CST. V was logging in to JD
by QR code in its browser. The turn failed with

```
cli terminal failure: provider=claude-cli ... error=Prompt is too long ·
automatic compaction failed: API Error: Request size exceeds model context window
```

and the user got the English card "Auto-compaction could not recover this turn".

## What was actually in the context

Claude Code's own transcript for the bound session
(`/home/openclaw/.claude/projects/-home-openclaw-makaron-openclaw--openclaw-local-workspace/fe191fc0-….jsonl`,
7.6 MB):

- **One Claude Code session, resumed for eight days** (10-03 → 10-11), never
  compacted. Context per model call grew 102k → 683k (10-10 09:11) → 947k
  (10-11 12:21) → **976,091 tokens** on the last successful call (12:29:45).
  The next call was rejected and the reactive compaction could not fit either.
- **Not screenshots.** The whole file holds 3 images (two 1200 px browser
  screenshots of ~100 KB each and one 576 px QR code), and the failing turn only
  added ~250 KB. The 15-minute turn before it was mostly `browser` snapshots
  and Bash polling.
- The session had cost $92.5; every call re-read ~950k cached tokens.
- The next message (15:51) started with an automatic compaction at
  `preTokens=980,310` that took 87 s and succeeded, so the session recovered on
  its own; only the 12:30 turn was lost.

## Cause

OpenClaw maps the run's context budget to Claude Code's
`CLAUDE_CODE_AUTO_COMPACT_WINDOW` (`extensions/anthropic/cli-shared.ts`,
`resolveClaudeCliAutoCompactEnv`). For the Claude 5 models that budget is their
native 1M window, so the claude child gets `CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000`
(verified in candidate from `/proc/<claude>/environ`). Claude Code's threshold is
the window minus a 33k buffer, i.e. ~967k: compaction runs within 3% of the hard
limit, where neither one more tool round nor the compaction request itself
reliably fits. Without the env value Claude Code's own default for these models
is also 1M (`/autocompact` on 2.1.280: "1m tokens (default for this model)").

## Fix

`{"env": {"CLAUDE_CODE_AUTO_COMPACT_WINDOW": "500000"}}` in the Gateway user's
`~/.claude/settings.json`, managed by
`scripts/configure-v-claude-code-compact-window.mjs check|apply|restore`.

- OpenClaw always launches claude with `--setting-sources user`, and a
  user-settings `env` value overrides the one OpenClaw injects. Claude Code
  still clamps it to the model window: runs on a 200k window keep 200k.
- 500k is Claude Code's own default auto-compact window for 1M models on its
  agent surfaces. Compaction then fires at ~467k with ~530k tokens of headroom
  for the compaction request and for anything a single tool round adds; per-call
  cache reads stay under half of today's worst case.
- No OpenClaw config, no Gateway restart. Each claude process reads the setting
  when it starts (an idle warm process is recycled after 10 min).

Rejected: OpenClaw's own per-model cap,
`models.providers.anthropic.models[].contextTokens`. It does reach Claude Code
(candidate: `window=150000`), but on 9.1 `claude-opus-5-5` is not in the static
catalog — it is generated from the Opus 5 template — and a configured row with
that id replaces the generated entry: `models.list` loses `contextWindow`,
`reasoning`, `thinkingLevels` and `thinkingDefault` for it. The tool surface
stayed the same (122 tools, `computer`/`browser` included), but thinking-level
handling would silently change.

## Validation (candidate, production versions)

Claude Code **2.1.280** installed privately (as in `vcc-background-tasks.md`),
model `anthropic/claude-opus-5-5` on claude-cli, a real OpenClaw Gateway on a
copy of shared VLab's config.

`lab/candidate/vcc-compact-window.mjs` — one turn views 45 generated 1200×800
"screenshots" one at a time with `Read` (each an image block in a tool result,
like browser/computer screenshots) and writes down the code on each. A 150k
window stands in for 500k so the threshold is reachable in one turn.

| | baseline (`…-baseline.plan.json`) | fix (`….plan.json`) |
|---|---|---|
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` OpenClaw injected | 1000000 | 1000000 |
| settings env reaching claude | none | 150000 (`--settings` via a PATH wrapper) |
| compactions in the turn | **0** (peak 153,073 tokens) | **2, `trigger=auto`**: after screenshot 20 at 117,976 tokens and after screenshot 45, 16–17 s each |
| turn | completed in 160 s, 45/45 viewed | completed in 136 s, 45/45 viewed, peak context 115,766 |
| first / last code after compaction | — | both correct |
| candidate | `candidate-58b968cd-6c14-4a1e-9ed3-62ee04c13211` | `candidate-4741fd66-2c55-475c-b13b-c5e87a6904d0` |

The baseline asserts its peak passes the fix's threshold, so the fix's
compactions are caused by the window and not by a different workload. The test
leaves the shared HOME's user settings alone and brings the same env block in
through `--settings`; the user-settings layer itself is covered by:

`lab/candidate/vcc-compact-window-precedence.sh` — Claude Code's local
`/autocompact` and `/context` (no API call) on 2.1.280 with OpenClaw's flags:

| settings env | injected by OpenClaw | effective window |
|---|---|---|
| 500000 | 1000000 | **500k** |
| none (production today) | 1000000 | 1m |
| 500000 | 200000 + `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` | 200k ("capped to 200k by model") |

Candidate `candidate-566c2c09-9d0e-412b-a5f1-ea03f5a1d8aa`.

## Notes for next time

- OpenClaw's `view_image` does not put the image into Claude Code's context
  under claude-cli: it hands it to the configured image model (VLab has no key
  for it) and returns text.
- The test cleans up its Claude Code transcripts from the shared HOME.
- VLab's claude login can hit "Failed to refresh OAuth token: another Claude
  Code process is refreshing it"; a retry a minute later worked.
