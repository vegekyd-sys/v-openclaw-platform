# Authoring a stage Skill

A stage Skill says **what to make**. The Agent already knows how to work. Most Night Shift cost and latency came from stage Skills that described a production method in detail, or tried to police the Agent's behaviour.

## Shape

One page. A trigger line, the inputs to read, the steps in order, and the exact output template to fill in. If it runs past ~80 lines, something in it is method, policy or history that belongs elsewhere.

The output template is where quality comes from. Give the literal file to produce, with the headings and the one or two fact lines completion reads. An executor filling a template is cheap and consistent; an executor reading rules and inventing a document is neither.

## What belongs in it

- The single output file name and format, and the fact lines it must end with.
- The few upstream files to read — by path, not "every artifact referenced".
- The one command pattern that does the work (for example `makaron-cli chat --media-manifest …` for a remix). Prefer the pattern the tool's own Skill already documents; do not invent a second way to call it.
- The red lines that change the result: what must not appear in the output, what must never be invented (product appearance, certifications, numbers).
- What to do when material is missing: switch angle or copy within this stage, and say so in the output.

## What does not belong in it

- **Behaviour rules for the Agent.** No "do not poll", no "do not read SKILL.md", no "run `command -v` first", no per-card tool-call budgets. A missing CLI is an ops problem, caught by `requiredCommands` at project creation.
- **A production method the executor owns.** Shot counts, per-shot durations, candidate comparisons, retake policy — these decide the bill. Say the target length and the intent; let Makaron decide the shots. (13 shots at 2–4s with best-of-2 cost 21 paid generations for one 40-second video; the one-page version costs 1.)
- **Self-QC tables.** If a check matters, ship it as a script in the Skill directory and name it; otherwise leave it out. An Agent asked to "verify quality" will invent OCR, scene detection and beat matching, and spend longer on QC than on the video.
- **Another Skill's contract.** Point at it. Two Skills describing the same handoff drift apart, and the Agent reads both.
- **Memory writes.** Cards may read memory but do not write it. A Skill a card loads must not tell it to record a reflection, a daily note or a lesson. Put the lesson in the Skill itself.
- **Orchestration semantics.** Approval gates, Base write ownership, retry policy and stage dependencies live in the Workflow, not in a Skill that a chat turn may also load.

## Fixed scripts instead of instructions

When a stage needs a deterministic check or transform, put a script in the Skill directory and name it in one line:

```bash
bash <skill dir>/scripts/<name>.sh <input> <output> [args]
```

Say plainly that the script is the whole check. Without that sentence, the Agent treats it as a starting point and adds its own.

## One Skill per job

Two Skills for one stage (a "contract" Skill plus a "writer" Skill) means the Agent reads both, reconciles them, and follows the longer one. Merge them, keep the name the Workflow references, and leave the old file out of the stage's `skills` list.

## Before you ship it

Run the stage once as a test project and read the transcript, not just the output. Tool calls that are not the work — searching for a tool, reading other projects' directories to copy their format, re-running checks — each trace back to a line you wrote. Fix the line, run again.
