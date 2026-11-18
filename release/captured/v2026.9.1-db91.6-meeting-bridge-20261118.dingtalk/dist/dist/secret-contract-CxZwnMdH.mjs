import { createSimpleChannelSecretContract } from "openclaw/plugin-sdk/channel-secret-basic-runtime";
//#region src/secret-contract.ts
const channelSecrets = createSimpleChannelSecretContract({
	channelKey: "dingtalk-connector",
	label: "DingTalk",
	accountFields: ["clientSecret"],
	channelFields: ["clientSecret"],
	mode: "account-inheritance"
});
const { secretTargetRegistryEntries, collectRuntimeConfigAssignments } = channelSecrets;
//#endregion
export { collectRuntimeConfigAssignments as n, secretTargetRegistryEntries as r, channelSecrets as t };
