# Feishu Ask User candidate

The Worker registers `question.request` in the Gateway while its Feishu tool-progress
reply can contain only “Ask User”. The existing runtime-v2 channel listener renders
secret-entry requests only. Ordinary questions consequently have no usable prompt.

The selected B layout uses native Card 2.0 clickable rows: bold option title plus
an optional grey explanation inside one bordered area. Custom input is folded
inside a root form; a text-only question expands that section automatically.

The patch binds the active reply dispatcher by exact session and account. When
there is one active owner, the question is inserted into its existing CardKit
entity/message. The preceding text is retained, the entity exits typing animation
mode, and later content writes target a separate continuation element. Answered
controls collapse into a compact selection record. Headers/notes are preserved.
No active stream (or ambiguous owners) falls back to a separate native card.
Cleanup unregisters only its own dispatcher. Old question callbacks cannot repaint
a newer question in the same stream. Callbacks return only a toast and
refresh the message asynchronously to avoid replacing the whole reply or missing the
3-second acknowledgement deadline.

This patch extends the lifecycle listener to deliver ordinary questions.
It supports 1–3 questions, single/multiple choices and custom answers. One
single-choice question resolves on the option click. Multiple questions or a
multi-select question stage selections per sender, then resolve on confirmation.
Custom answers use a collapsed input section inside a root form. There are no dropdowns. The card
callback resolves the original Gateway question directly, outside the busy session's
chat queue. No bot message is synthesized as a user answer.

Clickable option rows carry question-bound `behaviors.callback.value`; the custom/confirm
form button uses `form_action_type: submit` and question-bound callback metadata plus `name`, matching the existing credential form.
`action.value` identifies the question-bound form (with `action.name` as fallback), and `action.form_value` carries custom answers.
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
Native callback transport remains a shared integration acceptance item after the user approves merging.

`feishu-ask-user-live.plan.json` runs an isolated real Gateway/Worker with channels
disabled, importing the actual patched Feishu monitor's requested listener. Input
and answers are real lark-cli messages in the dedicated test group. The candidate
reads exact message IDs through REST (the bot lacks group-wide listing scope),
uses the actual Feishu reply dispatcher to send a real streaming card, inserts the question into that card, and injects its row callback into the actual candidate
handler. The final model output is routed through the same dispatcher and must be
read back from the original message ID, with the selection record still present.
This validates real model/tool waiting and subsequent model continuation,
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

## B layout and inline acceptance (2026-09-29)

16 local tests pass, including stream/account binding, fallback on ambiguous
owners, continuation/prefix preservation, compact terminal answers, stale-question
repaint rejection, note updates after streaming closes, and bounded callback ACK.

Candidate `candidate-52a62442-1757-4a50-897d-15d82859e35a` passed with input SHA256
`628f620bbdc7b99e1cb8624cfc12d8493ac831ee6b8d8481ee185769fc6c9cc3`.
It exercised the actual patched `createFeishuReplyDispatcher`, real CardKit
updates, and DeepSeek Flash through `vlab-worker`. It delivered B choices, accepted
an injected row callback based on a real lark-cli answer, and rendered
`ASK_CANDIDATE_0929_DONE 重画（重新生成画面）` below the compact selected-answer record.
Initial/question/final message ID stayed
`om_x100b6488a002a4a8b27048b745c6f8f`. The final native card was read back with
`mget?card_msg_content_type=raw_card_content` and independently by lark-cli.
Server time 82.3s; shared VLab PID remained 711121. No dev merge or deployment.

Earlier inline runs did not pass their driver: one saw a partially written answer
file (the driver now publishes it atomically), two read Card 2.0 using the legacy
message-get format (which returns an upgrade placeholder). Their final cards were
subsequently visible, but only the explicit passed receipt above is acceptance.
The dispatcher run also exposed a closed-stream note endpoint; notes now use the
ordinary component replacement API after an inline question.

The real Feishu client-click/WebSocket transport is still not covered: the
occupied shared bot connection was never taken over. Test input/answer arrive
through REST and the callback enters the actual candidate handler directly.

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

## Shared v2 findings and follow-up

On 2026-09-29, native Feishu clicks passed single-choice and custom input with
Claude CLI. DeepSeek Worker delivered a usable separate choice card, but its
multi-select form submit returned client error 100000. That run was cancelled
for cleanup and v2 was rolled back; it was not accepted as a complete release.

The follow-up uses the existing credential-card pattern: explicit question-bound
callback metadata on form submit, one Gateway resolver for every runtime, and
toast-only ACKs with serialized message updates. Dispatcher eligibility excludes
idle/unstarted owners when selecting an inline carrier. Native acceptance must
cover /vds, /vcc and /vcodex; standalone fallback is an accepted presentation.
18 focused tests cover idle carriers, ordered standalone repaint and metadata-only
form callbacks, in addition to the previous question/stream checks.

## Shared v3 native acceptance (2026-09-29)

The same runtime-neutral credential-style callback path passed native Feishu
click/input -> Gateway answer -> model continuation for all requested entries:

| Entry | Observed model / runtime | Native interaction | Visible final output |
| --- | --- | --- | --- |
| Worker | deepseek-v4-flash / vlab-worker | select 灯光 + 色彩, confirm | `ASK_V3_WORKER_DONE 灯光、色彩` |
| /vds | deepseek-flash / codex | select 构图 + 色彩, confirm | `ASK_V3_VDS_DONE 构图、色彩` |
| /vcc | claude-opus-5 / claude-cli | expand custom input, submit | `ASK_V3_VCC_DONE 保留构图，只柔化灯光` |
| /vcodex | gpt-5.6-sol / codex | select 构图 | `ASK_V3_VCODEX_DONE 构图` |

All four retained the original streaming message ID and compact answer record.
The server recorded one eligible inline owner, successful `question.waitAnswer`,
and final dispatch for each run. No callback injection was used in this matrix.
Two interactions required retry: /vds first option click showed client error -356;
/vcodex first option click did not resolve and its second did. Their root cause is
not established; this is functional acceptance with retries, not evidence of
error-free first-click delivery. Worker multi-submit and Claude custom-submit
completed without the earlier v2 form error 100000.

Accepted artifact `feishu-ask-user-inline-v3`, SHA256
`70bc0cc00ded5cf8939a880833cbc7ffb8d3f0594904f85437a72b3dfecc9634`,
source integration commit `6c51739c689e7f3108bba3dc8b19555ca06491f2`
(task source `d4f4a27b68bb1f84945f00ab8c1d3d14bd689fe6`).
Accepted at 2026-09-29T15:41:34Z. Candidate
`candidate-1efd79f8-52c2-4669-a177-ffb702d06907`, 18 question tests,
17 catalog tests and GitHub static CI passed. The native read-backs, screenshots
and detailed receipt are retained locally under `tmp/vlab` and task `tmp/design`.
Production V has not been deployed; shared VLab returns to its aligned parent
`view-image-overflow-signal-v1` after acceptance to release the integration slot.

## Chat answers candidate (2026-10-03)

When Ask User is pending, its original human sender can now type an answer in the
same chat. The receive handler checks for that pending question before the
inbound debounce/sequential chat queue, reuses the existing group/DM permission
and session-routing checks, and resolves the same Gateway question. The waiting
model resumes; the answer is not dispatched as a second agent turn. Only the
mention requirement is waived for a matching answer to the bot's pending question.

Exact option labels and numbers 1–4 / A–D map to their original labels. Other human
text is passed intact, including a change of mind outside the card's choices.
Multiple questions accept sequential answers or numbered lines; card selections
and chat answers can be combined. Partial answers are shown on the card, with a
notice naming the next unanswered question. A card click and chat answer share one
resolver; message replay, expiry, account/chat/author mismatch and ambiguous
pending questions cannot silently create an extra answer. Control commands,
bots, media and secret-entry requests keep their existing paths. Without an
originating sender binding, answering requires an explicit quote of the exact card.

Run the real-model candidate with:

```sh
node /Users/tianyicai/vlab-dev/lab/vlab.mjs candidate \
  --repo "$PWD" --owner YOUR_TASK_ID \
  --plan "$PWD/lab/candidate/feishu-ask-chat-answer.plan.json"
```

The candidate starts a private Gateway, leaves its Feishu channel consumer disabled,
and holds the actual Feishu per-chat queue while each real model waits for an
Ask User answer. Synthetic human IM events enter the actual patched receive and
authorization handlers. Cards use a local sink. It checks original question
resolution, exact answer text, model continuation, terminal card closure,
logical replay suppression and dispatch of the next ordinary message. Its extra
permission/durable checks verify that the existing sender allowlist blocks an
answer and that both the answer and its replay complete ingress adoption.
Codex uses a private plugin install and an unexpired access-token-only snapshot:
shared refresh credentials are never copied or rotated, and no conversation
store is copied.

Focused tests: 27 pass; the platform offline suite passes all 821 tests. Candidate
`candidate-8d1dc989-4630-478e-859d-981fa9cdc780` passes real QuestionManager/card JSON
regression, input SHA256
`26fed005a9952c2cccdbfdb47b4bd2f17c78d15fd72093f844e1dc9a9107bd2d`.
Initial four-model queue/continuation matrix
`candidate-4a063eb7-bc67-4b70-a74b-24cba4cf85b4` passes, input SHA256
`468cf9127dd367ed97f38a413238131f092e1dc3b92fdca6c8f9ee3ba139f5d6`.
Observed runtimes: Worker DeepSeek v4 Flash, /vds DeepSeek Flash through Codex,
/vcc Claude Opus 5 through Claude CLI, /vcodex GPT 6.1 Sol through Codex.
Answers were ingested in 101–200 ms; this excludes model continuation latency.
Both receipts report shared PID 1423532 unchanged. This patch is candidate-only;
native Feishu receive → answer → visible reply remains for VLab acceptance.

Earlier candidate attempts failed and are not acceptance: private native Codex
plugin registration was missing; a synthetic uppercase chat ID mismatched the
normalized session; then the private agent had no OpenAI auth profile. The driver
now registers the exact native plugin, uses canonical chat IDs, and uses only a
valid non-refreshable access-token snapshot. None of those attempts changed the
shared instance or production V.

The generated v4 monitor is based on live `memory-search-guards-20261002`, preimage
SHA256 `69230132cee9d099ba211aa5442ca44e6ca6cab57128a450fe112f7cace7b5f8`,
preserving its existing task-status changes. Release planning pins that exact
preimage; a changed shared baseline requires regeneration before deployment.

Final permission/durable regression matrix
`candidate-0caf5e99-c096-4d28-abc4-6550ef59e13c` passes all four entries, input SHA256
`155571aae05f6c60460f02cc17dcedb22204e0cb16f349de5c2b1eaa1a1f676f`.
Each run blocks the allowlist-denied answer while the question remains pending,
then accepts the legitimate chat answer, adopts both its initial event and replay,
resumes the model, closes the card and dispatches the following ordinary message.
Answer ingress takes 100–201 ms. Server time 157.7s, shared PID 1423532 unchanged.
`chat-answer-candidate-evidence.json` records the results and hashes of every tested
support file. Generated monitor SHA256:
`b68229ec369962edae5c9f5ba078ca4e24b63ed4aab6fa3fb23c537784ddfd60`.
