# Feishu external-image card recovery candidate

Production logs on 2026-11-03 show one task-presentation card repeatedly failing
with `200570` (an HTTP image destination is not a Feishu image key), then `300309`
when its final body uses the streaming endpoint after the card is closed. The
same card is retried roughly once per minute. This is a delivery failure, not
proof of the separate Gateway/Worker delays.

The candidate patch keeps external HTTP(S) images as clickable Markdown links,
without downloading model-authored URLs. Native image keys and code examples
remain intact. Empty alt text becomes `图片`. Initial, intermediate and final
text share the normalization, and receipts/checkpoints contain accepted text.
Final bodies use the existing whole-element replacement path, including when
recovering a remotely closed card. API rejection still rejects finalization.

Scope: inline HTTP(S) Markdown images in the native streaming-card body. This
is not a general Markdown parser, image uploader, static-card rewrite, or repair
of all existing failed tasks. Reference-style images and HTML images are not
covered. Code-span handling is intentionally conservative for incomplete streams.

Validation:
- Local: 33/33 tests (6 new contract tests plus 27 existing presentation tests).
- VLab candidate `candidate-8ad4c30a-19bc-4bc9-850f-84d9d00529fc`: 6/6, runtime
  `codex-context-batch-20261101-v1`, runtime hash
  `3abc100716a6c3155e2abbe72a3e1f310ea41ee23ef16eb3467ffc2bfab447a3`.
- Candidate reads the current cached runtime class, patches it in memory and
  executes it with a recording fake CardKit transport. Baseline reproduces both
  rejections; candidate covers partial/final, closed-card recovery and failed
  final receipts. No Gateway or model invocation. Shared PID unchanged.
- Server execution 4.065 s, client 20.881 s. Tests themselves 0.184 s.

Not merge/release ready: no real CardKit or visible-message test was performed;
this monitor batch does not authorize new messages. Before release, port to
`openclaw-versa` `extensions/feishu/src/streaming-card.ts` with source tests,
record the source commit, generate current release bytes/source-map, and verify
an authorized real closed-card recovery. No capture or release plan is included.
The source port is a remaining deliverable, not implied by the patch-script tests.
Tianyi decides merge and deployment separately.

Contracts consulted:
- https://open.feishu.cn/document/feishu-cards/feishu-card-cardkit/components/markdown
- https://open.feishu.cn/document/cardkit-v1/card-element/update
- https://open.feishu.cn/document/cardkit-v1/card-element/content
