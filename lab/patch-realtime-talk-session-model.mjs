import assert from "node:assert/strict";

export const REALTIME_TALK_SESSION_MODEL_BEFORE =
  '\t\t\t\tprovider: params.provider,\n\t\t\t\tmodel: params.model,';

export const REALTIME_TALK_SESSION_MODEL_AFTER =
  '\t\t\t\tprovider: params.provider ?? sessionEntry.providerOverride ?? sessionEntry.modelProvider,\n' +
  '\t\t\t\tmodel: params.model ?? sessionEntry.modelOverride,';

const count = (source, needle) => source.split(needle).length - 1;

export function patchRealtimeTalkSessionModel(source) {
  assert.equal(typeof source, "string", "realtime session harness must be text");
  if (source.includes(REALTIME_TALK_SESSION_MODEL_AFTER)) {
    assert.equal(
      count(source, REALTIME_TALK_SESSION_MODEL_AFTER),
      1,
      "Talk session model patch is ambiguous",
    );
    assert.equal(
      count(source, REALTIME_TALK_SESSION_MODEL_BEFORE),
      0,
      "Talk session model patch is partial",
    );
    return source;
  }
  assert.equal(
    count(source, REALTIME_TALK_SESSION_MODEL_BEFORE),
    1,
    "Talk session model anchor drifted",
  );
  return source.replace(
    REALTIME_TALK_SESSION_MODEL_BEFORE,
    REALTIME_TALK_SESSION_MODEL_AFTER,
  );
}
