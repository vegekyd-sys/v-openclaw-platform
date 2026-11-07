# Feishu cards V writes itself

Goal (Tianyi, 2026-11-04): in Feishu conversations V opens a card on its own when content reads
better as UI, and decides when and how. No limits on what the card contains.

## Why V never did it

- V could already reply with card JSON (`readNativeFeishuCardJson`), but only the `message` tool
  path honoured it; the conversation reply dispatcher builds a card only from a structured
  `presentation`, so a card-JSON reply streamed into the reply card as raw JSON.
- `sanitizeNativeFeishuCard` rebuilt every model card from four elements (header, markdown with
  `<>` escaped, hr, buttons). Tables, columns, charts, panels and images were dropped. Upstream
  `@openclaw/feishu@2026.10.10` has the same allowlist; SDK 1.73 → 1.76 changes nothing here.
- The plugin's tool hint says only "Feishu supports interactive cards", and AGENTS.md said nothing.

## Change

- `reply-delivery-result-CEFTDA3f.js` (stock 9.1 on V): the model's card is sent as written
  (unwraps `{type:"interactive",card}`, accepts v2, v1 and template cards) inside the existing
  30 KB / 200-element envelope. Mentions go first in v1 and v2 cards. When Feishu rejects a
  model card, `sendCardFeishu` re-sends its text (title, prose, tables as markdown) so the reply
  is not lost, and logs `model card rejected, sent as text`.
- `monitor.account-WFdlCDhR.js` (V's feishu-card-images bytes): a final reply whose text is a card
  JSON is sent as that card (the streaming preview is discarded, as for any presentation), and a
  partial that starts with `{` is not streamed into the preview.
- AGENTS.md section `lab/feishu-card-open.agents-section.md`: what a card adds beyond markdown,
  when it is the default (structured results) and when not (chat, short answers, progress), the
  JSON 2.0 skeleton and one example per component. V's AGENTS.md lives in its workspace git, not here.

Build: `node lab/build-feishu-card-open.mjs` (plan `lab/feishu-card-open.plan.json`).
Tests: `lab/feishu-card-open.test.mjs` (6).

## Candidate (2026-11-04 CST)

`lab/feishu-card-open.candidate.plan.json`; V's boot documents are hash-pinned inputs from
`~/v-upgrade-private/feishu-card-open/v-workspace/` (copied from V 2026-11-04, never in git).
Private Gateway, worker harness, deepseek-flash (V's primary), renderMode auto as on V, real VLab
app; prompts are signed loopback events into Tianyi's DM with「V - Lab」, fresh session each.

`candidate-9f85174b-f17f-4163-a041-ca3432dec811`: 20/20, 410 s.

| Prompt | V chose | Components | Reply time |
|---|---|---|---|
| 三款旗舰对比 | card | table, markdown, header | 128 s (web research) |
| 跑量趋势 | card | chart, table, colored text | 30 s |
| 今天好累 | text | — | 4 s |
| 周六带爸妈行程 | card | table, markdown | 66 s |
| 1 英里多少公里 | text | — | 4 s |

Feishu accepted the demo card with every taught component (VLab 测试｜房间 1); a card with an
unknown tag reached the room as text. Readback uses `card_msg_content_type=raw_card_content`
(the default returns an "upgrade your client" placeholder for v2 cards).

Earlier rounds, kept for the record: round 1 AGENTS.md wording too weak (V used markdown tables
every time); round 2 V chose cards for 2/5 but they streamed as raw JSON (the dispatcher gap above).

## Round 2: more card UI (2026-11-04 evening)

Tianyi: tables are fine as markdown; cards should bring what markdown cannot. The AGENTS.md
section now triggers on content (a series of numbers → chart, 2–4 key numbers → metric tiles,
options → side-by-side columns, a schedule → timeline, good/bad → colour) and points to the
skill `lab/feishu-card-ui/SKILL.md` (built by `lab/feishu-card-ui-patterns.mjs`: four layouts,
trend / compare / plan / report, each sent to Feishu by the candidate and accepted).

| Round | Rule | Cards (of 5 data/choice prompts) |
|---|---|---|
| `candidate-aed6aca8` | "tables only → markdown" | 0 (V read the skill twice, still chose markdown) |
| `candidate-c9c44713` | content triggers | 3: trend and spend (metric tiles + chart + tags + panel), compare (columns + tags + panel) |

In the last round the iPhone Duo comparison (data half missing) and the Saturday plan (V read
the skill, wrote a time table) stayed markdown; area codes, chat and a quick fact stayed text.

## Round 3: cards in place (2026-11-04 night)

- The monitor now parses a half-written card (`vPartialFeishuCard`: header + finished
  `body.elements`) and replaces the whole streaming card entity (`PUT /cardkit/v1/cards/:id`,
  verified on Feishu: text → partial card ×3 → final → close, all code 0). The final reply then
  finishes that same message (`vCloseWithModelCard`) instead of deleting the preview and sending a
  new card; on any failure it falls back to the old path.
- Finding: V's answer text is not token-streamed. In the candidate (worker + deepseek-flash) each
  assistant message reaches the Feishu dispatcher as one partial (card 1501/3513 chars, chat 48),
  and V's production `[firsttext-e2e.1]` lines show the same (answer visible 1.5–2 s after its first
  token, reply ends 0.1 s later). What moves in the card while V works is the tool-progress line.
  So the card cannot grow piece by piece until the core/worker streams answer deltas; the parser is
  ready for when it does.
- `candidate-34fdc984`: spend and trend went progress line → V's card in the same message
  (charts, metric tiles, tags, panel); chat unchanged.

## Known costs

- A card reply does not stream: the user sees the progress text, then the card when the whole JSON
  is written (trend: 30 s as a card vs 16 s as streamed text in round 2).
- The progress preview ("我先查一下…") is discarded when the card arrives.
- Callback buttons have no handler; the section teaches only `open_url` buttons.
- `<at user_id="all">` in a card would @everyone; nothing filters it now.

## Release feishu-card-open-20261104

- Source: openclaw-versa `f73ee277c7e` (branch `versa/feishu-card-open-20261104`, on top of
  `cedaa9bf713` feishu-card-images): `extensions/feishu/src/model-card.ts` (+ test), `native-card.ts`,
  `presentation-card.ts`, `send.ts`, `streaming-card.ts`, `reply-dispatcher.ts`. Unit tests cover the
  open card, mentions, envelope, text fallback and the partial parser; the reply-dispatcher and
  streaming hunks are covered by the VLab candidates above (their versa suites do not load in the
  local checkout, before or after this change).
- Release bytes: `node lab/build-feishu-card-open.mjs` from V's bytes (reply-delivery-result stock 9.1,
  monitor.account = feishu-card-images); plan `lab/feishu-card-open.plan.json`.
- Needs a Gateway restart (the Feishu plugin does not reload code).
- With it, on V's workspace (not this repo; V's workspace git): the AGENTS.md section
  `lab/feishu-card-open.agents-section.md` before `### Makaron Group Service Trigger`, and the
  feishu-channel-cards skill gets `references/reply-cards.md` (`lab/feishu-card-ui/reply-cards.md`)
  plus the "两种卡片，先选对" table in SKILL.md. Without them V does not choose cards; the plugin change
  alone only stops raw card JSON from showing.
- Trial: one week, 2026-11-05 00:50 CST to 2026-11-12 (Tianyi set two days on 2026-11-04 and made it
  a week at go-live). Live on V as `feishu-card-open-20261104`, V workspace commit `5d17029d`.
  Not covered: /vds, /vcodex, /vcc and group chats; callback buttons have no handler; `<at user_id="all">` is not filtered.
