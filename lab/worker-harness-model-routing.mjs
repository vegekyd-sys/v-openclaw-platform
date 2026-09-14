function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Preserve the Gateway-resolved model selection across the isolated Worker IPC
 * boundary. Most ingress paths already expose modelId, while realtime Talk
 * reaches the native Harness with the resolved model object only.
 */
export function withWorkerHarnessModelSelection(params = {}) {
  const resolvedModel =
    params.model && typeof params.model === "object" && !Array.isArray(params.model)
      ? params.model
      : undefined;
  const modelId =
    optionalString(params.modelId) ??
    optionalString(typeof params.model === "string" ? params.model : undefined) ??
    optionalString(resolvedModel?.id) ??
    optionalString(resolvedModel?.model);
  const provider =
    optionalString(params.provider) ??
    optionalString(resolvedModel?.provider) ??
    optionalString(resolvedModel?.providerId);

  if (!modelId && !provider) return params;
  return {
    ...params,
    ...(modelId ? { modelId } : {}),
    ...(provider ? { provider } : {}),
  };
}
