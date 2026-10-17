import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NATIVE_REQUEST_TIMEOUT_MS,
  resolveNativeRequestTimeoutMs,
} from "./native-request-timeout.mjs";

test("the OpenClaw 600s default cannot cap a healthy native Worker run", () => {
  assert.equal(
    resolveNativeRequestTimeoutMs({ upstreamTimeoutMs: 600_000 }),
    DEFAULT_NATIVE_REQUEST_TIMEOUT_MS,
  );
});

test("a deliberately longer upstream deadline is preserved", () => {
  assert.equal(
    resolveNativeRequestTimeoutMs({
      upstreamTimeoutMs: 43_200_000,
      nativeTimeoutMs: 21_600_000,
    }),
    43_200_000,
  );
});

test("the native timeout floor is configurable", () => {
  assert.equal(
    resolveNativeRequestTimeoutMs({
      upstreamTimeoutMs: 600_000,
      nativeTimeoutMs: 3_600_000,
    }),
    3_600_000,
  );
});
