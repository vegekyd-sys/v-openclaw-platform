# Authoring workflow.md

A Workflow is the same work a person would hand to V in chat, written down so it repeats without a person pushing it. Each stage says what to do, which files it reads, and which files it writes. Nothing else belongs in it.

Start from the maintained examples in the installed platform release:

```text
an installed workflow (`nightshiftctl workflows source <id> --out ./example.workflow.md`)
examples/workflows/generic-agent-delivery.workflow.md
```

A Workflow has YAML frontmatter plus human-readable stage sections. The frontmatter declares stable metadata, concurrency, content-item behavior, and required business inputs. Each `## STAGE` section contains a fenced `stage` contract declaring the relevant subset of: `actor`, `scope`, `skills` or `routeStrategies`, `needs`/`next`, outputs, `completeWhen`, timeout, retry, human approval, `sideEffects`, and `releaseAt`.

## What the Agent actually receives

This decides where to write things, and it is the single most common authoring mistake.

The card the Agent runs carries: the stage objective, the input file paths, each declared output and the facts completion reads from it, and the approval or side-effect rules. It does **not** carry the rest of the file.

- A stage **without** `routeStrategies`: its `### Goal` text becomes the objective.
- A stage **with** `routeStrategies`: only `routeStrategies.<route>.description` becomes the objective. **The `### Goal` prose is never sent.** A rule written in the Goal of a routed stage reaches nobody. (A real 40-line Goal of paid-production limits on the `produce` stage never reached a single Agent.)

So: on a routed stage, everything the Agent must know goes into that route's `description`, in one or two sentences. Keep the Goal for the people reading the file.

## The Agent is V, with its Skills

A Night Shift card runs as the same Agent, with the same Skills, as a chat turn. Write the stage the way you would ask V in Feishu.

- Do not tell it to "load these Skills in order", "read every upstream artifact before acting", or "do not use tool X". Those instructions cost context and do not survive contact with a real run.
- Do not write behavioural limits as prose — no polling bans, no "at most N paid tasks", no "do not read SKILL.md". Prose does not bind an Agent. Limits come from the template it fills in, the outputs you declare, and the Skills you give it.
- Declared Skills are a hint and an install-time dependency, not a sandbox. Reading a Skill the stage did not declare is normal use, not a violation.

## Memory is read-only for cards

A card may read the agent's memory like a chat turn does, but it does not write it. Do not write a stage that asks a card to record lessons, logs or progress in memory, `MEMORY.md`, reflections or skill candidates. What a card did goes in its final message and its handoff. A lesson worth keeping is written into the stage Skill or the night-shift project memory from a conversation, after a person agrees. Before this, 55–90% of the daily memory files were card runs' own logs, and later cards read them back as instructions.

## Declare the minimum

- `skills`: only what this stage actually uses. A brief stage that reads a snapshot written upstream does not need `lark-doc`; a produce stage that hands a brief to Makaron needs `makaron` and nothing else. Every extra Skill is an invitation to go do that work again.
- `spec.requiredCommands`: the CLIs the stage calls (for example `makaron-cli`, `lark-cli`). Project preflight resolves each through PATH and refuses the project when one is missing. Without this, a missing CLI turns into an Agent searching the filesystem for it — and in one real run, into a locally rendered fake video that passed its own QC.
- `sideEffects: [paid-production]` on any stage that spends money, `[external-publication]` on any stage that posts. Declare it even for a batch: a project whose inputs carry `authorizationScope.paidProduction: true` satisfies that gate for its own items, so declaring the side effect does not produce an approval card per item. Publication still approves per target, because it binds an account and a device. A stage that spends money without declaring it also keeps its spending out of the external-operation ledger.

## Outputs are files

Declare as few outputs as the next stage truly needs, each one a concrete file.

- Every `completeWhen` rule reads `output.<name>.<fact>` from the artifact the handoff points at: a top-level JSON field, or a `name: true` line in a text file.
- The validator derives some facts by itself — file exists (`accessible`/`exists`), written during this run (`newForThisRun`), JSON `status` is terminal (`terminal`), `items[]` non-empty with ids and titles, and URL reachability for an `https-url` contract. Prefer those over asking the Agent to assert something.
- Keep one artifact name and format for a thing across the whole file. `.md` in one stage and `.json` in the next is a blocked card.
- An extra entry in a handoff is ignored; a missing declared one fails with its name. Do not warn about "extra entries" in the workflow text.

A produce stage that makes one video needs one output: the finished file, checked with `newForThisRun`. QC, run state and delivery manifests are only worth declaring when a later stage reads them.

If you do declare a QC output, name the script that writes it, in the stage description: `bash <skill dir>/scripts/<name>.sh …`. A stage told to "run machine QC" and hand back a passing report will invent one — OCR, scene detection, beat matching — and spend longer checking the file than making it. An output nobody can produce deterministically is better left undeclared.

## Data that must travel between stages

A stage that splits work into content items writes them with everything downstream needs on each item:

- `id`, `title`, `route` (the engine dispatches per-item stages only when the item itself carries `route`), `status: "planned"`;
- any business fact a later stage needs (target duration, language, market).

Facts come from the authoritative source or the project inputs. When the source does not state one, write `null` and let the stage that needs it decide and record why. Never let a stage invent a number that looks authoritative — a planning document with no duration requirement produced ten items all claiming "10–15s".

## Paid work

- One unit of output = one submission. If a stage can submit twice for the same item, it will.
- Ask the user, before authoring: what does one unit cost, and how many paid calls per unit is acceptable? Write the answer into the stage description ("one `makaron-cli chat` submission per video"), not as a numeric cap in prose.
- Let the executor decide how to reach the result. A brief that prescribes 13 shots, best-of-2 candidates and a whole-video retake costs 21 paid generations per video; the same brief written as one page of intent costs 1.

## Keep the file short

`workflow.md` holds the current contract. It does not hold version history, "X relative to Y" change notes, past incidents, table column lists, or rules for a stage that no longer exists. One real file carried 90 lines of changelog that no reader could tell was still in force. Put history in git and in the review doc; put table field names in the system that owns them (`lark-cli base +field-list`), and read them at runtime.

## Hard checks before publishing

1. **Objective reaches the Agent** — for every routed stage, the route `description` alone is enough to do the work.
2. **Handoff file identity** — each output names one artifact file and format, and every downstream stage reads that same name and format.
3. **`completeWhen` ↔ format alignment** — a `.json` artifact is checked by JSON field path; a `.md` artifact by a `Key: true` line the stage is told to write.
4. **No contradictory `outputContracts`** — never require an output a path skips under some `deliveryMode`.
5. **The CLIs are declared.** `spec.requiredCommands` lists every command the stages call (for example `makaron-cli`, `lark-cli`). Without it, a host that is missing one turns a card into a filesystem search, and in one real run into a locally rendered fake video that passed its own QC.

6. **Every script the workflow names exists.** A step that depends on a "known gap" script sends the Agent searching the whole filesystem for it. Either ship the script in the owning Skill or leave the step out.
7. **No "wait for a reshoot" fallback** — when material is missing, switch the copy/angle to what existing footage supports. Nobody reshoots.

## Verify before it goes to production

Validation only proves the file compiles. Before publishing to production, run it as a test project with the same release, one item per route, and read the numbers:

- did every card complete without a blocked state;
- tool calls per card (a brief or produce card should be tens, not hundreds);
- paid generations per unit of output;
- wall-clock per card.

Then look at the run for work that is not the work: an Agent reading other projects' directories, reading engine source, inventing its own QC, or searching for a tool. Every one of those traces back to a line in the workflow or a stage Skill — fix it there, and run again.

Never edit a published release. Change the version, publish a new SHA, and keep existing projects pinned to their original release.

## Timed release (`releaseAt`)

A stage that must not run before a wall-clock moment declares `releaseAt`. Do not model this as a waiting stage, a `humanTask`, or a Gateway cron job.

The card is created as soon as its dependencies are met and sits in the board's `Scheduled` column carrying its release moment. The board refuses to start it early and releases it on the first scheduler pass at or after the moment.

```yaml
# A recurring local window. This is the common one.
releaseAt:
  dailyAt: "21:00"                                 # 24-hour HH:MM
  timezone: "${input.publicationTarget.timezone}"  # or a literal IANA zone name
```

```yaml
# One exact instant, per video.
releaseAt: "${item.publishAt}"    # e.g. 2026-09-18T01:00:00Z
```

Rules:

1. `dailyAt` resolves in the named zone on the target date, so a nightly 21:00 in New York stays 21:00 across the daylight-saving change. Never write a fixed UTC offset.
2. `timezone` must be an IANA zone name. Interpolate the market's own zone rather than repeating it.
3. Without a `date`, the stage waits for the next occurrence at or after the moment it became eligible. A video finishing at 22:30 local goes out the following night.
4. `${item.…}` resolves on content-item stages only; `${input.…}` on both.
5. An unresolvable `releaseAt` fails validation at publish. It never degrades to "publish now".
6. The hold is independent of approval; an approved card still waits.
7. `waitUntil` is the older spelling of the absolute form and still works.

## Check preconditions before spending, and stop in words a person can act on

Two rules for every Workflow:

1. **A precondition the run depends on is checked in the first stage that can see it, before any paid stage.** Footage coverage, account access and input completeness are examples. A condition that fails there stops one card before anything is spent. The same failure discovered at production stops every item after money is spent. On 2026-09-28, 中纺 had one source video; the brief stage reused it in 30 briefs, and Makaron then failed to fetch it. Write the check into the stage's Goal with a concrete rule, for example "one distinct source video supports at most 5 remix items". Never leave "if materials are missing, adapt" to the Agent's judgement.
2. **A stage that cannot proceed blocks its card and opens its final message with two lines.** Every card brief asks for them too. The engine shows them on the 需要你 card, and they decide whether a person is asked at all:

```
需要人做：<the one thing only a person can do, as a plain instruction of at most 40 Chinese characters that says what to give or fix and where, with no ids or field names — or 无 when a new attempt may fix it>
原因：<one sentence on what actually happened, with the numbers; not the name of a rule>
```

`无` hands the stop to Night Shift, which goes on by itself (at most twice per item and stage, at most one extra payment) before it asks anyone. A missing precondition is never 无: say what is missing and where to add it (「请在素材库里补 5 段不同的视频素材」).

Stage Skills say when to stop and use these two lines. An Agent that improvises instead is the failure mode to design out: downloading footage to measure it, inventing its own QC, or quietly shrinking the job.

## Completion notice (`notifications`)

To have Night Shift send a Feishu card when a project finishes, declare this under `spec`:

```yaml
notifications:
  instanceCompleted:
    enabled: true
    to: "oc_…"          # optional: a group, or "user:ou_…" for one person
```

Rules:

1. Without `enabled: true`, no card is ever sent, even to a project that records its own chat.
2. A project's own `collaboration.sourceChatId` wins over `to`. `to` is the fallback for projects no person asked for, such as those a daily cron script creates. Every Workflow whose projects come from a schedule must declare `to`; otherwise those projects finish silently.
3. `to` is a bare `oc_…` or `user:ou_…`. It is not `chat:oc_…` and not a name. Anything else fails validation with `notifications.to.invalid`.
4. `reviewRequested` is still accepted, and ignored.
5. Changing `to` means a new version. Projects already created stay pinned to their release; for those, set the target with `nightshiftctl projects collaboration`.

## Multi-language routing (fixed by 康浩源 2026-09-10)

`publicationTarget` is single `market` + single `language`. A multi-language / multi-market demand splits into one independent project per `market + language`, each packaged separately. When the human-facing demand changes language/market/count, update the authoritative source first (the project's input table in Feishu Base, or `nightshiftctl projects inputs`), then run; never act on chat-only wording.
