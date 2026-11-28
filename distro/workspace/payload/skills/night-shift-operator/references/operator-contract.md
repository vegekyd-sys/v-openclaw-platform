# Night Shift operator contract

Use the installed `nightshiftctl` command. It talks to the loopback Night Shift service and returns JSON. `nightshiftctl help` lists every command; every operation the Live Board offers has one (2026-11-04).

Never go around it: no `sqlite3` on `nightshift.sqlite`, no `curl` to `127.0.0.1:24879`, no hand edits of the engine's files (`content-items.json` of a running project, `project-inputs.json`), no native Workboard cards built by hand. Each of these has broken production: removing a published item from `content-items.json` failed every scheduler pass on 2026-11-04; deleting a `workflow_releases` row to republish a version left no record of what had run. If a command is missing, say so and stop instead of reaching for the database.

## Read-only commands

```bash
nightshiftctl health
nightshiftctl help
nightshiftctl workflows list [--include-retired]
nightshiftctl workflows source <id>[@<version>]|<sha> [--out ./workflow.md]
nightshiftctl projects list
nightshiftctl projects get <project-id>
nightshiftctl projects monitor <project-id>
nightshiftctl projects handoff <project-id> <stage-id> [--item <content-item-id>]
nightshiftctl projects deliverables <project-id> [--item <content-item-id>]
nightshiftctl projects artifact <project-id> <path> [--item <content-item-id>] [--out <file>]
nightshiftctl cards list --project <project-id> [--status blocked]
nightshiftctl cards get <card-id>
nightshiftctl cards session <card-id> [--run-id <run-id>]
```

`projects monitor`, `cards list --project` and `cards get` read only that project or card. `cards list` without `--project` returns the whole board (about 250 MB on V); do not use it to look at one project.

## Workflow commands

```bash
nightshiftctl workflows validate ./workflow.md
nightshiftctl workflows import ./workflow.md
nightshiftctl workflows publish ./workflow.md
```

`import` saves a mutable draft only. `publish` creates an immutable release and requires explicit user confirmation after validation and diff. A published version is final: to change its content, raise `metadata.version` and publish again (publishing other content under the same version is refused with 409).

```bash
nightshiftctl workflows retire <id>[@<version>] --reason "<why>" --actor V
nightshiftctl workflows restore <id>[@<version>] --actor V
```

`retire` is how a Workflow is deleted: it leaves `workflows list` and the board, and no new project can start on it. Projects that already ran on it keep it. It is refused while a project on it has not finished (active or paused) or while a Workflow still in use calls it; the error names them. Without `@<version>` every version is retired. `restore` brings it back.

## Project commands

Prepare a JSON file outside Git:

```json
{
  "id": "XQ-EXAMPLE-20260822",
  "name": "示例客户 内容交付",
  "workflow": "content-delivery@1.0.0",
  "status": "active",
  "agentBindings": {"content-operator": "@@AGENT_ID@@"},
  "collaboration": {
    "createdByOpenId": "ou_requester",
    "sourceChatId": "user:ou_requester"
  },
  "inputs": {
    "customerId": "customer-id",
    "briefUrl": "https://example.com/authoritative-brief",
    "authorizationScope": {
      "paidProduction": false,
      "externalPublication": false
    }
  }
}
```

Then:

```bash
nightshiftctl projects preflight ./project.json
nightshiftctl projects create ./project.json
nightshiftctl projects start <project-id>
nightshiftctl projects pause <project-id>
nightshiftctl projects inputs <project-id> --file ./input-patch.json
nightshiftctl projects collaboration <project-id> --to <oc_…|user:ou_…> [--by <ou_…>]
nightshiftctl projects archive|restore <project-id>
nightshiftctl projects dispatch <project-id> on|off --actor V
nightshiftctl projects retry-dispatch <project-id> --actor V
nightshiftctl projects tick <project-id> [--dispatch] [--dry-run]
nightshiftctl projects skip-item <project-id> <content-item-id> --reason "<why>" --actor V
```

`dispatch off` holds the project's cards on the board (看板「暂停自动派工」); `on` lets the scheduler start them again. `retry-dispatch` is 「仅重试此项目」. `tick` runs one scheduler pass for the project now; without `--dispatch` it only plans.

`skip-item` leaves one content item out: nothing more is planned for it and the project delivers the rest, the same record as 「这条不做了」 on 需要你. Its cards that have not started stop; a timed card stops when its time comes; a card an Agent is running must stop first. What already ran is not undone: the reply lists `doneStageIds` (a published item stays published). Keep the item in `content-items.json`. Skip only on a person's word.

`collaboration` says who hears when the project finishes. `sourceChatId` is either a group (`oc_…`) or a person's own chat (`user:ou_…`). `createdByOpenId` is the requester's `ou_…`. Fill both from the requester's conversation metadata, as SKILL.md describes. Use `projects collaboration` to set or change them on an existing project; it does not dispatch anything.

`create` persists the project in `paused` state and does not create or dispatch a card. `start` explicitly changes it to `active`, schedules, and dispatches the current runnable stage. `pause` prevents the scheduler from starting subsequent work; it does not kill an already running native Attempt.

Use `projects inputs` to resolve a documented downstream blocker without replacing the project or its native cards. For external publication, the patch may add a non-secret `publicationTarget` with the exact account record, handle, platform, market, language, timezone, and device identity. Keep credentials in their owning system; never place them in this patch.

Successful Workflow, Project, and card responses contain `links`. Return those exact links to the user after creation and at meaningful terminal milestones. `projects monitor` is the project-wide native Workboard view; `cards session` reads the corresponding OpenClaw Session Store attempt without creating a second monitoring record.

## Queue and concurrency

```bash
nightshiftctl projects queue
nightshiftctl projects priority <project-id> [first|last|<-1000..1000>|default] --actor V --reason "<why>"
nightshiftctl projects order <project-id> <project-id> … --actor V --reason "<why>"
nightshiftctl projects concurrency <project-id> [<1-8>|default] --actor V --reason "<why>"
```

Without a value, `priority` and `concurrency` show the current setting. `order` puts the listed projects ahead of every other, in the order given; projects not listed keep theirs. Each change is audited with the actor and reason. Neither control stops a running card or bypasses Night Shift's admission brakes.

## Agent model

```bash
nightshiftctl model                                                    # Night Shift's setting
nightshiftctl model [<provider/model>|default] --actor V --reason "<why>"
nightshiftctl projects model <project-id>                              # effective model and source
nightshiftctl projects model <project-id> [<provider/model>|default] --actor V --reason "<why>"
```

Order: the project's setting, then Night Shift's, then the Gateway's default model. `projects model` returns `agentModel { effective, source: project|nightshift|gateway-default, project, nightshift }`; `projects queue` lists each project's `model`. Night Shift pins the model on a card's session (native `sessions.patch`) before the board starts it, so wake-ups and retries keep it. Changes apply to later starts only and are audited as `agent-model.changed`.

## Decisions (需要你)

```bash
nightshiftctl decisions list [--project <project-id>] [--status open|decided]
nightshiftctl decisions get <request-id>
nightshiftctl decisions decide <request-id> --option continue|retry|redo|skip|pause --note "<reason>" --actor V [--apply-to-group]
```

`continue` lets Night Shift go on: the same card when the stage's external call can still move (nothing registered, a result to reuse, a task still running), a definitively failed project stage or content item may instead receive a controlled new revision whose external call may charge again; the choice's description says which. `retry` reruns the same card (用这次的结果, and requests opened before 2026-10-09). `redo` (重新生成) always starts a fresh, paid attempt. `skip` exists only on a request about one content item; the item is recorded as skipped (with the note as its reason) and the project delivers the rest. `pause` pauses the whole project. `--apply-to-group` applies `continue` or `retry` to every open request in the group that offers it; never to `redo`. A second decision on the same request returns the first.

## Card decisions

```bash
nightshiftctl cards approve <card-id> --actor "Name" --evidence "Reviewed result"
nightshiftctl cards changes <card-id> --actor "Name" --evidence "Concrete requested changes"
nightshiftctl cards reject <card-id> --actor "Name" --evidence "Reason"
```

```bash
nightshiftctl cards approve-all <card-id> [<card-id> …] --actor V --evidence "Reviewed result"
nightshiftctl cards takeover <card-id> --actor V --reason "<why a person does it>"
nightshiftctl cards human-complete <card-id> --actor V
```

The CLI derives instance, content item, stage, effect, and scope from the native card. Do not ask a normal operator to supply those IDs. `approve-all` approves up to 100 review cards (看板「批量通过」). `takeover` and `human-complete` are 「接管此卡」 and 「校验产物并完成」: a person does the card's work, then Night Shift checks its outputs.

### Card recovery

V can recover an existing task from any group, direct chat, or execution session within its valid authorization; no human button or open decision request is required.

```bash
nightshiftctl cards retry <card-id> --actor V --note "<blocker fixed / how to continue>"
# Only when a new external call is needed and covered by the task authorization:
nightshiftctl cards retry <card-id> --actor V --note "<correction>" --allow-new-operation
```

`--evidence` remains accepted as the recovery note for older callers. `--allow-new-operation` records V's explicit intent; it does not grant a larger budget, a different account/publication target, or missing approval. This flag belongs to `cards retry`, not the separate `decisions decide --option retry` choice.

Read the current task and available supplier evidence before recovery. Let the engine choose from its ledger:
- `succeeded`: reuse the result; do not submit it again.
- `executing` with an external task ID: continue reading that task.
- A definitively `failed` operation: the flag permits a controlled new revision/new operation identity, including project-scoped stages. The failed hash and receipt stay intact; `failed` does not prove zero cost.
- Reserved/unknown outcomes or executing without a readable task ID: read back the supplier first; the flag does not override this gate.

Keep the original project and completed upstream work. Do not manually change a key, clear the ledger, or create a replacement project. Recover a stopped executable card, not an approval/human gate or an active run. A paused project remains paused.

After the call, use `projects monitor` to follow the latest stage revision and verify that only the intended work recovered. Repeated calls for a superseded/already queued card are idempotent; `alreadyResumed` is not business completion. Confirm real supplier/asset evidence before reporting success.

## Safe file handling

- Workflow source is durable and may be committed after review.
- Project JSON, customer inputs, media, Session text, and output artifacts are runtime data and must not be committed.
- Use a project working directory under the Night Shift runtime state path.
- Never put credentials or signed URLs into these files.
