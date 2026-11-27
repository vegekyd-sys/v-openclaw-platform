# Feishu Cards JSON v2 Reference Notes

Official docs discovered/verified during Plan Mode card debugging (2026-06-04). Use these before guessing card schemas.

## Official doc URLs

- Card JSON v2 structure: https://open.feishu.cn/document/feishu-cards/card-json-v2-structure
- Component JSON v2 overview: https://open.feishu.cn/document/feishu-cards/card-json-v2-components/component-json-v2-overview
- Form container: https://open.feishu.cn/document/feishu-cards/card-json-v2-components/containers/form-container
- Button: https://open.feishu.cn/document/feishu-cards/card-components/interactive-components/button
- Input field: https://open.feishu.cn/document/feishu-cards/card-components/interactive-components/input
- Handle card callbacks: https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/handle-card-callbacks
- Open Platform search fallback: https://open.feishu.cn/search

## Channel SDK vs CardKit schema

- Channel SDK docs explicitly cover normal V2 button callbacks:
  `behaviors: [{ type: 'callback', value: {...} }]`.
- `form` / `input` are CardKit / Feishu Cards JSON v2 components, not described in the basic Channel SDK docs.
- Card callbacks (button clicks and form submits) are received by the OpenClaw Gateway, which owns the app's only Feishu event connection. Do **not** subscribe with `channel.on('cardAction')` from a script: that needs `channel.connect()` over WebSocket, and a second connection with the Gateway's app credentials steals a random share of user messages (2026-10-09 incident). Route clicks through OpenClaw quick callback payloads (see below).

## Form container rules

Official Form container docs say:

- `tag: 'form'` must be at the card root (`body.elements[]`); form containers cannot be embedded inside other components and cannot be nested in another form.
- A form container must contain at least one button with `form_action_type: 'submit'`.
- Interactive components inside a form must have `name`; otherwise submitted data may fail to send.
- The submit button itself must also have `name`; `element_id` alone is not enough.
- Form input values are returned under callback `action.form_value`, keyed by each component's `name`.

## Working schema pattern for form + input + submit

```js
{
  schema: '2.0',
  config: { width_mode: 'fill' },
  header: {
    template: 'purple',
    title: { tag: 'plain_text', content: 'Plan Mode · 自定义输入' }
  },
  body: {
    elements: [
      {
        tag: 'form',
        element_id: 'plan_form',
        name: 'plan_form',
        elements: [
          {
            tag: 'input',
            name: 'custom_text',
            required: false,
            placeholder: { tag: 'plain_text', content: '输入你的自定义想法' },
            width: 'fill'
          },
          {
            tag: 'button',
            name: 'submit_custom',
            element_id: 'submit_custom',
            text: { tag: 'plain_text', content: '提交' },
            type: 'primary',
            width: 'fill',
            form_action_type: 'submit',
            behaviors: [
              { type: 'callback', value: { oc: 'ocf1', k: 'quick', a: 'planmode.submit', q: 'custom' } }
            ]
          }
        ]
      }
    ]
  }
}
```

## Debugging findings from 2026-06-04 Plan Mode tests

- Missing `form_action_type: 'submit'` on any form button caused Feishu send failure:
  `ErrMsg: there is no submit button in the form container, at least one`.
- A card could render with input + submit button, but clicking submit returned client error `200530` when the submit button lacked `name`.
- A plain callback button using `action_type: 'submit'` appeared clickable, but that is not the official form submit path and may not carry `form_value`.
- E-test with official schema (`form.name`, `input.name`, `button.name`, `form_action_type:'submit'`, callback behavior) clicked successfully and returned payload `E`, confirming the schema direction.

## Callback payload guidance

- For OpenClaw quick card actions, keep callback `value` small and flat. Nested objects previously triggered: `This card action payload is invalid`.
- Good:
  `{ oc:'ocf1', k:'quick', a:'planmode.q1', q:'buyer_interest', jobId:'...', step:'1' }`
- Avoid deeply nested payloads like `{ previous:{...}, m:{...complex...} }` unless the handler explicitly supports them.
