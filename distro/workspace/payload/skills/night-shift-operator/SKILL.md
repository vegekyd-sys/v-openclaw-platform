---
name: "night-shift-operator"
description: "夜班 / 夜班模式 / Night Shift / Workboard：夜班对话入口兼操作手册——查看、建改 workflow、建项目、推进和治理。需要部署方装好夜班服务并配置服务地址才生效。"
---

# Night Shift Operator

Night Shift turns a conversation into a versioned workflow or project, then lets native OpenClaw Workboard own execution. Keep one workflow truth (`workflow.md`), one card runtime (native Workboard), and one Session Store.

Before changing anything, read [product-model.md](references/product-model.md). For commands and payloads, read [operator-contract.md](references/operator-contract.md). When authoring or revising a workflow, read [workflow-authoring.md](references/workflow-authoring.md); when authoring or revising a Skill a stage declares, read [stage-skill-authoring.md](references/stage-skill-authoring.md). Nobody writes these files alone — you write them, so their quality is yours. When a workflow stage reads or writes a Feishu Base table, read the live table's fields first; never guess field names or fill rules from memory.

## Start here — 先确认夜班服务在不在（每条夜班会话的第一步）

夜班是一个单独的服务，**需要部署方装好并配置服务地址才生效**（OpenClaw 的 Workboard 插件、夜班插件和 `nightshiftctl`，由安装方负责）。每次先跑：

```bash
nightshiftctl health
```

- 命令不存在，或者连不上服务：如实告诉主人「夜班服务还没装好（或没配置服务地址），这项要请部署方开通」，然后停下。**不要**用聊天、子 agent 或定时任务去模拟夜班，也不要说已经建好了项目。
- 通了：用 `nightshiftctl workflows list` 现查有哪些 workflow 和版本，**不要在这里写死版本号**。主人的夜班项目记录放在 `memory/projects/night-shift/`（没有就在第一次用时建，按 `memory/projects/_TEMPLATE/`）。

## Choose the operating mode

- **Explain or inspect**: answer from the local Night Shift service and native Workboard. Do not create or mutate anything.
- **Create or revise a workflow**: turn the discussion into a draft `workflow.md`, validate it, show the meaningful diff and simulation result, then ask before publishing an immutable release.
- **Create a project**: collect only missing business inputs, preflight the selected workflow and Agent binding, create the instance without dispatch, then start it only when the user clearly asks it to run.
- **Operate a running project**: report the project, stage, card, attempt, Agent Session, artifact, blocker, and next human decision. Use the existing card; never create a parallel task record.
- **Service code and deployment**: the Night Shift service, its plugins and `nightshiftctl` are installed and maintained by whoever deployed this V. Do not edit, upgrade or restart them yourself, and never restart the Gateway (it ends your own turn). When something in the service itself is broken, report the exact command, output and project to the owner so the deployer can fix it.

## Conversational behavior

Translate business language into the minimum structured fields. Do not ask employees to know SHA values, stage schemas, Agent IDs, or card IDs.

For a new workflow, confirm:

- what outcome the workflow repeatedly delivers;
- what one finished unit looks like, and which file carries it;
- required business inputs and outputs;
- stages and dependencies;
- which stages need humans;
- paid, external-publication, destructive, or credential-bearing side effects;
- what one unit costs and how many paid calls per unit are acceptable;
- where each business number comes from (the authoritative source, or the operator) — a number nobody stated is written as unknown, never invented;
- the logical Agent roles and required Skills, and the CLIs those Skills call;
- if a schedule rather than a person creates its projects: who hears when one finishes (see [Completion notice](#completion-notice--ask-then-record-it)).

Write the stage the way you would ask V to do the job in chat, then check it against the authoring reference. A stage that reads like a procedure manual will cost hundreds of tool calls; the same stage as one sentence of intent plus a named output file costs tens.

For a new project, confirm:

- workflow and project name;
- customer or internal owner;
- authoritative brief/source links;
- desired item count and any route constraints;
- authorization scope;
- Agent role binding;
- where the completion notice goes: 你的飞书私聊, or this group.

Infer stable fields from the selected Workflow and current environment. Ask only for missing choices that materially change execution.

## Completion notice — ask, then record it

When a project finishes, Night Shift sends one Feishu card, 「项目已完成」, with the delivery link. It goes to the first of:

1. the project's own `collaboration.sourceChatId`;
2. the pinned Workflow's `notifications.instanceCompleted.to`;
3. nobody.

It is sent only when the pinned Workflow declares `notifications.instanceCompleted.enabled: true`. If it does not, tell the user no notice will come and that the Workflow needs a new version to add one.

**When a person asks for a project in chat, ask once:** 「做完后通知发你飞书私聊，还是发这个群？」 Do not ask them for IDs. Take the IDs from the `Conversation info` metadata on their message and put them in the project JSON's `collaboration`:

| Their answer | `sourceChatId` |
|---|---|
| 私聊 | `user:` + their sender id (`user:ou_…`). In a private chat, `chat_id` already has this form. |
| 这个群 | The group's `oc_…`. In a group, `chat_id` reads `chat:oc_…`; drop the `chat:` prefix. |
| Another group or person | That target's `oc_…` or `user:ou_…`, and only if you can read it from an authoritative lookup. Never guess. |
| 不用通知 | Leave `sourceChatId` out. |

Always set `createdByOpenId` to the requester's `ou_…`. In the creation reply, say in one line where the notice will go, e.g. 「完成后会通知到：你的私聊」.

To set or change the target on a project that already exists, including a running one, use `nightshiftctl projects collaboration <project-id> --to <oc_…|user:ou_…> [--by <ou_…>]`. It takes effect when the project finishes; setting it sends nothing.

A project created by a schedule (a cron script) has no person in the conversation, so its Workflow carries the target in `notifications.instanceCompleted.to`. See the Completion notice section of [workflow-authoring.md](references/workflow-authoring.md). When you author or revise such a Workflow, ask who should hear.

## Test lifecycle and governance

Encourage test, acceptance, and canary projects. When the purpose and desired retention are known, attach advisory governance metadata at creation: `production` has no default expiry, `test` defaults to 7 days, `acceptance` to 14 days, and `canary` to 3 days. Missing or inferred governance metadata must never block project creation, preflight, start, dispatch, or completion.

Run `nightshiftctl governance audit --refresh` to find expired non-production projects, duplicate immutable action labels, and orphan cards. Treat audit output as a review queue, not an execution gate. Keep active projects and projects with running cards out of archive candidates.

Archive only from an explicitly reviewed manifest that pins every project ID, expected status, and card count. Use soft archive so default Live Board views hide the project and its cards while native card statuses, Sessions, comments, artifacts, approvals, and audit evidence remain unchanged. Restore without dispatch; a previously active project returns as paused.

Prevent an exact duplicate action from expanding by reusing its canonical card or surfacing an alert. Never bulk-delete cards that contain attempts, Sessions, comments, artifacts, approvals, or execution evidence. Schedule recurring cleanup only after the user confirms its cadence and scope.

## Return a viewable result

Night Shift API and `nightshiftctl` responses include canonical `links`. Treat these as part of the user-facing result:

- after publishing a Workflow, return `release.links.workflow`;
- after creating or starting a Project, return `links.project`;
- when a task completes, blocks, or needs review, return the native card's `links.task`;
- when giving a status summary, return the Project link once instead of listing internal paths or IDs alone.

Do not invent URLs or reconstruct hosts from memory. Use the current response so test and production services stay distinct.

## 交付网页 — how a download project delivers

A download project ends in a delivery web page, not a zip. The page is a template: the engine builds, uploads and hosts nothing for it. The stage's Agent does that work with skills.

**这一步依赖公网托管，需要主人自己的账号**：交付页要部署在一个公网地址上（例如 Vercel 或 Cloudflare Pages），视频和清单要放在一个公网可访问的存储上（例如 Cloudflare R2、Vercel Blob，或 Makaron 自己出的成片链接）。装机时这些默认都没有。没有时：

- 直接告诉主人「交付网页需要你补 Vercel 或 Cloudflare 账号（以及一个放视频的存储），补好之前我先把成片发到飞书」，然后用飞书云空间或聊天附件交付；
- 不要静默跳过这一步，也不要编一个链接、说交付页已经好了。
- 交付的是客户的成片，**不能用临时预览链接（`temp-preview.py` 或任何临时隧道）代替交付网页**；没有托管就发飞书。

有了托管之后：

- **The manifest** (version 1, written by the Agent):
  ```json
  {"version":1,"title":"<企业> <语种> <N>条","archiveName":"<zip 名>.zip","deliveredAt":"<ISO 时间>",
   "items":[{"title":"<选题>","url":"https://<你的存储>/…mp4","fileName":"<件名>.mp4","bytes":38513653,"durationSec":20.1}]}
  ```
  Each item needs only `title` and `url`, both https on the owner's storage (or Makaron's own output links).
- **Which link a video gets**: a video exactly as Makaron rendered it keeps its Makaron link. A video V changed afterwards (BGM, trim, re-encode) is uploaded to the owner's storage. Rewrite the manifest in place, so the page link stays the same.
- **Names are yours**: the page uses `fileName` (each file) and `archiveName` (the 「下载全部」 zip) exactly as written. A Workflow's naming rule lives in that Workflow's delivery stage — read it there.
- **Steps**: in the pinned Workflow's delivery stage. Do not copy them here.
- When you author a Workflow that hands videos to people, end it with a delivery-page stage like this one, not a zip step, and declare in it which hosting and storage the owner has set up.

## Monitor native Agent work

Use `nightshiftctl projects monitor <project-id>` to read the project's native Workboard tasks. For each running, blocked, or review task, use `nightshiftctl cards session <card-id> [--run-id <run-id>]` when the user asks what the Agent is doing or when progress appears stale.

Judge progress from the same native state that Live Board shows: card status, attempt count, `sessionKey`, `runId`, last update, Session messages/tool activity, handoff artifacts, and completion checks. Report one of: progressing, queued, waiting for review, blocked with evidence, or stale and needing recovery. A running card with recent Session activity is not stuck; a done card without required output evidence is not complete.

Monitor the existing project's native cards. Recover through `cards retry` as described in [Card recovery](references/operator-contract.md#card-recovery); let the engine choose reuse or a controlled revision. Never start a parallel Agent or duplicate project merely to make monitoring easier.

A blocked card that shows automatic retry (「故障后自动重试中」, `failure.automaticRetry`) is Night Shift recovering from a Gateway or Worker fault. It is not a person's matter: do not report it as needing someone or retry it by hand. What needs a person is in `nightshiftctl decisions list`.

## 需要你 — carry out a person's decision

A stop reaches 需要你 (the board's decide drawer and the Feishu 「需要你处理」 card) only when a person has something to do: the Agent asked for it — the card's first line, 需要你做 — or Night Shift already went on by itself twice and the card still stopped. A stop that asked nothing of a person is Night Shift's: it goes on by itself a few minutes later, at most twice per item and stage, and pays for at most one fresh attempt. Do not report such a stop as needing someone, and do not retry it by hand.

`nightshiftctl decisions list [--project <id>]` lists the open requests; `decisions get <id>` shows what the person is asked to do (`problem`), one sentence of why (`cause`) and the choices. Each choice's `description` says whether it pays again; read it before acting:

- **处理好了，继续 / 再试一次** (`continue`): Night Shift goes on. It reuses a settled result or continues a readable external task; a failed project stage or content item can receive a controlled new revision when the choice explicitly allows a new external call that may charge again. Whatever the person did or wants goes into `--note`, because the Agent reads it on top of its brief (「已充值」「已补素材」「换个角度讲透气性，不要编造测试效果」).
- **用这次的结果** (`retry`) / **重新生成** (`redo`): offered instead of 继续 when a paid result exists but did not pass its checks. 用这次的结果 delivers that result at no cost; 重新生成 pays for a new one.
- **这条不做了** (`skip`): offered only on a stop of one content item. That item is not delivered; the rest of the project carries on and delivers without it, and the completion notice names what was skipped and why.
- **暂停项目** (`pause`): pauses the whole project; nothing new starts until someone restarts it. It is not a way to deliver the rest — that is skip.

Requests opened before 2026-10-09 may still show 重新执行 (`retry`): it runs the same card again.

For a request that genuinely needs a person's judgment or new authorization, carry out their stated choice. V may recover execution within an existing valid authorization through `cards retry` without waiting for a human button or decision request; see [Card recovery](references/operator-contract.md#card-recovery). Never skip on your own judgment. Obtain approval for new spending or external actions not covered by the task; a recovery flag does not expand its budget or publication target.

A person may also drop an item that has not stopped (a duplicate, a video they no longer want): `nightshiftctl projects skip-item <project-id> <content-item-id> --reason "<their words>" --actor V`. Never remove it from `content-items.json` instead.

To act: `nightshiftctl decisions decide <request-id> --option continue|retry|redo|skip|pause --note "<the person's words>" --actor V`. A person usually names the item, not the request: find the request with `decisions list` by project and title, and ask when more than one could match. Then reply in one line with what you did and what happens next, e.g. 「已跳过 圣山染整 第 21 条（烟雾测试没有素材），其余 29 条照常交付」.

## Steer running projects — 排队与并发

Two controls decide how the free starts are shared while projects run. Use them on your own judgement, and whenever a person asks (「让 X 先做」「X 加快」「X 先放一放」):

- **Queue order**: `nightshiftctl projects priority <project-id> first|last|<n>|default`, or `nightshiftctl projects order <a> <b> …` to put several ahead in that order. Higher priority takes free starts first; equal priorities keep first come, first delivered. Nobody set = arrival order.
- **Session limit**: `nightshiftctl projects concurrency <project-id> <1-8>|default` — how many cards of this project may run at once. `default` returns to the Workflow's `perInstance`.

Look before you change: `nightshiftctl projects queue` shows every project's place, priority and limit; `projects monitor` shows its progress. Good reasons:

- close to delivery → raise its limit so it finishes;
- a promised deadline or a customer waiting → put it first;
- inputs ready but no start for a long time → put it first;
- materials or inputs need fixing first → put it last.

Every change carries `--actor V --reason "<why, in words a person understands>"`, and you tell the person in one line what you changed and why. Return a project to `default` once its reason is gone.

These controls only share the starts; they do not create them. Running cards never stop. When Night Shift is braking (a person's reply was cut, host memory, Agent DB pressure) a higher limit starts nothing new — do not raise many projects at once to push the machine; the brakes protect people's chats. The same two controls are on each project's ⋯ menu in the Live Board, so a person may have set them: check `projects queue` before overriding a choice someone else made.

## Which model the cards run on — 夜班模型

Unset, Night Shift's cards run on the Gateway's default model, the same as any chat with V. Night Shift can name its own model, for every project or for one project; a project's own setting wins:

- `nightshiftctl model` shows Night Shift's setting; `nightshiftctl model <provider/model>|default` sets or clears it.
- `nightshiftctl projects model <project-id>` shows the model a project's cards start on and where it comes from (`project`, `nightshift` or `gateway-default`); `nightshiftctl projects model <project-id> <provider/model>|default` sets or clears that project's own.

The model is a cost and quality choice that belongs to a person: change it only when someone asks (「夜班用 X 模型」「这个项目换强一点的模型」), never on your own judgement. Use a full `provider/model` reference that this V already has (see the Gateway's model list), not an alias. Every change carries `--actor V --reason "<why>"`; tell the person in one line what the cards will run on now.

Setting a model applies to cards started after the change, retries included; running cards keep theirs. Clearing it (`default`) only reaches cards that have not started yet: a card that already ran keeps the model it ran on when it is retried. A card whose session refuses the model does not start on the default instead: it shows up as a start failure naming the model, so fix or clear the setting. The setting is also shown on each project's ⋯ menu in the Live Board.

## Execution policy

Drafting, validation, preflight, status, and dry-run are synchronous. Media generation, browser/cloud-phone work, batch production, publication, and long polling are background-worthy:

- the parent chat acknowledges the project ID and Live Board link;
- native Workboard dispatches isolated Agent runs;
- each run records heartbeat, attempt, proof, artifacts, and terminal status;
- the parent does not wait in the chat lane or poll repeatedly;
- human review happens in Live Board.

Never report a queued or running card as completed.

## Authorization gates

- Saving a draft does not authorize publishing it.
- Publishing a Workflow requires explicit confirmation after validation and diff.
- Creating a project does not authorize dispatch; a clear “start/run/execute” request does.
- Paid production is approved per content item unless the user explicitly grants a bounded batch scope.
- Video approval and external-publication approval are separate.
- Publication requires the exact asset, account/handle, channel, market/language, and device identity. Missing details mean `blocked`, not a guessed target.
- Resolve the publication target before approval and let the approval bind that immutable target to the already approved content item. If the target changes, require a new approval instead of silently reusing the old one.
- Never copy credentials into `workflow.md`, project JSON, card notes, Git, Memory, or chat.

## Failure and recovery

Stop and report a precise blocker when required Skills are unavailable, an authoritative source cannot be read, inputs conflict, evidence is missing, a Worker loses ownership, or an external operation cannot be read back.

Agent first: V in a group, direct chat, or execution session can recover work through the existing `cards retry` capability within the task's valid authorization. Follow [Card recovery](references/operator-contract.md#card-recovery) for the new-operation flag, ledger gates, and verification. Let the engine manage revisions while preserving completed upstream work, old keys, receipts, and audit; do not replace the project or erase an interrupted attempt. This is explicit V-initiated recovery, not a request to add scheduler auto-retry.

## Completion evidence

Before saying a change or delivery is complete, verify the relevant subset:

- Workflow validation and immutable SHA;
- project preflight and Agent/Skill availability;
- native card creation, claim, heartbeat, attempts, and Session linkage;
- declared artifact existence and checksum;
- human review state;
- external readback for any side effect;
- service health (`nightshiftctl health`).

## Related Skills

Load stage Skills declared by the pinned Workflow — **the pinned Workflow is the one source of truth for which Skills a stage uses**; never keep a parallel hand-maintained list here. Night Shift owns orchestration only; the Skills a stage uses (for example `lark-*`, `makaron`, `background-worker-contract`, `social-search-apify-first`) own the work.



## Reusable Workflow calls and bounded loops — Agent-first

Use this when the same published process should run once, per item, or repeatedly based on its business outputs. Reuse existing stages, skills, handoff and validation rather than copying them. Do not represent a business round with retry attempts, arbitrary DAG back-edges or a new business project, and do not add another judgement Agent between stages: the existing verification stage/tool outputs facts, the engine applies the caller's declared routes.

**Deployment gate:** the service must support this syntax introduces this syntax. This skill update or an open PR is not proof that it is installed. Read `nightshiftctl health`; use it only when `workflowFeatures.calls === 1` and `workflowFeatures.boundedRepeat === 1`. If absent, report that the target engine lacks this capability. Do not publish unsupported syntax, manually create parallel cards, or bypass its ledger. Use the target release's `docs/workflow-calls.md` as the declaration reference.

### Declare a reusable definition and its invocation

Publish the called Workflow first. Its existing project-scoped validation stage declares a JSON result output/handoff and exports it under spec:

```yaml
outputs:
  result: {stage: verify, output: result}
```

A business rejection is a valid completed verification result, not an execution crash. For example, result.json can contain accepted/retryable/reuseAllowed/resourceRef/evidence. Set retryable only when evidence establishes a reasonable next attempt; attempt exhaustion, uncertain supplier state or an exit restriction are not proof that a resource is bad. Aggregate per-item outputs through a project stage before exporting them.

A caller stage pins the actual published SHA; this illustrative no-spend example does not authorize any real expenditure:

```yaml
actor: workflow
scope: project
timeout: 2h
outputs: [result]
call:
  workflow: <actual-published-sha256>
  inputs:
    brief: {from: input.brief}
    reuseAllowed: {from: previous.result.reuseAllowed, default: false}
    resourceRef: {from: previous.result.resourceRef}
repeat:
  until: {output: result.accepted, equals: true}
  while: {output: result.retryable, equals: true}
  maxIterations: 3
  maxDuration: 2h
  maxOperations: 0
```

- Without repeat, the same definition runs once; optional call.maxOperations defaults to zero. For per-item execution use scope: content-item and normal contentItems/route semantics, or explicit requiresRoute: false. Bind item.id or other item facts as needed. Successful other items do not restart.
- Explicit bindings read input/item/previous; first round has no previous output. default applies to missing values, not false/0/null; `{value: ...}` expresses literal JSON. References carry reusable resources/evidence, not automatic acceptance. Credentials never enter these facts: use approved resource/SecretRef references. Authorization is inherited, not manufactured via bindings.
- until success exits and releases downstream once. Otherwise while must match to start a new round. Missing, wrong-type or unmatched outputs hold; no scripts or business-specific engine statuses. JSON exports must belong to this called execution and match its handoff identity, at most 64 KiB; export resource references for large artifacts.
- Agree actual limits with the task owner where missing; never infer a real spending authorization from the example. All three repeat limits are explicit. maxOperations counts external-operation reservations, including failed ones, across rounds and nested calls. Optional project spec.limits maxOperations/maxDuration are shared across items/calls. **An operation cap is not a money cap**: this version does not implement currency settlement, refunds or an amount hard limit.
- Skills, sideEffects, approvals and timed releases remain on the actually executing child stages. Preflight, target-bound approval, root concurrency, ancestor/project allowances and parent pause/skip/archive still apply. No new loop button is needed.

### V controls recovery and observes the original project

Use existing `nightshiftctl projects get|monitor <project-id>`: calls expose rounds, reasons, child/card IDs and cumulative operation counts without exporting inputs or output contents. Use native child cards from those responses; do not create parallel business projects or erase previous receipts. The board is an auxiliary view.

A technical fault recovers the same round's child card with `cards retry <child-card-id> --actor V --note ...`; use --allow-new-operation only when a genuinely failed operation needs a new revision within existing authorization. The call controller's retry only rechecks this round after artifacts/readback are fixed. It does not force another round or reset resource limits. Unknown/reserved/unsettled executing outcomes require supplier readback, not a new round. Failed does not mean zero charge. Parent pause prevents new work but does not cancel submitted supplier tasks; finish their readback/cleanup safely.

Stage-internal multiple operations, migrating already-started projects and cross-call-boundary redo are separate concerns; this version refuses cross-boundary redo. Do not use a loop as a new key for a different action in one stage. Preserve old release pins, successful items and historical operation identities.

### Verify the declaration creates the intended execution

Use the target compiler and an isolated store to publish child then caller, create a synthetic project, and inspect the actual first child card and first-round defaults. Exercise first-round success and downstream exactly once; explicit retryable output producing a distinct second round; retained resources/receipts; restart and duplicate consumption without an extra round; unknown outcomes, parent pause and all resource gates stopping new calls. Include per-item isolation when used. Runtime changes require an appropriate private real Workboard/Gateway candidate; a supplier call or Agent dispatch is not needed for the accounting/state test. A synthetic acceptance is not real business acceptance. Deployment, production browser checks and real-spend tests retain their own authorization boundaries.

The Night Shift service's own documentation has the full declarations and examples. The engine repository includes reusable-verified-work.workflow.md and repeat-verified-work.workflow.md. Do not downgrade with active internal call contexts: pause/settle them and follow the documented database backup/rollback procedure first.


### Known terminal failures as attempt receipts

Use this only when a stage delivers the result of an external attempt rather than promising business success. First require `health.workflowFeatures.terminalAttempts === 1`; old services do not support it.

Declare `operationCompletion: {mode: terminal-attempt, output: attemptReceipt}` on the actual agent/system side-effect stage; keep its real sideEffects, authorization, retry key, strict-v1 completion and handoff v1. Declare attemptReceipt as a JSON output and include `output.attemptReceipt.exists` in completeWhen. Other business rules remain mandatory. Ordinary old stages still require succeeded.

After genuine supplier terminal readback, checkpoint the truthful succeeded/failed with result containing `terminal:true`, a nonempty `evidence` reference and supplier facts. Deliver JSON `attempted:true`, `succeeded` exactly matching operation status, and `operation:{idempotencyKey,requestHash,externalTaskId,status,resultSha256}` copied from that checkpoint (task ID null if absent). resultSha256 = exported `operationResultHash(result)` (SHA-256 of recursively key-sorted JSON). The server verifies card/identity/hash/task/status/result digest and normal output provenance; wrong or missing receipts block. Never change a failed operation to succeeded. “Terminal” is not proof of no charge, refund or financial settlement.

A failed attempt may now complete as an honest attempt report so an independent verification step can emit business outcomes for call/repeat. Failure alone does not make a resource replaceable or authorize another purchase; unknown, reserved, executing, holds and technical failures still stop for readback/handling. Do not remove real sideEffects or call a different operation under the same key. Missing or malformed reports with a known terminal checkpoint recover via existing `cards retry` on the same card/key, without allow-new-operation; this repairs the receipt, not a new provider call. Ordinary failed stages retain their original authorization for new calls.

Validate a real terminal failed checkpoint reaching independent verification and a configured next round, while preserving the old failed record, successful siblings and actual costs; test unknown/missing/forged receipts, repeated recovery, root pause and shared limits. Zero-call fixtures prove engine mechanics only, not live supplier/login success. Related business Workflow/Skill definitions must explicitly opt in and bind truthful attempt outputs; they must not silently inherit success assumptions.
