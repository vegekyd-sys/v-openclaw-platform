# Feishu owner-DM approvals

On 2026-10-03 an OpenClaw change approval for a Feishu group conversation went to
Tianyi's Telegram DM. The Feishu plugin (9.1, and upstream main as of 2026-10-03)
only implements approval *authorization*. System-agent approvals use
`deliverRequest: () => false` and reach chat only through a channel's native
approval runtime. Only telegram, discord, slack, matrix, msteams and googlechat
provide one, so Feishu never showed these cards.

This release adds that native runtime to the Feishu plugin, following the Telegram
implementation:

- **Who receives the cards.** Approvers are the Feishu entries of
  `commands.ownerAllowFrom` (`feishu:ou_...`). open_ids are app-scoped, so V and
  VLab each list their own. With no Feishu owner configured, nothing changes: the
  stock `allowFrom` approval auth stays in effect.
- **What is delivered.** Exec, plugin and system-agent (OpenClaw change) approvals
  are sent as a Card 2.0 card to the owner's DM. The card has 批准 / 总是允许 /
  拒绝 buttons, plus a Control UI link when `gateway.publicOrigin` is set.
  Approvals started in other channels or the Control UI also go to the DM. An
  approval bound to a specific Feishu account stays on that account. When the
  request came from a Feishu chat, Gateway core posts its standard "sent to DMs"
  notice in that chat.
- **What a click does.** Only the owner's click is accepted. It goes to Gateway
  `approval.resolve` with the canonical kind and the clicker as reviewer, so the
  Gateway re-checks authorization. The click returns only a toast, within the
  3-second callback deadline. When the resolved or expired event arrives, the
  native runtime repaints the card to 已批准 / 已拒绝 / 已过期 / 已取消 and
  removes the buttons. For system changes the card also says whether the change
  was written.
- **`/approve`.** In Feishu, `/approve` is restricted to the same owner set.

## Files

`patch.mjs INPUT_DIST OUTPUT_DIR` writes three files:

- `v-feishu-approvals.js` (new): `core.mjs` and `module.mjs`, with the chunk aliases
  read from the baseline's own export statements.
- `channel-*.js`: `approvalCapability` becomes
  `createVFeishuApprovalCapability(feishuApprovalAuth)`.
- `monitor.account-*.js`: approval clicks are handled before the ask-user and
  secret-entry handlers, and each monitored account registers the native approval
  runtime context.

Anchors must match exactly once. A patched input is left unchanged. `dist/` holds
the output generated from VLab release `feishu-ask-chat-answer-v1` (which is
aligned with V). The candidate fails if regeneration from the live baseline
differs from it.

## Validation

```sh
node --test tests/feishu-dm-approvals.test.mjs
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate --repo "$PWD" --owner TASK \
  --plan "$PWD/lab/candidate/feishu-dm-approvals.plan.json"
```

The candidate runs a private Gateway on the real VLab config. Feishu runs in
loopback webhook mode, so no second WebSocket consumer is opened for the shared
bot, but the native approval handler does start. It creates real plugin approvals
over Gateway RPC, and real cards are delivered to the owner's VLab DM. It then
synthesizes owner and non-owner clicks through the patched click handler and
reads the cards back via the Feishu message API. Cases covered: approve, deny,
expire, non-owner rejection, and a second click on a resolved approval.

## Deployment notes

- The code overlay touches only the Feishu plugin dist. Config is separate: add
  `commands.ownerAllowFrom: ["feishu:<owner open_id for that app>"]` on VLab (V
  already has it).
- Turning Telegram off is a V config change: set
  `channels.telegram.execApprovals.enabled: false` and `approvals.plugin.enabled:
  false` (that forwarder currently targets Telegram).
- Not covered: the core restart decision for restart-requiring config keys. A
  card for `browser.extraArgs` still does not warn that approval restarts the
  Gateway.
