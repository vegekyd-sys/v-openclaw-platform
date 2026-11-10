import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { r as createLazyRuntimeModule } from "./lazy-runtime-CgCh8H_K.js";
import { c as resolveAgentConfig, u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import { t as resolveDefaultModelForAgent } from "./model-selection-config-bdtzr00S.js";
import { o as resolveEffectiveAgentRuntime } from "./thinking-runtime-CMnVn0Uq.js";
import { a as loadPreparedModelCatalog } from "./prepared-model-catalog-BSfJgEXd.js";
import { i as formatFastModeCurrentStatus } from "./fast-mode-CCX0YiYh.js";
import { t as resolveFastModeState } from "./fast-mode-CGDySgLE.js";
import { n as resolveStoredModelOverride } from "./stored-model-overrides-Cw6nNvhW.js";
import { f as resolveCommandArgMenu, i as formatCommandArgMenuTitle, n as buildCommandTextFromArgs, r as findCommandByNativeName, u as parseCommandArgs } from "./commands-registry-4rJyHCiD.js";
import "./string-coerce-runtime-GQa0ehRA.js";
import { m as resolveStorePath, r as getSessionEntry } from "./session-store-runtime-Di9N1AZ9.js";
import { n as resolveThinkingDefaultWithRuntimeCatalog } from "./agent-runtime-zPZ6yBNz.js";
import "./command-auth-native-8s54zPyc.js";
import { O as buildInlineKeyboard } from "./text-chunk-limit-qImmQs06.js";
import { t as buildTelegramNativeCommandCallbackData } from "./native-command-callback-data-C1RSVJRf.js";
import { t as withTelegramApiErrorLogging } from "./api-logging-DT6ZktrD.js";
import { n as prepareTelegramCommandDispatch, t as dispatchTelegramBuiltinTurn } from "./bot-native-command-dispatch-7hG7WSS2.js";
//#region extensions/telegram/src/bot-native-command-builtins.ts
const loadTelegramLoginCommandExecutor = createLazyRuntimeModule(() => import("./bot-native-command-login-3s55Krie.js"));
function buildTelegramCommandMenuModelContext(params) {
	return {
		provider: params.provider,
		model: params.model,
		...params.thinkingLevel ? { thinkingLevel: params.thinkingLevel } : {},
		...params.fastMode !== void 0 ? { fastMode: params.fastMode } : {}
	};
}
function resolveTelegramCommandMenuModelContext(params) {
	if (!params.sessionKey.trim()) return {};
	try {
		const storePath = resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
		const defaultModel = resolveDefaultModelForAgent({
			cfg: params.cfg,
			agentId: params.agentId
		});
		const entry = getSessionEntry({
			storePath,
			sessionKey: params.sessionKey
		});
		const thinkingLevel = normalizeOptionalString(entry?.thinkingLevel);
		const fastMode = entry?.fastMode;
		let context;
		if (entry?.modelOverrideSource === "auto" && normalizeOptionalString(entry.modelOverride)) context = buildTelegramCommandMenuModelContext({
			provider: defaultModel.provider,
			model: defaultModel.model,
			...thinkingLevel ? { thinkingLevel } : {},
			...fastMode !== void 0 ? { fastMode } : {}
		});
		else {
			const override = resolveStoredModelOverride({
				sessionEntry: entry,
				loadSessionEntry: (sessionKey) => getSessionEntry({
					storePath,
					sessionKey
				}),
				sessionKey: params.sessionKey,
				defaultProvider: defaultModel.provider
			});
			if (override?.model) context = buildTelegramCommandMenuModelContext({
				provider: override.provider || defaultModel.provider,
				model: override.model,
				...thinkingLevel ? { thinkingLevel } : {},
				...fastMode !== void 0 ? { fastMode } : {}
			});
			else {
				const provider = normalizeOptionalString(entry?.providerOverride) ?? normalizeOptionalString(entry?.modelProvider);
				const model = normalizeOptionalString(entry?.modelOverride) ?? normalizeOptionalString(entry?.model);
				context = {
					...provider ? { provider } : {},
					...model ? { model } : {},
					...thinkingLevel ? { thinkingLevel } : {},
					...fastMode !== void 0 ? { fastMode } : {}
				};
			}
		}
		return {
			...context,
			agentRuntime: resolveEffectiveAgentRuntime({
				cfg: params.cfg,
				provider: context.provider ?? defaultModel.provider,
				modelId: context.model ?? defaultModel.model,
				agentId: params.agentId,
				sessionKey: params.sessionKey,
				sessionEntry: entry
			})
		};
	} catch {
		return {};
	}
}
function resolveTelegramFastCommandModelContext(params) {
	const defaultModel = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: params.agentId
	});
	const fallback = () => ({
		provider: defaultModel.provider,
		model: defaultModel.model
	});
	if (!params.sessionKey.trim()) return fallback();
	try {
		const storePath = resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
		const entry = getSessionEntry({
			storePath,
			sessionKey: params.sessionKey
		});
		if (entry?.modelOverrideSource === "auto" && normalizeOptionalString(entry.modelOverride)) return fallback();
		const override = resolveStoredModelOverride({
			sessionEntry: entry,
			loadSessionEntry: (sessionKey) => getSessionEntry({
				storePath,
				sessionKey
			}),
			sessionKey: params.sessionKey,
			defaultProvider: defaultModel.provider
		});
		return {
			provider: override?.provider ?? defaultModel.provider,
			model: override?.model ?? defaultModel.model
		};
	} catch {
		return fallback();
	}
}
function resolveTelegramFastCommandState(params) {
	const defaultModel = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: params.agentId
	});
	const fallback = () => resolveFastModeState({
		cfg: params.cfg,
		provider: defaultModel.provider,
		model: defaultModel.model,
		agentId: params.agentId
	});
	if (!params.sessionKey.trim()) return fallback();
	try {
		const storePath = resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
		const entry = getSessionEntry({
			storePath,
			sessionKey: params.sessionKey
		});
		const modelContext = resolveTelegramFastCommandModelContext(params);
		return resolveFastModeState({
			cfg: params.cfg,
			provider: modelContext.provider ?? defaultModel.provider,
			model: modelContext.model ?? defaultModel.model,
			agentId: params.agentId,
			sessionEntry: entry?.fastMode !== void 0 ? { fastMode: entry.fastMode } : void 0
		});
	} catch {
		return fallback();
	}
}
async function resolveTelegramThinkMenuCurrentLevel(params) {
	const explicit = normalizeOptionalString(params.thinkingLevel);
	if (explicit) return explicit;
	const agentThinkingDefault = normalizeOptionalString(resolveAgentConfig(params.cfg, params.agentId)?.thinkingDefault);
	if (agentThinkingDefault) return agentThinkingDefault;
	const defaultModel = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: params.agentId
	});
	return await resolveThinkingDefaultWithRuntimeCatalog({
		cfg: params.cfg,
		provider: params.provider ?? defaultModel.provider,
		model: params.model ?? defaultModel.model,
		agentRuntime: params.agentRuntime,
		loadModelCatalog: async () => params.catalog
	});
}
function formatTelegramCommandArgMenuTitle(params) {
	const title = formatCommandArgMenuTitle({
		command: params.command,
		menu: params.menu
	});
	if (params.command.key === "think" && params.currentThinkingLevel) return `Current thinking level: ${params.currentThinkingLevel}.\n${title}`;
	if (params.command.key === "fast" && params.currentFastModeStatus) {
		const options = params.menu.choices.map((choice) => choice.label.trim()).filter(Boolean).join(", ");
		return options ? `${params.currentFastModeStatus}\nOptions: ${options}.` : params.currentFastModeStatus;
	}
	return title;
}
async function executeTelegramBuiltinCommand(params) {
	const dispatch = await prepareTelegramCommandDispatch({
		...params,
		requireAuth: true,
		commandText: params.rawText ? `/${params.commandName} ${params.rawText}` : `/${params.commandName}` // v-experience-telegram-v1
	});
	if (!dispatch) return false;
	const commandDefinition = findCommandByNativeName(params.commandName, "telegram", { includeBundledChannelFallback: false });
	const commandArgs = commandDefinition ? parseCommandArgs(commandDefinition, params.rawText) : params.rawText ? { raw: params.rawText } : void 0;
	const prompt = commandDefinition ? buildCommandTextFromArgs(commandDefinition, commandArgs) : params.rawText ? `/${params.commandName} ${params.rawText}` : `/${params.commandName}`;
	if (commandDefinition?.key === "login") {
		const { executeTelegramLoginCommand } = await loadTelegramLoginCommandExecutor();
		return await executeTelegramLoginCommand({
			dispatch,
			commandArgs
		});
	}
	const menuNeedsModelContext = commandDefinition?.argsMenu && !(commandArgs?.raw && !commandArgs.values) && commandDefinition.args?.some((arg) => typeof arg.choices === "function" && commandArgs?.values?.[arg.name] == null);
	const sessionKeyForMenu = commandDefinition && menuNeedsModelContext ? dispatch.targetSessionKey : "";
	const fastCommandState = commandDefinition?.key === "fast" && menuNeedsModelContext ? resolveTelegramFastCommandState({
		cfg: dispatch.runtimeCfg,
		agentId: dispatch.route.agentId,
		sessionKey: sessionKeyForMenu
	}) : void 0;
	const fastMenuModelContext = commandDefinition?.key === "fast" && menuNeedsModelContext ? resolveTelegramFastCommandModelContext({
		cfg: dispatch.runtimeCfg,
		agentId: dispatch.route.agentId,
		sessionKey: sessionKeyForMenu
	}) : void 0;
	const menuModelContext = commandDefinition && menuNeedsModelContext ? fastMenuModelContext ?? resolveTelegramCommandMenuModelContext({
		cfg: dispatch.runtimeCfg,
		agentId: dispatch.route.agentId,
		sessionKey: sessionKeyForMenu
	}) : {};
	const menuModelCatalog = commandDefinition?.key === "think" && menuNeedsModelContext ? await loadPreparedModelCatalog({
		config: dispatch.runtimeCfg,
		agentId: dispatch.route.agentId,
		agentDir: resolveAgentDir(dispatch.runtimeCfg, dispatch.route.agentId),
		readOnly: true
	}) : void 0;
	const menu = commandDefinition ? resolveCommandArgMenu({
		command: commandDefinition,
		args: commandArgs,
		cfg: dispatch.runtimeCfg,
		...menuModelContext,
		...menuModelCatalog?.length ? { catalog: menuModelCatalog } : {}
	}) : null;
	if (menu && commandDefinition) {
		const title = formatTelegramCommandArgMenuTitle({
			command: commandDefinition,
			menu,
			currentThinkingLevel: commandDefinition.key === "think" ? await resolveTelegramThinkMenuCurrentLevel({
				cfg: dispatch.runtimeCfg,
				agentId: dispatch.route.agentId,
				...menuModelContext,
				catalog: menuModelCatalog ?? []
			}) : void 0,
			currentFastModeStatus: commandDefinition.key === "fast" ? formatFastModeCurrentStatus({ ...fastCommandState ?? resolveTelegramFastCommandState({
				cfg: dispatch.runtimeCfg,
				agentId: dispatch.route.agentId,
				sessionKey: sessionKeyForMenu
			}) }) : void 0
		});
		const rows = [];
		for (let index = 0; index < menu.choices.length; index += 2) rows.push(menu.choices.slice(index, index + 2).map((choice) => ({
			text: choice.label,
			callback_data: buildTelegramNativeCommandCallbackData(buildCommandTextFromArgs(commandDefinition, { values: { [menu.arg.name]: choice.value } }))
		})));
		const replyMarkup = buildInlineKeyboard(rows);
		await withTelegramApiErrorLogging({
			operation: "sendMessage",
			runtime: dispatch.runtime,
			fn: () => dispatch.bot.api.sendMessage(dispatch.chatId, title, {
				...replyMarkup ? { reply_markup: replyMarkup } : {},
				...dispatch.threadParams
			})
		});
		return false;
	}
	return await dispatchTelegramBuiltinTurn({
		dispatch,
		prompt,
		commandArgs
	});
}
//#endregion
export { executeTelegramBuiltinCommand };
