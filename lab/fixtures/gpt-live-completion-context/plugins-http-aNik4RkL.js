import { n as GATEWAY_CLIENT_IDS, r as GATEWAY_CLIENT_MODES } from "./client-info-B1bPgeKr.js";
import "./version-CwNT1gaY.js";
import { c as withPluginRuntimeGatewayRequestScope } from "./gateway-request-scope-CmMd3nUp.js";
import { a as resolvePluginRoutePathContext, i as isProtectedPluginRoutePathFromContext, n as findRegisteredPluginHttpRoute, r as isRegisteredPluginHttpRoutePath, t as findMatchingPluginHttpRoutes } from "./route-match-Vz3WZJuX.js";
import { x as respondControlUiPluginAuthCookieProbe } from "./http-auth-utils-BfD1fgjS.js";
import { n as finishFailedGatewayHttpResponse } from "./http-common-PerMKXgg.js";
import { a as runWithGatewayUpgradeWorkAdmission, i as runWithGatewayHttpWorkAdmission, n as matchedPluginRoutesRequireGatewayAuth, r as shouldEnforceGatewayAuthForPluginPath, t as isPluginAuthenticatedRoutePath } from "./route-auth-kw1skDb9.js";
import { t as resolvePluginRouteRuntimeOperatorScopes } from "./plugin-route-runtime-scopes-DlcvKyJk.js";
//#region src/gateway/server/plugins-http.ts
function resolvePluginRoutePathContextForRequest(req, providedPathContext) {
	if (providedPathContext) return providedPathContext;
	const url = new URL(req.url ?? "/", "http://localhost");
	return resolvePluginRoutePathContext(url.pathname);
}
function createPluginRouteRuntimeClient(scopes, clientIp, requestAuth) {
	const authenticatedUserProfile = requestAuth?.authenticatedUserProfile;
	const sharedSecretOwner = !authenticatedUserProfile && (requestAuth?.authMethod === "token" || requestAuth?.authMethod === "password");
	return {
		connId: `plugin-http:${clientIp ?? "unknown"}`,
		...clientIp ? { clientIp } : {},
		...authenticatedUserProfile ? { authenticatedUserProfile } : {},
		...sharedSecretOwner ? { internal: { operatorRoleActor: { kind: "system" } } } : {},
		connect: {
			minProtocol: 4,
			maxProtocol: 4,
			client: {
				id: GATEWAY_CLIENT_IDS.GATEWAY_CLIENT,
				version: "internal",
				platform: "node",
				mode: GATEWAY_CLIENT_MODES.BACKEND
			},
			role: "operator",
			scopes: [...scopes]
		}
	};
}
function writeUpgradeUnauthorized(socket) {
	socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
	socket.destroy();
}
function getMissingPluginRouteRuntimeContext(route, context) {
	if (route.auth !== "gateway") return;
	if (route.gatewayRuntimeScopeSurface === "trusted-operator") return context.gatewayRequestAuth ? void 0 : "caller auth context";
	return context.gatewayRequestOperatorScopes === void 0 ? "caller scope context" : void 0;
}
function canRunPluginHttpRouteWithoutAdmission(route) {
	return route.auth === "gateway" && route.gatewayRuntimeScopeSurface === "trusted-operator" && route.gatewayMethodDispatchAllowed === true;
}
function createPluginRouteRuntimeScope(params) {
	const runtimeClient = createPluginRouteRuntimeClient(params.route.auth !== "gateway" ? [] : params.gatewayRequestAuth?.controlUiPluginGrant ? params.gatewayRequestOperatorScopes : params.route.gatewayRuntimeScopeSurface === "trusted-operator" ? resolvePluginRouteRuntimeOperatorScopes(params.req, params.gatewayRequestAuth, "trusted-operator") : params.gatewayRequestOperatorScopes, params.gatewayRequestClientIp, params.route.auth === "gateway" ? params.gatewayRequestAuth : void 0);
	return {
		pluginRegistry: params.registry,
		...params.gatewayRequestContext ? { context: params.gatewayRequestContext } : {},
		client: runtimeClient,
		isWebchatConnect: () => false,
		...params.route.pluginId ? { pluginId: params.route.pluginId } : {},
		...params.route.source ? { pluginSource: params.route.source } : {},
		...params.route.gatewayMethodDispatchAllowed === true ? { gatewayMethodDispatchAllowed: true } : {}
	};
}
function createGatewayPluginRequestHandler(params) {
	const { log } = params;
	return async (req, res, providedPathContext, dispatchContext) => {
		const registry = params.getRouteRegistry?.() ?? params.registry;
		const gatewayRequestContext = params.getGatewayRequestContext?.();
		if ((registry.httpRoutes ?? []).length === 0) return false;
		const pathContext = resolvePluginRoutePathContextForRequest(req, providedPathContext);
		const matchedRoutes = findMatchingPluginHttpRoutes(registry, pathContext);
		if (matchedRoutes.length === 0) return false;
		if (matchedPluginRoutesRequireGatewayAuth(matchedRoutes) && dispatchContext?.gatewayAuthSatisfied !== true) {
			log.warn(`plugin http route blocked without gateway auth (${pathContext.canonicalPath})`);
			return false;
		}
		const firstGatewayRoute = matchedRoutes.find((route) => route.auth === "gateway");
		const presentedGatewayRequestAuth = dispatchContext?.gatewayRequestAuth;
		const presentedControlUiPluginGrants = presentedGatewayRequestAuth?.controlUiPluginGrants;
		const controlUiPluginGrant = presentedControlUiPluginGrants?.find((grant) => grant.pluginId === firstGatewayRoute?.pluginId);
		if (presentedControlUiPluginGrants && (!firstGatewayRoute || !controlUiPluginGrant)) {
			log.warn(`plugin http route blocked for mismatched control ui grant (${pathContext.canonicalPath})`);
			res.statusCode = 401;
			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			res.end("Unauthorized");
			return true;
		}
		const gatewayRequestAuth = controlUiPluginGrant ? {
			...presentedGatewayRequestAuth,
			controlUiPluginGrant
		} : presentedGatewayRequestAuth;
		const gatewayRequestOperatorScopes = controlUiPluginGrant ? controlUiPluginGrant.scopes : dispatchContext?.gatewayRequestOperatorScopes;
		for (const route of matchedRoutes) {
			if (controlUiPluginGrant && route.auth === "gateway" && route.pluginId !== controlUiPluginGrant.pluginId) continue;
			const missingRuntimeContext = getMissingPluginRouteRuntimeContext(route, {
				gatewayRequestAuth,
				gatewayRequestOperatorScopes
			});
			if (missingRuntimeContext) {
				log.warn(`plugin http route blocked without ${missingRuntimeContext} (${pathContext.canonicalPath})`);
				return false;
			}
		}
		if (controlUiPluginGrant && respondControlUiPluginAuthCookieProbe(req, res)) return true;
		for (const route of matchedRoutes) {
			if (controlUiPluginGrant && route.auth === "gateway" && route.pluginId !== controlUiPluginGrant.pluginId) continue;
			try {
				const runRoute = async () => await withPluginRuntimeGatewayRequestScope(createPluginRouteRuntimeScope({
					registry: params.registry,
					route,
					req,
					gatewayRequestContext,
					gatewayRequestAuth,
					gatewayRequestOperatorScopes,
					gatewayRequestClientIp: dispatchContext?.gatewayRequestClientIp
				}), async () => route.handler(req, res)) !== false;
				if (canRunPluginHttpRouteWithoutAdmission(route) ? await runRoute() : await runWithGatewayHttpWorkAdmission(res, runRoute)) return true;
			} catch (err) {
				log.warn(`plugin http route failed (${route.pluginId ?? "unknown"}): ${String(err)}`);
				finishFailedGatewayHttpResponse(res);
				return true;
			}
		}
		return false;
	};
}
function createGatewayPluginUpgradeHandler(params) {
	const { log } = params;
	return async (req, socket, head, providedPathContext, dispatchContext) => {
		const registry = params.getRouteRegistry?.() ?? params.registry;
		const gatewayRequestContext = params.getGatewayRequestContext?.();
		if ((registry.httpRoutes ?? []).length === 0) return false;
		const pathContext = resolvePluginRoutePathContextForRequest(req, providedPathContext);
		const matchedRoutes = findMatchingPluginHttpRoutes(registry, pathContext).filter((route) => typeof route.handleUpgrade === "function");
		if (matchedRoutes.length === 0) return false;
		if (matchedPluginRoutesRequireGatewayAuth(matchedRoutes) && dispatchContext?.gatewayAuthSatisfied !== true) {
			log.warn(`plugin http upgrade blocked without gateway auth (${pathContext.canonicalPath})`);
			writeUpgradeUnauthorized(socket);
			return true;
		}
		const gatewayRequestAuth = dispatchContext?.gatewayRequestAuth;
		const gatewayRequestOperatorScopes = dispatchContext?.gatewayRequestOperatorScopes;
		for (const route of matchedRoutes) {
			const missingRuntimeContext = getMissingPluginRouteRuntimeContext(route, {
				gatewayRequestAuth,
				gatewayRequestOperatorScopes
			});
			if (missingRuntimeContext) {
				log.warn(`plugin http upgrade blocked without ${missingRuntimeContext} (${pathContext.canonicalPath})`);
				writeUpgradeUnauthorized(socket);
				return true;
			}
		}
		for (const route of matchedRoutes) try {
			if (await runWithGatewayUpgradeWorkAdmission(socket, async () => await withPluginRuntimeGatewayRequestScope(createPluginRouteRuntimeScope({
				registry: params.registry,
				route,
				req,
				gatewayRequestContext,
				gatewayRequestAuth,
				gatewayRequestOperatorScopes,
				gatewayRequestClientIp: dispatchContext?.gatewayRequestClientIp
			}), async () => route.handleUpgrade?.(req, socket, head)) !== false)) return true;
		} catch (err) {
			log.warn(`plugin http upgrade failed (${route.pluginId ?? "unknown"}): ${String(err)}`);
			socket.destroy();
			return true;
		}
		return false;
	};
}
//#endregion
export { createGatewayPluginRequestHandler, createGatewayPluginUpgradeHandler, findRegisteredPluginHttpRoute, isPluginAuthenticatedRoutePath, isProtectedPluginRoutePathFromContext, isRegisteredPluginHttpRoutePath, resolvePluginRoutePathContext, shouldEnforceGatewayAuthForPluginPath };
