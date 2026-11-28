# Makaron Feishu account, delivery, and reply rules

## Account

An installed V serves one owner, so every Makaron job, in the direct chat, task rooms or groups, uses the owner's key. `scripts/makaron-card-runner/account-routing.cjs` resolves it: the owner's entry in `~/.makaron/chat-keys.json`, else the OpenClaw secrets store `MAKARON_API_KEY`, else `MAKARON_API_KEY` from the installation. There is no per-group registration.

- Log only non-secret metadata such as source and credits.
- No key, an invalid key or no credit is an account issue: say so on the same card in plain words and ask the owner; do not retry with another account.
- When the owner gives you a key, store it with the `secrets` tool under `MAKARON_API_KEY`; never repeat it in chat, logs or files.

## Media delivery

- Deliver generated images, video, audio, files, and designs as actual Feishu media or files.
- Keep a durable delivered-media mapping so later replies can continue the exact project and asset.
- For large video, use the maintained delivery fallback chain rather than marking a successful generation as failed solely because native IM upload hit a limit.
- Treat task success and delivery success as separate states; retry delivery idempotently.

## Exact media reply anchor

Run the resolver only when all are true:

1. The request is a Makaron media modification or continuation.
2. The inbound Feishu message is visibly a reply.
3. The replied-to item is an image, video, audio, file, or design.

```bash
node scripts/makaron-card-runner/resolve-feishu-reply-media.cjs \
  --message-id om_CURRENT_INBOUND_MESSAGE_ID
```

The resolver reads Feishu's authoritative `reply_to` and maps it through the local delivered-media registry. Do not use it for ordinary messages, planning, comments, or fresh generation. An explicit mapped reply wins over a generic latest-project guess.
