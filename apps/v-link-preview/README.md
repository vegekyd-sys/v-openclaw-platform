# v-link-preview

Shows V's links as native cards in Feishu: a Night Shift project link shows the project's live state, a delivery page link shows what is being delivered. This is Feishu's link preview (`url.preview.get`), so it works wherever the link appears, including messages people forward, and needs nothing from the agent that wrote the link.

```
Feishu ──long connection──▶ Gateway (registers url.preview.get, forwards, 2 s timeout)
                                │ POST 127.0.0.1:23970/v1/preview
                                ▼
                          v-link-preview ──▶ board API / delivery manifest
                                └── when a tracked project changes: im/v2/url_previews/batch_update
```

## Why this shape

- **The Gateway receives the callback.** An app's long connection is cluster mode: with two clients Feishu gives each event to only one. A second connection would take message events away from the Gateway. An app also has one callback mode, and its card buttons already depend on the long connection, so a webhook is not available either.
- **Everything else is here.** The Gateway only awaits a fetch. Reads, parsing and retries live in this process and it can be updated without restarting the Gateway. If it is slow or down, the link is simply a plain link.
- **Viewers do not cause reads.** Every viewer pulls separately. Pulls share one read and a 15 s cache, so a big group costs one board request.

## What it reads

| Link | Read | Shown |
|---|---|---|
| `<base>/?project=<id>` | `GET /api/instances/<id>`, `GET /api/decisions?instanceId=<id>&status=open` (one project, never the overview) | state, items, running, blocked |
| `<base>/deliver/?m=<manifest>` | the manifest, only from the delivery page's trusted hosts, at most 1 MiB, no redirects | title, items, size, date |

A link that is neither, a project that does not exist or a failed first read answers nothing. After a failed read, a state up to 10 minutes old is shown and labelled as old. Tracked previews are in memory: after a restart, a preview refreshes on its next pull only.

## Configuration

See `config.example.json`. `publicBaseUrl` is the only address recognised. `feishuCredentialsFile` holds `{"appId","appSecret"}` for automatic updates; without it, previews are correct when pulled but do not refresh by themselves. The file does not belong in Git.

The Gateway needs `OPENCLAW_FEISHU_LINK_PREVIEW_URL=http://127.0.0.1:23970/v1/preview` and the patch from `lab/patch-feishu-link-preview.mjs`. Without the variable, the callback answers nothing.

## Feishu app settings

Add the link preview capability, a URL rule, the `url.preview.get` callback and the `im:url_preview.update` permission, then publish a version. Keep the callback mode on the long connection.

**A URL rule belongs to one app in the whole tenant.** Once an app publishes a rule, no other self-built app can register anything overlapping it, so V-Lab must never register a production host. It uses `vlab-cloud-worker.tianyi.live/link-preview-lab`.

## Test

```sh
node --test apps/v-link-preview/tests/service.test.mjs lab/feishu-link-preview.test.mjs
```
