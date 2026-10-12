import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { FillError, fillSecret } from "./core/fill.js";
import { nativeDeps, resolveOpenClawDist } from "./core/native.js";

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export default definePluginEntry({
  id: "v-browser-fill",
  name: "V Browser Fill",
  description: "Types a password or verification code that someone entered on a credential card into the login page V is driving, without the value passing through V.",
  register(api) {
    const config = api.pluginConfig ?? {};
    let deps;
    const loadDeps = () => (deps ??= Promise.resolve()
      .then(() => nativeDeps(resolveOpenClawDist({ configured: config.openclawDist })))
      .catch((error) => { deps = undefined; throw error; }));

    api.registerTool(
      () => ({
        name: "browser_fill_secret",
        label: "Browser Fill Secret",
        description:
          "Fill a password, verification code (SMS/email OTP) or other login secret into a field of the page you are driving with the `browser` tool, without ever seeing it. " +
          "Use this instead of a desktop handoff when the only thing missing is a value someone has to type. Two steps: " +
          "(1) ask for it with the `secrets` tool: action=request, a name that starts with LOGIN_, like LOGIN_<SITE>_PASSWORD or LOGIN_<SITE>_CODE (other names are refused), allowedHosts=[the exact hostname of the login page], and a reason saying whose account and which site (e.g. 'Makaron 登录：请填 Tianyi 的密码，V 会直接填进登录页，用完即删'). " +
          "It shows a masked credential card in this conversation (a one-time link on Telegram/DingTalk/WeCom); anyone here may fill it. " +
          "(2) when it is stored, take a fresh snapshot and call this tool with that name and the field's ref (and targetId/profile as in your browser calls). " +
          "The value is typed only into a page on one of the entry's allowed hosts and is deleted right after, so ask again for every login (codes expire anyway). " +
          "Never ask for the value in chat, never read the field back, and do not screenshot or snapshot just to check the value.",
        parameters: Type.Object({
          name: Type.String({ description: "Secret store entry name; must start with LOGIN_, e.g. LOGIN_MAKARON_PASSWORD" }),
          ref: Type.String({ description: "The input field's ref from your latest browser snapshot" }),
          targetId: Type.Optional(Type.String({ description: "Tab targetId from your snapshot; required when more than one tab is open" })),
          profile: Type.Optional(Type.String({ description: "Browser profile, as in your browser tool calls" })),
          submit: Type.Optional(Type.Boolean({ description: "Press Enter after typing (default false)" })),
          keep: Type.Optional(Type.Boolean({ description: "Keep the entry after filling instead of deleting it (default false)" })),
        }),
        async execute(_toolCallId, params, signal) {
          try {
            const result = await fillSecret(params, await loadDeps(), signal);
            api.logger?.info?.(`browser fill: ${result.name} typed on ${result.host}${result.removed ? ", entry removed" : ""}`);
            return textResult(result);
          } catch (error) {
            const code = error instanceof FillError ? error.code : "FAILED";
            api.logger?.warn?.(`browser fill failed: ${code}`);
            return textResult({ filled: false, code, error: error instanceof FillError ? error.message : String(error?.message ?? error) });
          }
        },
      }),
      { name: "browser_fill_secret" },
    );
  },
});
