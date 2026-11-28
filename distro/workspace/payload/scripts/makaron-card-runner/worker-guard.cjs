'use strict';

/**
 * Guardrail for Makaron video/card production workers.
 *
 * Long Makaron card/watch workflows must not run inside the Feishu service-group
 * parent/inbound session. They should run in an isolated worker/subagent, with
 * MAKARON_WORKER=1 set explicitly by the launcher.
 */
function isMakaronWorkerEnv(env = process.env) {
  return env.MAKARON_WORKER === '1'
    || env.MAKARON_CARD_WORKER === '1'
    || env.OPENCLAW_SUBAGENT === '1'
    || env.OPENCLAW_SESSION_KIND === 'subagent'
    || env.OPENCLAW_AGENT_KIND === 'subagent';
}

function assertMakaronWorker(entry = 'Makaron card/watch workflow') {
  if (isMakaronWorkerEnv()) return;

  const msg = [
    `[makaron-worker-guard] Refusing to run: ${entry}`,
    '',
    'Reason: Makaron video/card watch workflows block for 30s-5min and must not run in a Feishu service-group parent/inbound session.',
    '',
    'Correct route:',
    '  1. Parent service-group session: receive request / acknowledge / spawn worker / yield immediately.',
    '  2. Worker/subagent: run this script with MAKARON_WORKER=1.',
    '',
    'Example:',
    '  MAKARON_WORKER=1 node scripts/makaron-card-runner/run-video-task.cjs ...',
  ].join('\n');

  const err = new Error(msg);
  err.code = 'MAKARON_WORKER_REQUIRED';
  throw err;
}

module.exports = { isMakaronWorkerEnv, assertMakaronWorker };
