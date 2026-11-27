---
name: "makaron-long-video-production"
description: "Produce long Makaron videos: V supplies goals and constraints; Makaron handles storyboards, segments and production."
---

## V brief / Makaron production boundary

V conveys goals, verified facts, available media, user-required constraints and delivery specifications. Makaron owns scripts, shots, pacing and production. Preserve selected template core and technical contracts; treat example timings and camera choices as adaptable defaults unless the user explicitly requires exact replication. Trace hard requirements to the user, selected template or actual tool contract; V creative suggestions are optional. Pass selected Makaron Skills through server-discovered --skill where supported, not local private paths. Review unmet outcomes and template fidelity rather than overwriting production solely to match V taste.

# Makaron Long Video Production

## Mission

Create coherent videos longer than 15 seconds with Makaron's long-video production flow.

This skill is no longer primarily a manual segment-splitting recipe. The default path is:

> **V writes the creative brief and constraints. Makaron executes the long-video production. V supervises through cards, confirms gates, validates duration/quality, and triggers rerolls when needed.**

Manual segmentation is now a fallback or a Makaron-internal implementation detail, not V's first move.

## Core principle

**Brief first, then delegate production to Makaron.**

For >15s user-facing work, V should not micromanage every shot unless the task requires it. V should provide Makaron with:

- the story / goal / audience
- key visual anchors and preservation rules
- duration, aspect ratio, platform
- must-have / must-avoid constraints
- quality bar and acceptance criteria
- permission policy for confirmation gates

Then Makaron should produce the long video, including any internal anchors, storyboards, segment plans, rendering, stitching, or timeline work it needs.

## Feishu/Lark UX red line

For visible long-video work in Feishu/Lark, use **one real-time task card updated in place**. Do not send a chain of ordinary text progress bubbles.

Reference the Makaron skill's card workflow and `feishu-channel-cards`:

- create one task card quickly
- put the Makaron project link on the card immediately
- update the same card for every user-facing milestone
- show V↔Makaron production gates on the card as visible progress/checkpoints
- show current Makaron output in one overwritten "Makaron 说" / progress block, not an append-only dump
- show outputs and final action buttons on the card
- after final card + artifact delivery, avoid repeating the same content in ordinary text

### Card stages for long video

Use these as user-facing stages, adapting to Makaron's actual output:

1. **准备 brief / 素材** — V writes the brief, checks references, sets duration/aspect.
2. **项目已创建** — Makaron project link is visible on the card.
3. **锚点 / 分镜 / Gate** — Makaron may create character, scene, prop, storyboard, segment or timeline gates.
4. **V QC / 可插话 checkpoint** — V evaluates each gate, summarizes it on the card, sends any non-text assets as attachments, and continues when QC passes. Human approval is not required by default; the user can interrupt with feedback at any time. Stop for human confirmation only when V flags low confidence, a major creative fork, safety/rights/cost risk, or the user explicitly requested step-by-step approval.
5. **视频渲染中** — show task IDs or human-facing render status.
6. **下载 / 拼接 / QC** — validate duration, inspect keyframes, note any reroll.
7. **完成 / 等待反馈** — final artifact delivered; card has project link and final actions.

### Confirmation gate policy — V QC by default, human interrupt available

Makaron often pauses at gates such as: anchors, segment plan, storyboard, render approval, reroll decision, music/subtitle choice.

- **Default: gates are V↔Makaron production checkpoints, not human approval checkpoints.** V reads the gate, compares it to the brief, performs QC, updates the card, sends non-text assets, and continues if the gate passes.
- **Human visibility is mandatory. Human blocking is not.** The user should see current status, intermediate images/videos, and V's QC summary on the card, but should not need to type “ok” for every normal gate.
- **User feedback can interrupt anytime.** If the user comments that an intermediate asset/direction is wrong, treat it as feedback for the latest active Makaron task; pause or reroll the relevant part and update the same card.
- **Stop and ask the human only when needed:** low V confidence, failed QC, identity/face drift, safety/rights sensitivity, major creative fork, substantial cost/time tradeoff, unclear user intent, or the user explicitly asked for step-by-step approval.
- **"开做 / 开始 / 直接做 / 交给 Makaron" means start production with V QC supervision.** It does not mean blind Makaron execution; V still reviews gates and may reroll/correct.
- **"每一步都问我 / 等我确认 / 先别继续" overrides default.** In that case, turn gates into human approval points until the user changes the policy.
- Never mark "Makaron paused for confirmation" as a failure. It is the expected workflow state; V should decide whether to continue, reroll, or ask the human.

## Non-negotiables

1. **V writes the brief first** — do not hand Makaron a vague "make a long video" request.
2. **Default to Makaron long-video execution** — for >15s, give Makaron the full brief and let it manage long-video production.
3. **Do not manually split first** — only create manual <=15s segment prompts when Makaron lacks support, fails, or specifically needs V to provide segment-level structure.
4. **Project link early** — the Makaron project URL must appear on the Feishu/Lark card as soon as available.
5. **Cards, not progress bubbles** — every long Feishu/Lark task needs one updated card.
6. **Confirmation gates require V QC, not default human approval** — surface anchors/storyboard/segment/render gates on the card, let V review and continue when they pass, and ask the human only for low-confidence/risky/strategic decisions or when the user explicitly requested step-by-step approval.
7. **Use the right polling mode** — visible card workflows should use the Makaron card runner / watch-event pattern in an isolated child session. Use `responses get <runId> --json` for recovery, final verification, or non-interactive checks; do not block the inbound Feishu session.
8. **Actual duration validation** — verify media duration before claiming a 30s/60s output.
9. **QC before final** — inspect the output for role drift, unwanted text/logo/subtitles, bad anatomy, continuity breaks, and duration mismatch.
10. **Do not hide fallback** — if a manual stitch/rough cut/deterministic edit is used, label it honestly unless it is the intended final method.

## Anchor model

Anchors are **derived from the brief/script**, not chosen from a fixed taxonomy.

Makaron may create its own anchors/cards. V's job is to define what must stay stable:

- character identity
- product/object identity
- environment/world
- before/after state
- process/proof evidence
- data/graphic constraints
- style/rhythm
- start/end emotional states

For each critical anchor, V should specify:

```md
## Anchor: <name>
- Derived from beat(s):
- Pattern/type:
- Role in story:
- Visual description:
- Source path/url or generation prompt:
- Must preserve:
- Must avoid:
- Used in segment(s) or whole video:
```

If Makaron generates anchors, V reviews them as a production QC gate:

- if the anchors pass the brief and identity/style checks, V records the QC summary on the card and continues;
- if an anchor is close but needs correction, V sends targeted feedback/reroll instructions to Makaron and records the correction on the card;
- if V is unsure or the decision is risky/strategic, V asks the human for confirmation;
- if the user explicitly requested step-by-step approval, V waits for the user before continuing.

## Workflow

### 1. Define output target

- total duration: 30s / 45s / 60s / other
- aspect ratio and platform
- target audience
- desired emotion / story arc
- source materials and references
- must-have shots/claims
- must-avoid issues
- confirmation policy: default V QC at every gate; ask user only for low-confidence/risky/strategic decisions or explicit step-by-step approval

### 2. V writes the long-video brief

The brief should include enough structure for Makaron to execute without guessing, but should not over-control every frame unless needed.

Recommended brief shape:

```md
# Long-video brief

## Goal

## Duration / aspect / platform

## Story logline

## Beat sheet
| Time | Beat | Visual goal | Audio/text | Critical anchors |
|---|---|---|---|---|

## Anchors / preservation rules

## Must avoid

## Quality bar / acceptance criteria

## Confirmation policy
Makaron may create anchors/storyboards/segment plans. Default behavior: every gate must pause for V QC, not human approval. V should update the card and continue when QC passes; ask the user only for low-confidence/risky/strategic decisions or if the user explicitly requested step-by-step approval.
```

### 3. Submit to Makaron as one long-video job

Default: create/continue a Makaron project and submit the whole brief.

The prompt should say explicitly:

- this is a long-video production task
- produce the requested duration if supported
- if Makaron internally segments, it should manage stitching/timeline or return usable segment artifacts
- stop at every normal gate for V QC; continue automatically when V QC passes, and ask the user only for low-confidence/risky/strategic decisions or explicit step-by-step approval
- final output must include video artifact/task IDs/links

### 4. Drive the live card from Makaron output

Read Makaron's live output and update the same card dynamically:

- text/script output → card status `Makaron 正在输出方案`
- anchor/storyboard gate → card status `V QC 中 / 阶段预览`; V reviews and continues if QC passes; use `等待用户确认` only for low-confidence/risky/strategic decisions or explicit step-by-step approval
- video render event/task ID → card status `视频渲染中`
- video URL → card status `视频已生成，下载/QC 中`
- delivery → card status `已交付，等待反馈`
- issue/reroll → card status `发现问题，返修中`

Do not expose raw commands, tool names, local paths, tokens, stack traces, or unfiltered logs on the card.

### 5. Confirmation and continuation

When Makaron pauses with text and no video:

1. Treat it as a normal V↔Makaron production gate, not a failure.
2. Read the proposed anchors/storyboard/segment plan.
3. Compare against V's brief and perform QC: identity, style, continuity, platform fit, text risk, duration plan, and user intent.
4. Update the same card with the human-facing summary and send any non-text assets as attachments.
5. Decide:
   - **QC pass:** continue with Makaron immediately; do not wait for a human “ok”.
   - **QC fix needed:** send targeted correction/reroll instructions to Makaron and keep the card updated.
   - **Human decision needed:** stop at `等待用户确认` only for low-confidence, high-risk, major creative fork, budget/time tradeoff, unclear intent, or explicit step-by-step approval mode.
6. If the user sends feedback while V/Makaron are progressing, treat it as an interrupt for the latest active task and adjust/reroll the relevant part.

### 6. Validate and QC

Before final delivery:

- download/obtain the video artifact when possible
- verify actual duration with media metadata
- inspect representative frames/key moments
- check continuity across internal segments if any
- check character/product identity preservation
- check for unwanted text, watermarks, subtitles, malformed UI, or role drift
- if quality is clearly below bar, reroll the affected part and explain on the card

### 7. Deliver

Final delivery should include:

- video file or accessible video link
- Makaron project link
- concise QC note / known caveat if any
- final card buttons: confirm delivery, regenerate/adjust, open Makaron project when available

If the artifact has been sent through Feishu and the card contains the status/link, the final assistant text may be `NO_REPLY` to avoid duplicate content.

## Fallback: manual segmentation

Only use manual segmentation when:

- Makaron long-video execution is unavailable
- Makaron repeatedly fails to manage the duration
- user requests exact segment-level control
- a partial reroll is needed for one bad section
- the source/reference must be constrained to <=15s clips

If manual segmentation is needed:

| Segment | Time | Purpose | Start anchor | End anchor | Inputs | Acceptance criteria |
|---|---|---|---|---|---|---|

Then generate/reroll only the necessary segment(s), stitch, validate duration, and label any rough/diagnostic cut honestly.

## Output format

1. V-written long-video brief
2. Makaron project link
3. Live card stages / confirmation gates
4. Generated video task IDs or links
5. Final artifact delivery
6. Duration validation
7. QC result and next-iteration note

## Relationship to viral replicate

`viral-reference-replicate` decides what to copy. This skill makes the >15s video.

Typical flow:

```txt
viral reference selected
→ video-analyze blueprint
→ V writes adapted long-video brief
→ Makaron long-video production
→ card-supervised gates
→ render / QC / reroll if needed
→ final artifact
```
