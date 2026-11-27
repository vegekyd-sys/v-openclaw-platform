#!/usr/bin/env node
// Live Feishu card runner: watch a JSON state file and update one card in place.
//
// This is useful when the long task is driven by shell/Python/another process:
//   1. Start this runner in background.
//   2. The main task rewrites state.json at each user-facing stage.
//   3. The runner updates one Feishu card in place until state.done/state.failed.
//
// Usage:
//   node live-card-state-runner.cjs <ou_or_oc_target> <state.json>
//
// Target IDs are Channel SDK native IDs:
//   - oc_* for group chat
//   - ou_* for DM/open_id
//   - not user:ou_* or chat:oc_*

const fs = require('node:fs');
const {renderCard, withChannel} = require('./card-runner-template.cjs');

const [target, statePath] = process.argv.slice(2);
if (!target || !statePath) {
  console.error('Usage: node scripts/live-card-state-runner.cjs <ou_or_oc_target> <state.json>');
  process.exit(2);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {
      title: 'Live Card',
      status: '等待状态',
      progress: 0,
      color: 'purple',
      summary: ['waiting'],
    };
  }
}

withChannel(target, async ({channel, chatId}) => {
  let state = readState();
  let last = JSON.stringify(state);
  await channel.stream(chatId, {
    card: {
      initial: renderCard(state),
      producer: async (ctrl) => {
        const started = Date.now();
        while (true) {
          await sleep(Number(state.pollMs || 900));
          state = readState();
          const raw = JSON.stringify(state);
          if (raw !== last) {
            last = raw;
            ctrl.update(renderCard(state));
          }
          if (state.done || state.failed) break;
          if (Date.now() - started > Number(state.timeoutMs || 15 * 60 * 1000)) {
            state = {
              ...state,
              failed: true,
              color: 'red',
              status: '卡片更新超时',
              summary: ['后台任务可能仍在继续，但实时卡片 runner 已超时退出'],
            };
            ctrl.update(renderCard(state));
            break;
          }
        }
      },
    },
  });
}).then(() => setTimeout(() => process.exit(0), 100)).catch(e => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
