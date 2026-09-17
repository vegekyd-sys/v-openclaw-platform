# V Claude Code harness (`/vcc`)

`/vcc` is V's Claude Code harness, the Anthropic counterpart of `/vcodex`.
Both are model aliases: typing `/vcc` in a V session switches that session's
model, `/vcodex` switches to the Codex app-server runtime.

| Alias | Model ref | Agent runtime | Thinking |
| --- | --- | --- | --- |
| `/vcodex` | `openai/gpt-5.6-sol` | `codex` (Codex app-server) | `medium` |
| `/vcc` | `anthropic/claude-opus-5` | `claude-cli` (Claude Code / Agent SDK) | `high` |

`claude-cli` is a CLI backend, not an embedded harness: OpenClaw keeps the model
ref canonical (`anthropic/claude-opus-5`) and executes the prepared turn through
the installed Claude Code executable via Anthropic's Agent SDK.

## Host requirements

- Claude Code CLI installed for the Gateway user: `/home/openclaw/.npm-global/bin/claude`.
  That directory is already on `openclaw-gateway.service`'s `PATH`.
- A Claude subscription login owned by the CLI itself. OpenClaw never reads,
  persists, or refreshes those tokens; it probes `claude auth status --json` and
  derives a synthetic auth entry when `loggedIn` is true. No `anthropic:*` auth
  profile is required for this route.

Install and log in as the Gateway user:

```bash
sudo -u openclaw -H bash -lc 'npm install -g @anthropic-ai/claude-code'
sudo -u openclaw -H /home/openclaw/.npm-global/bin/claude auth login --claudeai
sudo -u openclaw -H /home/openclaw/.npm-global/bin/claude auth status --text
```

`-H` is required: without it `sudo` keeps the caller's `HOME` and the login
lands outside `/home/openclaw/.claude`. `/home/openclaw/.npm-global/bin` is on
the service `PATH` but not on the `openclaw` user's interactive `PATH`, so call
`claude` by absolute path.

`claude auth login` is interactive: it prints an authorization URL and waits for
the code to be pasted back into the same invocation, so it has to be run by a
human on a terminal, not scripted.

## Gateway config

Three additive edits in `/home/openclaw/.openclaw/openclaw.json`, all applied
with `openclaw config set ... --merge` and hot-reloaded without a restart:

```json5
{
  agents: {
    defaults: {
      models: {
        "anthropic/claude-opus-5": {
          agentRuntime: { id: "claude-cli" },
          alias: "vcc",
          params: { thinking: "high" },
        },
      },
      modelPolicy: { allow: ["...", "anthropic/claude-opus-5"] },
    },
    entries: {
      makaron: {
        models: {
          "anthropic/claude-opus-5": {
            alias: "vcc",
            params: { thinking: "high" },
            agentRuntime: { id: "claude-cli" },
          },
        },
      },
    },
  },
}
```

`modelPolicy.allow` matters: the model entry existed before but was not allowed,
so selection would have been rejected. The `makaron` entry mirrors how `vcodex`
is declared both in `agents.defaults` and on the main agent.

`params.thinking: "high"` maps to `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` plus
`MAX_THINKING_TOKENS=16384` in the Claude Code process. Opus 5 is not one of the
mandatory-adaptive-thinking models, so the level is honoured.

## Verification

```bash
sudo -u openclaw -H /home/openclaw/.npm-global/bin/claude auth status --text
sudo -u openclaw -H openclaw models list --provider anthropic     # anthropic/claude-opus-5 ... alias:vcc
sudo -u openclaw -H openclaw agent --agent makaron --session-key vcc-smoke \
  --model anthropic/claude-opus-5 --message "Reply with exactly: VCC_OK"
```

`openclaw agent` runs through the Gateway by default, so this exercises the real
path rather than a local embedded run. Use a scratch `--session-key` and delete
it afterwards with `openclaw sessions delete "agent:makaron:vcc-smoke" --agent
makaron --yes`.

Confirm the route in the Gateway journal rather than trusting the reply alone:

```
[agent/cli-backend] cli exec: provider=claude-cli model=claude-opus-5 ...
[agent/cli-backend] cli turn: provider=claude-cli model=claude-opus-5 durationMs=... 
```

And confirm the thinking level actually reached the Claude Code process:

```bash
sudo bash -c 'tr "\0" "\n" < /proc/$(pgrep -u openclaw -f "claude --output-format")/environ' \
  | grep -E "MAX_THINKING_TOKENS|ADAPTIVE_THINKING|CLAUDE_CODE_OAUTH"
```

Expected: `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` and
`MAX_THINKING_TOKENS=16384`, with **no** `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR`
— its absence is the proof that the run uses the CLI's own subscription login
instead of an OpenClaw-forwarded credential.

Rollout result on 2026-09-17: `VCC_OK` returned in 7.0s through the Gateway on
`provider=claude-cli model=claude-opus-5`, thinking env as above, Gateway
`NRestarts=0`. The `/vcodex` route was checked in the same pass and still
resolves to Codex; it answered with a subscription-quota message, which is a
pre-existing Codex usage-limit condition and not a regression from this change.

## Login gotchas

`claude auth login` prints an authorization URL and waits for a `code#state`
string of ~100 characters. Failure modes seen during rollout:

- Submitting an empty line gives the same
  `Login failed: Request failed with status code 400` as a wrong code; the error
  comes from `POST https://platform.claude.com/v1/oauth/token`.
- A truncated paste fails earlier and more usefully with
  `Invalid code. Please make sure the full code was copied.` Pasting long
  strings through `tmux` over `ssh -t` truncated it repeatedly; running the
  login directly over `ssh -t` (no tmux) worked. Use the authorize page's Copy
  button rather than a manual selection.
- The process exits immediately on failure, so a tmux window without
  `remain-on-exit on` disappears before the error can be read. Add
  `--debug-file /tmp/vcc-debug.log` when a failure needs diagnosing.

## Rollback

Restore the pre-change config backup and let the Gateway hot-reload:

```bash
sudo cp -a /home/openclaw/.openclaw/openclaw.json.bak-vcc-<timestamp> /home/openclaw/.openclaw/openclaw.json
```

The backup taken for the 2026-09-17 rollout is
`openclaw.json.bak-vcc-20260917-015848`. Restore with `cp -a`, never by
re-serializing the JSON: a reformat changes `configSha` and breaks later
deploy assertions.

Removing the alias does not uninstall Claude Code; `npm uninstall -g
@anthropic-ai/claude-code` and `claude auth logout` are separate, and only
needed if the subscription login must be revoked from the host.
