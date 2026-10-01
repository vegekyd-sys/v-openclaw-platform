// versa-runtime-providers: the two providers V's config points at, without the
// Worker pool they used to ship inside.
//
// On OpenClaw 9.6 agent turns run in the Gateway on the native "openclaw"
// runtime, so the vlab-agent-worker-isolation plugin is disabled. Two config
// keys still name providers that only that plugin registered:
//
//   talk.realtime.provider              -> "volcengine-rtc-agent"
//   agents.defaults.compaction.provider -> "versa-fast-quality-v1"
//
// Without a registrant the first is a Talk session that cannot start and the
// second silently falls back to built-in compaction. This plugin registers
// exactly those two, using the Worker plugin's provider modules unchanged and
// the same config keys and defaults the Worker plugin used for them.
//
// Only the plugin SDK surface is used (api.registerRealtimeVoiceProvider,
// api.registerCompactionProvider, api.runtime.llm.complete, api.pluginConfig,
// api.config). Nothing is imported from core: on 9.6 a plugin loaded from a
// path runs against a captured core copy whose module-local state is not the
// Gateway's.
import { buildVolcengineRtcAgentProvider } from "./volcengine-rtc-agent-provider.mjs";
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
    "Registers the volcengine-rtc-agent realtime voice provider and the versa-fast-quality-v1 compaction provider.",
  register(api) {
    api.registerRealtimeVoiceProvider(buildVolcengineRtcAgentProvider());
    const settings = resolveFastCompactionSettings(api.pluginConfig, api.config);
    const fastCompactionProvider = buildFastCompactionProvider({
      ...settings,
      llmComplete: (params) => api.runtime.llm.complete(params),
    });
    api.registerCompactionProvider(fastCompactionProvider);
    api.logger?.info?.(
      `registered realtime voice provider volcengine-rtc-agent and compaction provider ${fastCompactionProvider.id} (model ${settings.model})`,
    );
  },
};

export default plugin;
