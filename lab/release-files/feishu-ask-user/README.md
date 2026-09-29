# Feishu Ask User candidate

The Worker registers `question.request` in the Gateway while its Feishu tool-progress
reply can contain only “Ask User”. The existing runtime-v2 channel listener renders
secret-entry requests only. Ordinary questions consequently have no usable prompt.

This patch extends that listener to deliver ordinary questions as Card 2.0 buttons.
It supports 1–3 questions, single/multiple choices and custom answers. One
single-choice question resolves on the option click. Multiple questions or a
multi-select question stage selections per sender, then resolve on confirmation.
Custom answers use a separate input form. There are no dropdowns. The card
callback resolves the original Gateway question directly, outside the busy session's
chat queue. No bot message is synthesized as a user answer.

Option buttons carry question-bound `behaviors.callback.value`; the custom/confirm
form button uses `form_action_type: submit` and a question-bound `name`.
`action.name` identifies that form and `action.form_value` carries custom answers.
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

2026-09-29: 12 local tests pass. Button candidate
`candidate-9fe53922-8ab7-44a1-bc82-0b197a76e676` passes against release
`view-image-overflow-signal-v1`, input SHA256
`8cb07a76b6d08fb8e28a6a3c5495ed027fe0239a20a69212b93bd13df0a84444`.
The candidate shape-patches the actual private monitor bundle, checks JS syntax,
uses the runtime's real QuestionManager to prove wait -> answered for multi-question,
multi-select and custom input, and validates the card JSON by creating one unshared
Feishu CardKit entity. No message is sent by this test. Server time 8.3s; shared PID unchanged.

This does not establish a live Feishu click -> callback -> Worker/model continuation.
That is the final shared integration acceptance after the user approves merging.

`feishu-ask-user-live.plan.json` runs an isolated real Gateway/Worker with channels
disabled, importing the actual patched Feishu monitor's requested listener. Input
and answers are real lark-cli messages in the dedicated test group. The candidate
reads exact message IDs through REST (the bot lacks group-wide listing scope),
sends the real card, and injects its button callback into the actual candidate
handler. This validates real model/tool waiting and subsequent model continuation,
but deliberately does not attach a second WebSocket consumer or claim native
Feishu callback transport acceptance. The test driver needs its CLI answer ID in
the private state's `ask-answer-id.json` after the card is visible.

Button live candidate `candidate-c68b7072-eb22-4ffa-93e0-9ce4aefc147e` passed
in 140.7s server time. DeepSeek Flash ran through `vlab-worker`, registered a real
pending question, delivered a card with `原图` / `重画` option buttons (confirmed
in the Feishu desktop accessibility tree), accepted the candidate-injected callback
for `重画`, and returned `ASK_CANDIDATE_0929_DONE 重画`. lark-cli read back both the
terminal card and the posted final result. Shared PID remained 711121 throughout.
Input SHA256: `19e63fcb6b7c80fe6518b843c20df6d4414f6d98c5a18160a612ac893f86d84f`.
The earlier dropdown run was stopped when the model added an extra question;
its empty receipt stdout is not a passed live test even though systemd stop
caused the runner to report exit 0. Only the explicit button result above passed.

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
