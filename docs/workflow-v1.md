# Night Shift Workflow v1

Status: DRAFT

`workflow.yaml` is the canonical, versioned command file for a Night Shift
workflow. The visual editor reads and writes this schema; it does not maintain
a separate graph definition.

## Minimal example

```yaml
apiVersion: nightshift.versa.ai/v1alpha1
kind: Workflow
metadata:
  id: example-content-delivery
  version: 0.1.0
  name: Example content delivery
spec:
  ownerAgentRole: content-operator
  concurrency:
    perInstance: 1
    maxActiveInstances: 3
  inputs:
    briefUrl:
      type: string
      required: true
  stages:
    - id: plan
      title: Understand and plan
      actor: agent
      skills: [source-reader, planning-skill]
      outputs: [planUrl]
      completeWhen:
        - output.planUrl.exists
      retry:
        maxAttempts: 2
        idempotencyKey: "${instance.id}:${stage.id}:${input.hash}"
      next: [produce]

    - id: produce
      title: Produce deliverable
      actor: agent
      skill: makaron
      needs: [plan]
      sideEffects: [paid-production]
      approval:
        before: paid-production
      outputs: [deliverableUrl]
      completeWhen:
        - output.deliverableUrl.reachable
      retry:
        maxAttempts: 2
        idempotencyKey: "${instance.id}:${stage.id}:${input.hash}"
```

## Required stage semantics

Every agent or external-action stage declares:

- stable `id` and human-readable `title`;
- `actor`: `agent`, `human`, `timer`, or `system`;
- explicit dependencies through `needs` or `next`;
- typed inputs and outputs;
- ordered `skills` or a deterministic handler (`skill` remains a supported
  single-skill compatibility form);
- machine-verifiable completion rules;
- timeout, heartbeat, retry, and idempotency policy;
- side-effect classes and required approval scope;
- evidence that must be attached to the native Workboard card.

Agent roles are logical and portable. Environment bindings resolve them to a
real OpenClaw Agent ID at instance start; missing bindings block before card
creation.

Human stages do not start placeholder Workers. They create a Workboard Review
card with approve, reject, request-changes, and evidence actions.

## Lifecycle

```text
draft -> validated -> lab-simulated -> published -> deprecated
```

- Publishing freezes the content and hash.
- A running instance cannot silently move to a newer release.
- Migration is an explicit operation with compatibility validation and audit.
- Visual edits create a draft; they never mutate a published release.

## Validation

Validation rejects:

- duplicate stage IDs, cycles, dangling dependencies, and unreachable stages;
- agent stages without a skill/handler;
- external side effects without idempotency and readback rules;
- paid, publish, destructive, or permission-changing actions without approval;
- outputs referenced downstream but never declared upstream;
- unbounded retry, missing timeout, or unavailable agents/skills;
- secrets embedded in the workflow file.

## Execution identity

Each StageRun uses:

```text
workflow_release_sha + instance_id + stage_id + input_hash + attempt
```

The side-effect idempotency key excludes `attempt`, so a retry cannot submit a
second paid or publishing operation for the same logical input.
