// OpenClaw 2.0 asks a selected non-default Harness whether it owns native
// compaction before falling back to the configured Context Engine. Registering
// no callback is interpreted as "unsupported" for plugin Harnesses. Returning
// undefined is the documented fall-through signal and keeps the Gateway-owned
// transcript, checkpoint, provider and Session lifecycle path unchanged.
export function createGatewayNativeCompactionPassthrough() {
  return async () => undefined;
}
