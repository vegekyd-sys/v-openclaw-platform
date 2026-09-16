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
sudo -u openclaw bash -lc 'npm install -g @anthropic-ai/claude-code'
sudo -u openclaw -i claude auth login --claudeai
sudo -u openclaw bash -lc 'claude auth status --text'
```

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
sudo -u openclaw openclaw models status --agent makaron   # Aliases: vcc -> anthropic/claude-opus-5
sudo -u openclaw openclaw models list --provider anthropic
sudo -u openclaw openclaw agent --agent makaron --model anthropic/claude-opus-5 --message "hi"
```

A green `models status` is not acceptance on its own: confirm a real V reply
after `/vcc` in a live session, and confirm `/vcodex` still routes to Codex.

## Rollback

Restore the pre-change config backup and let the Gateway hot-reload:

```bash
sudo cp -a /home/openclaw/.openclaw/openclaw.json.bak-vcc-<timestamp> /home/openclaw/.openclaw/openclaw.json
```

Removing the alias does not uninstall Claude Code; `npm uninstall -g
@anthropic-ai/claude-code` and `claude auth logout` are separate, and only
needed if the subscription login must be revoked from the host.
