// The Gateway call that stores a credential: `question.resolve` with the value
// as the answer of the store-bound question, exactly as V's Feishu secret-entry
// card does. The Gateway writes the secret store (and V's mode-600 mirror),
// registers the value for redaction and answers the waiting `secrets` tool
// with "stored"; the value never reaches a transcript.
//
// Uses OpenClaw's own CLI transport (`plugin-sdk/gateway-runtime.js`), the way
// V's maintenance scripts call the Gateway from outside its process: config,
// port and token come from OPENCLAW_CONFIG_PATH / OPENCLAW_STATE_DIR, so the
// service runs as the Gateway's user and holds no Gateway credential itself.
import path from "node:path";
import { pathToFileURL } from "node:url";

const GONE = new Set(["QUESTION_ALREADY_TERMINAL", "QUESTION_NOT_FOUND"]);

export function errorReason(error) {
  const details = error?.details;
  if (details && typeof details === "object" && typeof details.reason === "string") return details.reason;
  if (typeof error?.reason === "string") return error.reason;
  return typeof error?.gatewayCode === "string" ? error.gatewayCode : error?.name ?? "error";
}

/** `resolve(link, value)` for LinkRegistry.submit; `call(method, params)` is injectable for tests. */
export function createGatewayResolver({ openclawDist, call, timeoutMs = 15_000 } = {}) {
  let loaded;
  const gatewayCall = call ?? (async (method, params) => {
    if (!openclawDist) throw Object.assign(new Error("openclawDist is not configured"), { reason: "not-configured" });
    loaded ??= import(pathToFileURL(path.join(openclawDist, "plugin-sdk", "gateway-runtime.js")).href);
    const { callGatewayFromCli } = await loaded;
    return callGatewayFromCli(method, { json: true, timeout: String(timeoutMs) }, params, { scopes: ["operator.questions"], progress: false });
  });
  return async (link, value) => {
    try {
      await gatewayCall("question.resolve", {
        id: link.questionId,
        answers: { answers: { [link.answerKey]: [value] } },
        resolvedBy: `${link.channel}:secret-link:${link.askerId}`,
      });
    } catch (error) {
      const reason = errorReason(error);
      // Only the reason travels on; Gateway errors never echo answers, but be strict.
      throw Object.assign(new Error(`question.resolve failed: ${reason}`), { reason, gone: GONE.has(reason) });
    }
  };
}
