// Probe whether the pinned Seeduplex realtime dialogue endpoint parses a
// turn-detection / VAD configuration block. Guessing OpenAI's field names and
// shipping them blind would be untestable, so this asks the real service.
//
// The discriminator is a deliberately invalid value. If the service rejects an
// unknown top-level key, acceptance of the block proves it is known. If it
// ignores unknown keys, rejection of an invalid value proves the same. Anything
// else is reported as inconclusive rather than dressed up as support.
import { randomUUID } from "node:crypto";
import fs from "node:fs";

const UPSTREAM = "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue";
const RESOURCE_ID = "volc.speech.dialog";

function resolveKey() {
  const direct =
    process.env.VOLCENGINE_REALTIME_API_KEY ||
    process.env.DOUBAO_SPEECH_API_KEY ||
    process.env.VOLCENGINE_TTS_API_KEY;
  if (direct) return direct;
  for (const file of [
    "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env",
  ]) {
    try {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const match = /^(?:export\s+)?(VOLCENGINE_REALTIME_API_KEY|DOUBAO_SPEECH_API_KEY|VOLCENGINE_TTS_API_KEY)=(.*)$/u.exec(line.trim());
        if (match) return match[2].replace(/^["']|["']$/gu, "");
      }
    } catch {}
  }
  return undefined;
}

const key = resolveKey();
if (!key) {
  console.log(JSON.stringify({ probe: "seeduplex-turn-detection", keyPresent: false }));
  process.exit(1);
}

const { WebSocket } = await import(
  "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw/node_modules/ws/wrapper.mjs"
);

function baseSession() {
  return {
    model: "1.2.6.1",
    instructions: "probe",
    audio: {
      input: { format: { type: "pcm", rate: 16_000 } },
      output: { format: { type: "pcm", rate: 24_000 }, voice: "zh_female_xiaohe_uranus_bigtts", speed: 0, loudness: 0 },
    },
    tools: [],
  };
}

async function attempt(label, mutate) {
  const session = baseSession();
  mutate(session);
  return await new Promise((resolve) => {
    const socket = new WebSocket(UPSTREAM, {
      headers: {
        "X-Api-Key": key,
        "X-Api-Resource-Id": RESOURCE_ID,
        "X-Api-Connect-Id": randomUUID(),
      },
    });
    const done = (outcome) => {
      try { socket.close(); } catch {}
      resolve({ label, ...outcome });
    };
    const timer = setTimeout(() => done({ outcome: "timeout" }), 15_000);
    socket.on("open", () => socket.send(JSON.stringify({ type: "session.create", session })));
    socket.on("message", (data) => {
      let event;
      try { event = JSON.parse(data.toString()); } catch { return; }
      if (event?.type === "session.created") { clearTimeout(timer); done({ outcome: "accepted" }); }
      if (event?.type === "error") {
        clearTimeout(timer);
        // Never relay vendor diagnostics verbatim; only whether it complained.
        done({ outcome: "rejected", hasMessage: Boolean(event.message || event.error) });
      }
    });
    socket.on("error", () => { clearTimeout(timer); done({ outcome: "socket-error" }); });
    socket.on("close", () => { clearTimeout(timer); resolve({ label, outcome: "closed" }); });
  });
}

const results = [];
results.push(await attempt("control-baseline", () => {}));
results.push(await attempt("unknown-top-level-key", (s) => { s.__openclaw_probe__ = 1; }));
results.push(await attempt("turn_detection-invalid-type", (s) => { s.turn_detection = { type: "__invalid__" }; }));
results.push(await attempt("turn_detection-openai-shape", (s) => {
  s.turn_detection = { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 };
}));
results.push(await attempt("audio.input.turn_detection-invalid", (s) => {
  s.audio.input.turn_detection = { type: "__invalid__" };
}));
results.push(await attempt("audio.input.vad-invalid", (s) => {
  s.audio.input.vad = { type: "__invalid__" };
}));

const byLabel = Object.fromEntries(results.map((r) => [r.label, r.outcome]));
const rejectsUnknown = byLabel["unknown-top-level-key"] === "rejected";
let verdict = "inconclusive";
if (byLabel["control-baseline"] !== "accepted") verdict = "control-failed";
else if (rejectsUnknown && byLabel["turn_detection-openai-shape"] === "accepted") verdict = "turn_detection-supported";
else if (!rejectsUnknown && byLabel["turn_detection-invalid-type"] === "rejected") verdict = "turn_detection-parsed";
else if (!rejectsUnknown && byLabel["turn_detection-invalid-type"] === "accepted") verdict = "turn_detection-ignored";
console.log(JSON.stringify({ probe: "seeduplex-turn-detection", keyPresent: true, rejectsUnknownKeys: rejectsUnknown, results, verdict }, null, 2));
