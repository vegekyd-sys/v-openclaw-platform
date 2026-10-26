// Candidate child-process preload: fail closed if code ignores the mock platform domain.
const http = require('node:http'), https = require('node:https');
function check(input) {
  const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : String(input?.hostname ?? input?.host ?? '').split(':')[0];
  if (/(^|\.)(feishu\.cn|larksuite\.com|larkoffice\.com)$/.test(host)) {
    if (process.env.ISC_BLOCKED_PLATFORM_LOG) require('node:fs').appendFileSync(process.env.ISC_BLOCKED_PLATFORM_LOG, JSON.stringify({at:Date.now(),host})+'\n');
    throw new Error('ISC_NO_LIVE_FEISHU: real platform network request blocked');
  }
}
for (const api of [http, https]) for (const name of ['request', 'get']) {
  const original = api[name]; api[name] = function(input, ...rest) { check(input); return original.call(this, input, ...rest); };
}
const fetch0 = globalThis.fetch;
globalThis.fetch = function(input, ...rest) { check(input?.url ?? input); return fetch0.call(this, input, ...rest); };
require('node:module').syncBuiltinESMExports();
