# Night Shift product memory

## Product identity

Night Shift is Versa's general AI-operations product. A user defines a reusable `workflow.md`; the same immutable Workflow release can run many customer or internal projects. Agents autonomously claim and complete work, while people review only the stages that require judgment or authorization.

The first reference workflow was a customer content-delivery line. Night Shift is not specific to it and must also support Makaron asset production, template generation, and future workflows without workflow-specific scheduler code.

## Sources of truth

- `workflow.md`: author-maintained process definition.
- Night Shift control plane: Workflow drafts/releases, projects, approvals, audit events, and deterministic stage projections.
- OpenClaw Workboard: canonical cards, status, claims, heartbeats, attempts, logs, `sessionKey`, and `runId`.
- OpenClaw Session Store: canonical Agent transcript.
- Business systems: authoritative Feishu Base, Makaron and Apify objects.

Live Board is an upgraded UI over native Workboard. It must not copy cards into a second task store or invent a second Agent Session lifecycle.

## Xingqing seven-stage reference

1. `plan` — read the planning source and split it into stable video ContentItems.
2. `route` — decide `AI_GENERATE` or `SCENE_EDIT` independently for each video.
3. `materials` — freeze traceable inputs or wait for missing shooting/material work.
4. `brief` — compile one immutable executable FinishedVideoBrief per video.
5. `produce` — execute the brief, produce a new asset, run machine QC, and declare deliverables.
6. `review` — a gate resolved by an approve action. In the current D contract the approve is triggered by cron (market-local 20:00), not by human playback; human authorization happens in the Base buffer table (「可发布」). Read the pinned Workflow's `review` stage for the authoritative rule; do not restate it here.
7. `publish-feedback` — after separate authorization, publish idempotently, read back the public result, collect metrics, and write the next-iteration note.

Project-level planning fans out into content-item stages. A 10-video project has one project `plan` card and independent downstream cards for every video; one blocked video must not erase or silently complete the other nine.

## Runtime and code ownership

- Product code, deployment assets and rollback: the Night Shift service, maintained by whoever deployed this V.
- V identity, this Skill, domain Skills and durable guidance: this V's workspace.
- Runtime state, SQLite, sessions, credentials, media, customer data, logs, and backups stay server-side and never enter Git.

V does not change, upgrade or redeploy the Night Shift service; the deployer maintains it.

## Current production contract

- Production board ID: `nightshift`.
- Logical role `content-operator` binds to this V's Agent `@@AGENT_ID@@` unless a project explicitly chooses another compatible Agent.
- A test service, when there is one, is separate from production state and port.
- Public access must be authenticated; local Agent operations use the loopback control endpoint.
- Workflow publish, paid production, human video approval, and external publication are distinct decisions.
