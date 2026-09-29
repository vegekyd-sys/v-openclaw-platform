# Feishu Ask User candidate

The Worker registers `question.request` in the Gateway while its Feishu tool-progress
reply can contain only “Ask User”. The existing runtime-v2 channel listener renders
secret-entry requests only. Ordinary questions consequently have no usable prompt.

This patch extends that listener to deliver ordinary questions as Card 2.0 forms.
It supports 1–3 questions, single/multiple choices and custom answers. The form
callback resolves the original Gateway question directly, outside the busy session's
chat queue. No bot message is synthesized as a user answer.

The form button uses `form_action_type: submit` and a question-bound `name`;
`action.name` identifies the request and `action.form_value` carries the answers.
Only a callback for the account and exact message delivered by this process is
accepted. Option indices are checked against the original labels. Empty/incomplete
forms stay open, concurrent submissions are serialized, transient RPC errors allow
retry, and terminal events remove controls. Lifecycle and reply-payload delivery
share one promise. Failed lifecycle delivery cancels the invisible question.
Secret-entry cards keep their existing handler.

## Validation

```sh
node --test tests/feishu-ask-user.test.mjs
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate \
  --repo "$PWD" --owner YOUR_TASK_ID \
  --plan "$PWD/lab/candidate/feishu-ask-user.plan.json"
```

2026-09-29: 10 local tests pass. Candidate
`candidate-45d32285-a19e-4a5a-8bfe-4332106b9cb6` passes against release
`view-image-overflow-signal-v1`, input SHA256
`1676e35ec3088009b4bb2bbe1966d00e24d401365ac03b79d7b7b0363654556a`.
The candidate shape-patches the actual private monitor bundle, checks JS syntax,
uses the runtime's real QuestionManager to prove wait -> answered for multi-question,
multi-select and custom input, and validates the card JSON by creating one unshared
Feishu CardKit entity. No message is sent. Server time 15.4s; shared PID unchanged.

This does not establish a live Feishu click -> callback -> Worker/model continuation.
That is the final shared integration acceptance after the user approves merging.

## Release and rollback

Requires the existing `v-feishu-secret-entry-runtime-v2` patch and its Gateway
requested/resolved lifecycle. Read the **current** monitor bytes through `vlab.mjs
read-code`, then generate a separate output with:

```sh
node lab/release-files/feishu-ask-user/patch.mjs INPUT_MONITOR OUTPUT_MONITOR
node --check OUTPUT_MONITOR
```

The patch rejects missing or ambiguous anchors; a repeated application is a no-op.
Never release the old checked-in secret-entry bundle as a replacement: apply to
the current live baseline so unrelated Feishu fixes survive. Commit the generated
output with a release plan binding its exact before SHA and base release. Then use
the authorized merge/package/lease/stage/deploy/accept flow from lab/README.md.
Only one Feishu monitor file changes; no config, new service or new channel consumer
is needed. Do not modify an occupied shared instance. Rollback uses the same release
artifact to restore the saved monitor bytes.

Integration acceptance: ask from a real Feishu conversation using `vlab-worker`,
see all question/option text and controls, submit an answer, observe the same run
continue and visibly reply. Also check expiry, double submit and ordinary/secret
card regression. Repeat on authorized production promotion.

Limitations: callback bindings are intentionally process-local, matching the
Gateway question lifetime. A Gateway restart invalidates old cards; it does not
replay previously expired questions. The pending question's original answer must
come from a human; this patch does not infer or select one during incident recovery.
