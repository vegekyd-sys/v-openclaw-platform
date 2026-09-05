# Astra alias / native Codex integration acceptance

Request: Makaron `astra` selects `openai/gpt-6-astra`, native `codex`, thinking `high`.
Do not change primary defaults or weaken the configuration assistant's permissions.

Production read-only findings:
- Makaron had a Codex-specific `vcodex` entry, but no Astra override. Astra inherited Worker/low.
- The configuration assistant timed out and reported no permission to write model metadata; the requested alias update never applied.
- Production already points to `/opt/codex-0.153.4-v/.../codex`. Recheck its real version before promotion; do not reinstall unnecessarily.
- Primary defaults changed concurrently by other conversations. Preserve the latest values and apply only the exact model metadata delta.

Shared VLab findings and preparation:
- Old explicit OpenAI auth order referenced an unavailable profile in Makaron. Added only an existing VLab access-token-only profile; no production credential or refresh-token copy.
- Command owner list still used the production application's sender identity. Mapped Tianyi's actual Lab identity so native slash commands are actually authorized.
- Shared Codex binary was old despite private Astra instance using 0.153.4. Real Astra execution returned HTTP 400 requiring a newer Codex. Copied the verified runtime into the shared generation's own versioned directory; no writable cross-instance binary reference.
- Native 9.1 supports `/model astra -s`. Without `-s`, an owner's selection may persist an Agent default. Do not use bare `/model` or admin `sessions.patch model` for session-only tests.

Acceptance at 2026-09-05 16:26–16:30 Asia/Shanghai:
- Real Feishu `/model astra -s`: explicit visible confirmation that configured defaults were unchanged.
- Actual Codex `bash` output `ASTRA_ALIAS_TOOL_OK`, followed by visible `ASTRA_ALIAS_REPLY_OK`.
- Gateway history: model `gpt-6-astra`, provider `openai`, runtime `codex`, thinkingLevel/default `high`, status `done`, runtime 22,756 ms.
- Makaron's Lab primary remained DeepSeek Pro. Earlier Worker replies and failed old-binary runs are NOT Codex acceptance.
- Browser acceptance is a separate gate and is not implied by this result.

Lab backups: generation `backups/astra-codex-alias-20260905` (restricted, never in Git).
Production: not deployed at this checkpoint.
