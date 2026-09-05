# WeCom 9.1 production deployment and regression

Target: production V, OpenClaw 2026.9.1. Times below are Asia/Shanghai.

## Released scope

- Installed plugin `2026.8.17-vlab.2` using the native installer and reviewed, unchanged capability declaration.
- Artifact SHA-256: `2ac843d6455c34f30c33c0cf7bd75a5d16fb23e3b170dd134af3e60e5e0875a7`.
- Shared business-tool wrapper now obtains trusted native per-invocation runtime configuration. This fixes the common entry for contacts, documents, calendar, meetings, todo, disk and other commands; it is not a per-command Worker parameter patch.
- Original sender-name lookup, fallback, cache and transport code remain unchanged. Main/Worker configurations remained unchanged during installation; no model or concurrency changes.

## Deployment timeline

- 02:10:14.855: restart after native health and both active/pending counts reached zero. No active business task was killed.
- 02:10:40.231: WeCom WebSocket connected; heartbeat followed.
- 02:10:41.375: Feishu WebSocket ready, approximately 27 seconds after restart.
- 02:11:11.719: real Feishu main-DM ingress for `WECOM91_FEISHU_OK_0211`.
- 02:12:16.910: dispatch complete, one reply. Lark API readback confirmed the actual card contains the expected token (Codex runtime / Astra). This roughly 65-second request is a functional pass, not a latency benchmark pass.
- 02:17:22.024: subsequent WeCom WebSocket reply send logged.
- 02:18:12.391: native `message aibot send` returned without tool/API error for one `WECOM91_DELIVERY_OK` smoke in the freshly enumerated, uniquely resolved `V 测试` group. This is send-path evidence, not a user's visual confirmation.

## Verified after install

| Gate | Evidence |
| --- | --- |
| Native contacts | One user result, real payload parsed |
| Native documents | API `errcode=0` |
| Native disk | Three files |
| Native calendar / meetings / todo | Successful API responses; empty collections are valid |
| Recent bot conversations | Fresh list resolves the intended test group |
| Isolated Worker | Real `vlab-worker` / DeepSeek Pro run, two actual `wecom-cli` tool results parsed (contact + documents), final `WECOM91_WORKER_OK` |
| Feishu visible reply | Exact token confirmed in actual reply card |
| Service | Active, PID1171400, NRestarts=0; health OK; two Workers ready, pending=0 at final snapshot |
| Preserved files | monitor, sender-name, message-sender and plugin manifest match the immutable candidate; these files were unchanged from vlab.1 |

Current service memory snapshot: 3,364,347,904 bytes; peak 9,234,030,592 bytes. One real WeCom direct conversation was active at the snapshot; do not restart it merely to obtain idle status.

## Explicit limits

- VLab's current integration instance has no configured WeCom credentials. Hermetic/native-context checks were done there, but real authorized business regression was performed on production under the user's explicit approval. Do not describe it as a complete Lab bot ingress acceptance.
- Successful API reads and common-wrapper adaptation do not prove all document writes, email sends, media formats, enterprise policies or multi-user live group ingress. Original sender behavior is preserved, not newly re-accepted by two humans this run.
- Recent bot conversation listing does not grant company-wide historical-message access.
- The earlier cold-start delay and Browser repair are separate investigations. Browser production acceptance is not claimed here.

## Rollback

Backup: `/home/openclaw/.openclaw/backups/wecom-native-config-20260906`.

When explicitly authorized, run the pinned deployment helper with `rollback` via Tailscale and verify real Feishu/WeCom replies afterward:

```sh
sudo /opt/node-v22.23.1/bin/node /home/openclaw/.openclaw/backups/wecom-native-config-20260906/deploy.mjs rollback
```

It reinstalls the saved vlab.1 package, preserves current main/Worker configuration and restarts the Gateway. This restores the prior transport baseline but also restores the known 9.1 business-tool bug. Never run old OpenClaw 7.1 doctor/fix against the 9.1 state.
