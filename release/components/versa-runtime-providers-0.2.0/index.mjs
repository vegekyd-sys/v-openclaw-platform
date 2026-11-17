// versa-runtime-providers: the compaction provider V's config points at, without
// the Worker pool it used to ship inside.
//
// From OpenClaw 2026.10.10 V runs agent turns in the Gateway on the native
// "openclaw" runtime, so the vlab-agent-worker-isolation plugin is gone. One
// config key still names a provider that only that plugin registered:
//
//   agents.defaults.compaction.provider -> "versa-fast-quality-v1"
//
// Without a registrant it silently falls back to built-in compaction. This
// plugin registers it with the Worker plugin's provider module unchanged and the
// same config keys and defaults. (0.1.0 also registered the realtime voice
// provider of the Control UI RTC voice, which Tianyi dropped on 2026-11-04;
// voice stays in the separate v-voice entry.)
//
// Only the plugin SDK surface is used (api.registerCompactionProvider,
// api.runtime.llm.complete, api.pluginConfig, api.config). Nothing is imported
// from core: a plugin loaded from a path runs against a captured core copy whose
// module-local state is not the Gateway's.
import { buildFastCompactionProvider } from "./fast-compaction-provider.mjs";

export const PLUGIN_ID = "versa-runtime-providers";
// Same fallback the Worker plugin used when neither fastCompactionModel nor
// agents.defaults.compaction.model is set.
export const DEFAULT_FAST_COMPACTION_MODEL = "azure-openai/gpt-5.5";

function trimmedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Resolve the fast-compaction settings exactly as the Worker plugin did:
 * plugin config first, then agents.defaults.compaction.model, then the default.
 */
export function resolveFastCompactionSettings(pluginConfig, config) {
  return {
    model:
      trimmedString(pluginConfig?.fastCompactionModel) ??
      trimmedString(config?.agents?.defaults?.compaction?.model) ??
      DEFAULT_FAST_COMPACTION_MODEL,
    maxInputChars: Number(pluginConfig?.fastCompactionMaxInputChars ?? 420_000),
    maxOutputTokens: Number(pluginConfig?.fastCompactionMaxOutputTokens ?? 12_000),
    maxQualityRetries: Number(pluginConfig?.fastCompactionMaxQualityRetries ?? 1),
  };
}

const plugin = {
  id: PLUGIN_ID,
  name: "Versa Runtime Providers",
  description:
    "Registers the versa-fast-quality-v1 compaction provider.",
  register(api) {
    const settings = resolveFastCompactionSettings(api.pluginConfig, api.config);
    const fastCompactionProvider = buildFastCompactionProvider({
      ...settings,
      llmComplete: (params) => api.runtime.llm.complete(params),
    });
    api.registerCompactionProvider(fastCompactionProvider);
    api.logger?.info?.(
      `registered compaction provider ${fastCompactionProvider.id} (model ${settings.model})`,
    );
  },
};

export default plugin;
