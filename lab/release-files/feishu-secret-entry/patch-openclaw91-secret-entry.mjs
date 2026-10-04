#!/usr/bin/env node
// Lets the OpenClaw `secrets` tool collect credentials inside Feishu.
//
// Upstream 2026.9.1 delivers a masked credential prompt only as a Control UI
// link. On V that dead-ends three ways: no `gateway.publicOrigin` means the
// tool throws "prompt delivery failed"; with it, the prompt still never reaches
// Feishu because the Gateway's `isAskUserPromptPending` checks an in-process map
// that only the worker populated; and the link opens an admin-only UI anyway.
// Combined with the credential-safety prompt (never collect secrets in chat),
// the agent is left with no path at all.
//
// Four core bundles are patched together (pair with patch-feishu-secret-entry.mjs):
//   builtin-openclaw-*.js     Feishu runs attach a `vSecretEntry` descriptor to
//                             the prompt instead of throwing without a link;
//                             Telegram / DingTalk / WeCom runs (channels-v1)
//                             wait for the one-time entry link instead.
//   dispatch-from-config-*.js the worker-owned prompt skips the Gateway-local
//                             pending check that can never see it.
//   question-*.js             after a masked answer is stored, mirror it to a
//                             mode-600 file under <state>/secrets/store/, the
//                             way V's other script credentials are kept, since
//                             no egress proxy substitutes store sentinels on V.
//   openclaw-tools-*.js       tell the agent where that file is.
//
// Shape-gated and idempotent: every anchor must match exactly once, all four
// files are planned before any is written.

import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "v-openclaw91-secret-entry-v1";

const STATE_FILE_EXPR = `(process.env.OPENCLAW_STATE_DIR?.trim() || process.getBuiltinModule("node:path").join(process.env.OPENCLAW_HOME?.trim() || process.getBuiltinModule("node:os").homedir(), ".openclaw"))`;

const MIRROR_PRELUDE = `// ${MARKER}
function vSecretEntryMirrorToFile(name, value) {
	try {
		if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(name) || typeof value !== "string") return;
		const fs = process.getBuiltinModule("node:fs");
		const path = process.getBuiltinModule("node:path");
		const dir = path.join(${STATE_FILE_EXPR}, "secrets", "store");
		fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
		const target = path.join(dir, name);
		const temp = \`\${target}.tmp-\${process.pid}-\${Date.now()}\`;
		fs.writeFileSync(temp, value, { mode: 0o600, flag: "wx" });
		fs.renameSync(temp, target);
	} catch (error) {
		console.warn(\`[secrets] could not mirror \${name} to the state secrets directory: \${error?.code ?? "error"}\`);
	}
}
`;

const TOOLS_PRELUDE = `// ${MARKER}
function vSecretEntryMirrorNote(name) {
	const file = process.getBuiltinModule("node:path").join(${STATE_FILE_EXPR}, "secrets", "store", name);
	return \`Gateway-host scripts can read the raw value from the mode-600 file \${file}: read it inside the script; never print it, pass it as a command-line argument, or copy it elsewhere.\`;
}
`;

export const FILES = [
  {
    id: "builtin",
    pattern: /^builtin-openclaw-[A-Za-z0-9_-]+\.js$/,
    // 9.1 ships more than one builtin-openclaw chunk; the secrets prompt is in one.
    contains: `if (toolName === "secrets") {`,
    sites: [
      {
        id: "secrets-prompt-in-chat",
        find: `\t\t\t\t\tconst text = controlUiBase ? \`🔑 Agent requests credential \${binding.name} (\${binding.kind}). Reply is disabled for secrets — open to provide it: \${controlUiBase}/ask/\${encodeURIComponent(questionId)}\` : "Credential request unavailable here: no reachable Control UI link. Open a trusted Control UI or native app and retry, or ask the operator to enable Control UI and configure gateway.publicOrigin. Never send credentials in chat.";
\t\t\t\t\tawait ctx.params.onToolResult?.({
\t\t\t\t\t\ttext,
\t\t\t\t\t\tchannelData: { askUser: { questionId } }
\t\t\t\t\t});
\t\t\t\t\tif (!controlUiBase) throw new Error(text);`,
        replace: `\t\t\t\t\tconst controlUiAskUrl = controlUiBase ? \`\${controlUiBase}/ask/\${encodeURIComponent(questionId)}\` : void 0;
\t\t\t\t\tconst vSecretEntryInChat = String(ctx.params.messageChannel ?? "").trim().toLowerCase() === "feishu"; // ${MARKER}
\t\t\t\t\tconst text = vSecretEntryInChat ? \`🔑 V 需要凭据 \${binding.name}，请在卡片里安全录入。\` : controlUiBase ? \`🔑 Agent requests credential \${binding.name} (\${binding.kind}). Reply is disabled for secrets — open to provide it: \${controlUiAskUrl}\` : "Credential request unavailable here: no reachable Control UI link. Open a trusted Control UI or native app and retry, or ask the operator to enable Control UI and configure gateway.publicOrigin. Never send credentials in chat.";
\t\t\t\t\tawait ctx.params.onToolResult?.({
\t\t\t\t\t\ttext,
\t\t\t\t\t\tchannelData: {
\t\t\t\t\t\t\taskUser: { questionId },
\t\t\t\t\t\t\t...vSecretEntryInChat ? { vSecretEntry: {
\t\t\t\t\t\t\t\tquestionId,
\t\t\t\t\t\t\t\tname: binding.name,
\t\t\t\t\t\t\t\t...typeof binding.reason === "string" && binding.reason ? { reason: binding.reason } : {},
\t\t\t\t\t\t\t\tallowedHosts: Array.isArray(binding.allowedHosts) ? binding.allowedHosts : [],
\t\t\t\t\t\t\t\t...controlUiAskUrl ? { controlUiUrl: controlUiAskUrl } : {}
\t\t\t\t\t\t\t} } : {}
\t\t\t\t\t\t}
\t\t\t\t\t});
\t\t\t\t\tif (!controlUiBase && !vSecretEntryInChat) throw new Error(text);`,
      },
    ],
  },
  {
    id: "dispatch",
    pattern: /^dispatch-from-config-[A-Za-z0-9_-]+\.js$/,
    sites: [
      {
        id: "worker-prompt-skips-local-pending-check",
        find: `if (askUserQuestionId !== void 0 && !await isAskUserPromptPending(askUserQuestionId)) return;`,
        replace: `if (askUserQuestionId !== void 0 && !deliveryPayload.channelData?.vSecretEntry && !await isAskUserPromptPending(askUserQuestionId)) return; // ${MARKER}`,
      },
    ],
  },
  {
    id: "question",
    // The server-methods module that owns `question.resolve`.
    pattern: /^question-[A-Za-z0-9_-]+\.js$/,
    contains: `//#region src/gateway/server-methods/question.ts`,
    prelude: MIRROR_PRELUDE,
    sites: [
      {
        id: "mirror-stored-secret",
        find: `\t\t\t\t\t\t\tupdatedBy: storeWriteService.resolveUpdatedBy(client)
\t\t\t\t\t\t});
\t\t\t\t\t\tsaved = true;`,
        replace: `\t\t\t\t\t\t\tupdatedBy: storeWriteService.resolveUpdatedBy(client)
\t\t\t\t\t\t});
\t\t\t\t\t\tsaved = true;
\t\t\t\t\t\tvSecretEntryMirrorToFile(binding.name, value);`,
      },
    ],
  },
  {
    id: "tools",
    pattern: /^openclaw-tools-[A-Za-z0-9_-]+\.js$/,
    prelude: TOOLS_PRELUDE,
    sites: [
      {
        id: "stored-result-mentions-mirror",
        find: `\t\t"Stored does not prove proxy enabled or current exec snapshot; config refs are independent."
\t].join(" ")}`,
        replace: `\t\t"Stored does not prove proxy enabled or current exec snapshot; config refs are independent.",
\t\tvSecretEntryMirrorNote(params.name)
\t].join(" ")}`,
      },
    ],
  },
];

// Channels whose v-experience patch sends a one-time entry link
// (apps/v-secret-entry) for a credential question. Without this the builtin
// throws "Credential request unavailable here" for them and the tool cancels
// before the link arrives. Applied on top of v1, so it also upgrades a bundle
// that already carries v1 (V's frozen builtin).
export const CHANNELS_MARKER = "v-openclaw91-secret-entry-channels-v1";
export const LINK_CHANNELS = ["telegram", "dingtalk-connector", "wecom"];

const CHANNEL_SITES = [
  {
    id: "link-channels",
    find: `\t\t\t\t\tconst vSecretEntryInChat = String(ctx.params.messageChannel ?? "").trim().toLowerCase() === "feishu"; // ${MARKER}
\t\t\t\t\tconst text = vSecretEntryInChat ? \`🔑 V 需要凭据 \${binding.name}，请在卡片里安全录入。\` : controlUiBase ?`,
    replace: `\t\t\t\t\tconst vSecretEntryChannel = String(ctx.params.messageChannel ?? "").trim().toLowerCase(); // ${CHANNELS_MARKER}
\t\t\t\t\tconst vSecretEntryInChat = vSecretEntryChannel === "feishu"; // ${MARKER}
\t\t\t\t\tconst vSecretEntryByLink = ${JSON.stringify(LINK_CHANNELS)}.includes(vSecretEntryChannel);
\t\t\t\t\tconst text = vSecretEntryInChat ? \`🔑 V 需要凭据 \${binding.name}，请在卡片里安全录入。\` : vSecretEntryByLink ? \`🔑 V 需要凭据 \${binding.name}，请用 V 私信发来的一次性链接安全录入。\` : controlUiBase ?`,
  },
  {
    id: "link-channels-no-throw",
    find: `\t\t\t\t\tif (!controlUiBase && !vSecretEntryInChat) throw new Error(text);`,
    replace: `\t\t\t\t\tif (!controlUiBase && !vSecretEntryInChat && !vSecretEntryByLink) throw new Error(text);`,
  },
];

/** Lets the link channels' credential questions wait for the link; needs v1 in the source. */
export function patchSecretEntryChannelsSource(source) {
  if (source.includes(CHANNELS_MARKER)) return { changed: false, source };
  if (!source.includes(MARKER)) throw new Error("builtin: secret entry v1 is not applied; refusing to patch channels");
  for (const site of CHANNEL_SITES) {
    const found = countOccurrences(source, site.find);
    if (found !== 1) throw new Error(`builtin site ${site.id}: expected 1 match, found ${found}; refusing to patch`);
  }
  let patched = source;
  for (const site of CHANNEL_SITES) patched = patched.replace(site.find, () => site.replace);
  return { changed: true, source: patched };
}

const sha = (text) => createHash("sha256").update(text).digest("hex");

function countOccurrences(haystack, needle) {
  let count = 0;
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) count += 1;
  return count;
}

/** Patches one bundle's source for the given FILES entry. */
export function patchSecretEntrySource(fileId, source) {
  const spec = FILES.find((file) => file.id === fileId);
  if (!spec) throw new Error(`unknown file id: ${fileId}`);
  if (source.includes(MARKER)) return { changed: false, source };
  if (source.includes("vSecretEntry")) throw new Error(`${fileId}: partially patched with secret entry code; refusing to patch`);
  for (const site of spec.sites) {
    const found = countOccurrences(source, site.find);
    if (found !== 1) throw new Error(`${fileId} site ${site.id}: expected 1 match, found ${found}; refusing to patch`);
  }
  let patched = source;
  for (const site of spec.sites) patched = patched.replace(site.find, () => site.replace);
  if (spec.prelude) patched = spec.prelude + patched;
  return { changed: true, source: patched };
}

function findTarget(distDir, spec) {
  const names = readdirSync(distDir).filter((name) => spec.pattern.test(name));
  // 9.1 ships several chunks per name pattern: keep the one with the code (patched or not).
  const holds = (source) => spec.contains ? source.includes(spec.contains) : source.includes(MARKER) || spec.sites.some((site) => source.includes(site.find));
  const matches = names.length === 1 && !spec.contains ? names : names.filter((name) => holds(readFileSync(join(distDir, name), "utf8")));
  if (matches.length !== 1) throw new Error(`${spec.id}: expected exactly one bundle in ${distDir}, found ${matches.length}`);
  return join(distDir, matches[0]);
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const outIndex = args.indexOf("--out-dir");
  const outDir = outIndex === -1 ? undefined : args[outIndex + 1];
  const distDir = args.find((arg, index) => !arg.startsWith("--") && (outIndex === -1 || index !== outIndex + 1));
  if (!distDir || (outIndex !== -1 && !outDir)) {
    console.error("usage: patch-openclaw91-secret-entry.mjs [--check | --out-dir <dir>] <openclaw dist dir>");
    process.exit(2);
  }
  try {
    // Plan every file before writing any, so a shape mismatch leaves nothing half-applied.
    const plans = FILES.map((spec) => {
      const path = findTarget(distDir, spec);
      const original = readFileSync(path, "utf8");
      const v1 = patchSecretEntrySource(spec.id, original);
      if (spec.id !== "builtin") return { spec, path, original, ...v1 };
      const channels = patchSecretEntryChannelsSource(v1.source);
      // Never overwrite v1's backup of the pristine bundle with a patched one.
      return { spec, path, original, changed: v1.changed || channels.changed, source: channels.source, backup: v1.changed ? MARKER : CHANNELS_MARKER };
    });
    const report = [];
    for (const plan of plans) {
      const name = plan.path.slice(distDir.replace(/\/$/, "").length + 1);
      if (outDir) writeFileSync(join(outDir, name), plan.source);
      else if (plan.changed && !check) {
        copyFileSync(plan.path, `${plan.path}.bak-${plan.backup ?? MARKER}`);
        writeFileSync(plan.path, plan.source);
      }
      report.push({ file: name, changed: plan.changed, beforeSha: sha(plan.original), afterSha: sha(plan.source) });
    }
    console.log(JSON.stringify({ ok: true, marker: MARKER, check, outDir, files: report }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, reason: error.message }));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
