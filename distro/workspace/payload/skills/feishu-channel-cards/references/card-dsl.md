# Feishu Card DSL

Use a small, project-agnostic DSL and render it to Feishu/Lark card JSON.

The DSL exists so every project can reuse the same interaction pattern instead of hand-writing custom Feishu cards.

## Shape

```js
const card = {
  title: '任务标题',
  subtitle: 'optional short context',
  status: '处理中',
  color: 'purple', // purple | green | red | yellow | turquoise
  progress: 42,   // optional 0-100
  summary: ['关键结论 1', '关键结论 2'],
  sections: [
    {title: '进度', lines: ['已提交', '等待渲染']},
    {title: '产物', lines: ['视频已发送'], links: [{text:'打开项目', url:'https://...'}]},
  ],
  actions: [
    {text:'确认交付', type:'primary_filled', callback:{action:'accept'}},
    {text:'重新生成', type:'default', callback:{action:'regen'}},
    {text:'打开文档', type:'primary', url:'https://...'},
  ],
  done: false,
  failed: false,
}
```

## Rendering rules

- Header: `title`, `color` → `header.title`, `header.template`.
- Summary: use `lark_md`, `text_size: large`, max 3 bullets.
- Status: one prominent line + progress bar.
- Sections: one `div` per section; keep each section short.
- Links: prefer buttons for primary links; inline links only for dense reports.
- Callback buttons: stable action payloads (`{oc:'ocf1', a:'...', jobId:'...'}`).
- Paired actions: `column_set.flex_mode: 'bisect'` for 1:1 width.

## Standard card types

### Long task live card

Use for any long-running Feishu task.

Stages:

1. Prepare / collect material
2. Execute / generate draft
3. Validate / build / check
4. Deploy / upload / send artifact
5. Done / waiting for confirmation

The same card must update through all stages.

### Report-web live card

Use while building a web report.

- Step 1: scan / gather source material
- Step 2: draft report page
- Step 3: build locally
- Step 4: deploy
- Step 5: verify online URLs
- Final: show report link + collection link

The web page is usually static after deploy; the card is the realtime surface.

### Report delivery card

Use after a report is complete.

- Title + `完成`
- 1-3-line summary
- Links: report, archive, document, Bitable, dashboard, artifact
- Next actions

Do not then repeat the same report link and summary in ordinary text.

### Approval card

Use when the user must decide.

- What needs approval
- Decision summary
- Risks/assumptions
- Buttons: approve / revise / reject / skip

### Alert card

Use for dashboard/stalled/liveness incidents.

- What happened
- User impact
- Current status
- Action taken
- Next action / button if any

## Anti-patterns

- Raw command output or stack traces.
- Long paragraphs copied from tool results.
- Tiny text on mobile.
- Too many buttons.
- Cards for ordinary one-line answers.
- Start card + final card with no in-place updates.
- Repeating final card contents again in ordinary chat text. If the card has the result, final assistant response should usually be `NO_REPLY`.
