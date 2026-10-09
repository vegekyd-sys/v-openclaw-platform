import assert from 'node:assert/strict';

// firsttext-e2e: record what kind of message each reply answers (type and media kinds only).
//
// V 2026-10-08: 9 of 404 vlab-worker replies waited 5.4–39.6 s between the Feishu reply dispatcher
// and gateway-preflight-enter (P50 0.5 s). Not Gateway concurrency (0–5 runs active, same as the
// rest of the day) and not the same session's previous turn (none in flight). The one stage in
// that window that takes this long is the Gateway's pre-turn media understanding (V's video
// analysis CLI runs 26–41 s), but the record cannot show which messages carried media, and V's
// logs are not readable from the measuring session. With the inbound message type and the kinds
// of its attachments on the record, the daily report can split these waits by message kind.
//
// Only adds two fields to the existing [firsttext-e2e] log line: messageType (Feishu
// message_type, e.g. text/post/image/media/audio) and mediaKinds (e.g. ["video"]). No content,
// file names or keys. Nothing a user sees changes.

export const MARKER = 'v-firsttext-e2e-msgtype-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

const kinds = '(mediaList ?? []).map((media) => media.kind || String(media.contentType || "").split("/")[0] || "file")';

export function patchFeishuMonitor(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `		sentAtMs: normalizeEpochMs(params.messageCreateTimeMs),
		dispatcherAtMs: Date.now()
	};`,
    `		sentAtMs: normalizeEpochMs(params.messageCreateTimeMs),
		dispatcherAtMs: Date.now(),
		// ${MARKER}: what kind of message this reply answers
		messageType: params.vMessageType,
		mediaKinds: params.vMediaKinds
	};`,
    'firsttext-e2e record');
  out = replaceExactlyOnce(out,
    `								messageCreateTimeMs,
								sessionKey: agentSessionKey
							})`,
    `								messageCreateTimeMs,
								sessionKey: agentSessionKey,
								vMessageType: ctx.contentType,
								vMediaKinds: ${kinds}
							})`,
    'broadcast dispatcher call');
  out = replaceExactlyOnce(out,
    `				messageCreateTimeMs,
				sessionKey: route.sessionKey
			});`,
    `				messageCreateTimeMs,
				sessionKey: route.sessionKey,
				vMessageType: ctx.contentType,
				vMediaKinds: ${kinds}
			});`,
    'dispatcher call');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'usage: patch-feishu-firsttext-msgtype.mjs <in> <out>');
  fs.writeFileSync(output, patchFeishuMonitor(fs.readFileSync(input, 'utf8')));
}
