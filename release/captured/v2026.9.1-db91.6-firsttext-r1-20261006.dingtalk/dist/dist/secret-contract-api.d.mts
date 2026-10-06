import * as _$openclaw_plugin_sdk_channel_secret_basic_runtime0 from "openclaw/plugin-sdk/channel-secret-basic-runtime";

//#region src/secret-contract.d.ts
declare const channelSecrets: {
  secretTargetRegistryEntries: _$openclaw_plugin_sdk_channel_secret_basic_runtime0.SecretTargetRegistryEntry[];
  collectRuntimeConfigAssignments: (params: {
    config: {
      channels?: Record<string, unknown>;
    };
    defaults?: _$openclaw_plugin_sdk_channel_secret_basic_runtime0.SecretDefaults;
    context: _$openclaw_plugin_sdk_channel_secret_basic_runtime0.ResolverContext;
  }) => void;
};
declare const secretTargetRegistryEntries: _$openclaw_plugin_sdk_channel_secret_basic_runtime0.SecretTargetRegistryEntry[], collectRuntimeConfigAssignments: (params: {
    config: {
      channels?: Record<string, unknown>;
    };
    defaults?: _$openclaw_plugin_sdk_channel_secret_basic_runtime0.SecretDefaults;
    context: _$openclaw_plugin_sdk_channel_secret_basic_runtime0.ResolverContext;
  }) => void;
//#endregion
export { channelSecrets, collectRuntimeConfigAssignments, secretTargetRegistryEntries };