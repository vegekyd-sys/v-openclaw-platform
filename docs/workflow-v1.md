# Night Shift workflow.md standard

Status: DRAFT

`workflow.md` is the only author-maintained command file for a Night Shift product workflow. It combines readable operating guidance with strict machine metadata. The engine compiles it into an immutable internal release; operators never maintain a second YAML or graph file.

## Authoring contract

One file contains:

1. YAML frontmatter for workflow identity, inputs, concurrency, content routes, and logical Agent roles.
2. Human-readable Markdown explaining the business workflow.
3. One `## STAGE id｜title` section per business stage.
4. One fenced `stage` block per stage for actor, scope, skills, dependencies, outputs, completion, retry, approval, and idempotency metadata.

The visual designer reads and writes this exact Markdown document. Publishing freezes the parsed result and SHA-256. Running instances remain pinned to that release.

## Import and visual editing

Operators use **Workflows → Import Workflow** to upload a `.md` file, inspect its stages visually, edit stage metadata, validate it, and publish an immutable release. The Markdown source remains available only under the advanced editor; it is not the primary operating surface.

Agents such as V use the same contract through the control-plane API:

```http
POST /api/workflows/import
Content-Type: application/json

{
  "sourceMarkdown": "<complete workflow.md>",
  "publish": true
}
```

`publish: false` validates and stores a draft. `publish: true` returns the draft plus the immutable release. A changed definition must use a new `metadata.version`; an active instance remains pinned to its original release SHA.

## Create a project

Operators create a project from either the selected Workflow or the Projects page. The UI derives required inputs and logical Agent roles from the immutable release, then calls:

```http
POST /api/instances
Content-Type: application/json

{
  "id": "NS-CUSTOMER-CAMPAIGN",
  "name": "Customer campaign",
  "workflowSha256": "<immutable release SHA>",
  "inputs": { "<workflow input>": "<value>" },
  "agentBindings": { "<logical role>": "main" },
  "status": "active",
  "dispatch": true
}
```

The control plane validates required inputs, input types, and every Agent binding before writing. An active project is immediately ticked and dispatched, while its Workflow SHA remains immutable for the lifetime of the project.

## Project and video-task model

- `WorkflowRelease`: one reusable workflow definition, such as Xingqing content delivery.
- `Instance`: one customer or planning-document run of that release.
- `ContentItem`: one planned video inside an instance.
- `ContentItemRun`: one stage execution for one video task.

A project-scoped planning stage creates the content backlog. Stages with `scope: content-item` fan out automatically. One project may therefore run `AI_GENERATE` and `SCENE_EDIT` tasks at the same time without creating separate workflows.

Route-specific behavior belongs in `routeStrategies`, while approval, retry, Workboard dispatch, and state ownership stay generic engine capabilities.

## Safety and lifecycle

```text
workflow.md draft -> validate -> simulate -> immutable release -> many instances
```

Validation rejects duplicate stages, cycles, unknown routes, unsafe side effects without approval, missing skills, unbounded retries, and content-item stages without a content-item contract.

Paid production and publication use per-content-item idempotency and approvals. Base, Scene, Makaron, GeeLark, and Apify remain adapters and evidence sources; Workboard is the human-facing control surface.

See [`../examples/workflows/xingqing-content-delivery.workflow.md`](../examples/workflows/xingqing-content-delivery.workflow.md) for the first complete template.
