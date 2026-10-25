# Feishu phone entry migration

Managed legacy group menus still referenced fixed owner phone aliases, which sent external users to the old app OAuth page. The original owner DM pilot used a queryless URL and opened outside Feishu. Menus/tabs now converge on an exact account/conversation URL; group desktop links use the Feishu sidebar and DM tabs use the built-in browser.

The module preserves menu/tab IDs, sibling entries and unrelated fields. It rejects duplicate names, foreign hosts, other accounts/conversations, and credential URLs. Private inventory is required for non-derivable historical DM aliases and the original queryless DM pilot. Each write is followed by a structural readback; a lost response cannot cause a duplicate retry.

## Evidence

- 19 focused tests passed locally and in server Candidate `candidate-6c066c5b-6dc6-4723-9fef-16b1c38a9f35`, on `dingtalk-outbound-20261025` runtime. Candidate execution took 10.9 seconds including transfer and preparation. Shared Gateway PID was unchanged.
- Candidate/runtime module SHA-256: `6c3b8c2adebf3ce1fd0f47a90cd2fb9d794f499609bae69539f7b610a57912d5`.
- Production Feishu data migration discovered all 421 current bot groups through five pages, plus recoverable historical DMs. All 421 groups and 56 DMs have verified canonical entries: 433 updated, 42 created, 2 already correct.
- Four historical DMs are blocked by Feishu `232024` app visibility/collaboration permissions. Two failed reads; two allowed reads but rejected creation, confirmed by a targeted retry. One further historical conversation is dissolved. These are not counted as migrated.
- Thirteen historical direct-user identifiers still lack a recoverable native chat ID after metadata reconciliation and read-only lookup. These identifiers may overlap other historical records; they are not a separate count of active chats. Entry events supply the exact chat ID when a reachable user opens a private chat again.
- No messages, voice calls, paid model requests, shared Gateway writes or service restarts were initiated by this migration. Each conversation's before/after API objects are in private server backups, outside Git.

Feishu documents `232024` as app visibility or collaboration restrictions: https://open.feishu.cn/document/server-docs/group/chat-menu_tree/get

## Operator

`scripts/inventory-feishu-phone-entries.py` reads only conversation/session delivery metadata from SQLite in read-only mode and the private phone mapping; it does not read messages or copy a database. Its output is private and includes unresolved users rather than treating missing metadata as success.

`scripts/migrate-feishu-phone-entries.mjs` accepts `--login`, `--inventory`, `--output`, `--base` and `--account`. Default mode records planned changes without writing Feishu. `--apply` performs the same reconciled operation; `--only` limits a retry to comma-separated chat IDs already found in the full inventory. Each output directory must be new. Credentials remain inside the process and output files are mode-restricted.

## Initial candidate boundary

At the initial candidate checkpoint, this branch was not merged or deployed. The external Feishu menu/tab data repair is already applied as described above. Future event handling changes require Tianyi's explicit dev merge approval, the shared VLab integration gate and the normal platform release. Existing Gateway hooks for group-added, DM-entered and first-message events are retained.

Old bookmarked browser links are handled separately by v-voice PR #148. That Voice candidate preserves fixed custom entries, protected APIs and device grants. Its initial candidate checkpoint was not a deployment.

## Shared integration on 2026-10-26

Tianyi subsequently authorized merge, release and restart. Platform PR #476 merged at dev `396e3146f763e1b4939280fb842ad913ae385d31`. The exact npm plugin module was deployed as `feishu-phone-entry-20261026` and all 19 tests imported that installed module successfully. This corrects a limitation of the original Candidate plan: its overlay target named an unused core package path, while its tests covered the source module. Shared integration used the actual npm plugin path.

Shared health RPC passed. A read-only probe against the isolated Lab bot discovered 35 groups and exercised 101 real API reads; 31 planned writes were deliberately blocked and four existing menu conflicts rejected. These are API compatibility and rejection checks, not evidence of real new menu creation. Real writes and readbacks are covered by the 477 production menu/tab migrations with the identical module bytes.

Production activation, alignment and Voice fleet completion are recorded in the release receipt once verified.

