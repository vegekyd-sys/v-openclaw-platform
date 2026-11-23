export const DEFAULT_NATIVE_REQUEST_TIMEOUT_MS = 21_600_000;

function positiveFinite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) {
    throw new Error(`${name} must be a positive finite number`);
  }
  return number;
}

export function resolveNativeRequestTimeoutMs(options) {
  const upstreamTimeoutMs = positiveFinite(
    options.upstreamTimeoutMs,
    "upstreamTimeoutMs",
  );
  const nativeTimeoutMs = positiveFinite(
    options.nativeTimeoutMs ?? DEFAULT_NATIVE_REQUEST_TIMEOUT_MS,
    "nativeTimeoutMs",
  );
  return Math.max(upstreamTimeoutMs, nativeTimeoutMs);
}
