import { i as resolveGlobalSingleton } from "./global-singleton-Dc_stLtU.js";
import { AsyncLocalStorage } from "node:async_hooks";
//#region src/plugins/runtime/gateway-request-scope.ts
const PLUGIN_RUNTIME_GATEWAY_REQUEST_SCOPE_KEY = Symbol.for("openclaw.pluginRuntimeGatewayRequestScope");
const GATEWAY_CONTEXT_RESOLVERS_KEY = Symbol.for("openclaw.gatewayContextResolvers");
const pluginRuntimeGatewayRequestScope = resolveGlobalSingleton(PLUGIN_RUNTIME_GATEWAY_REQUEST_SCOPE_KEY, () => new AsyncLocalStorage());
const gatewayContextResolvers = resolveGlobalSingleton(GATEWAY_CONTEXT_RESOLVERS_KEY, () => /* @__PURE__ */ new WeakMap());
function bindGatewayContextResolver(owner, resolver) {
	if (resolver) gatewayContextResolvers.set(owner, resolver);
}
const getGatewayContextResolver = (owner) => gatewayContextResolvers.get(owner);
const clearGatewayContextResolver = (owner) => gatewayContextResolvers.delete(owner);
/** Carry only closure-bound node authorities into a nested request scope. */
function getPluginRuntimeGatewayNodeAuthorities() {
	const scope = pluginRuntimeGatewayRequestScope.getStore();
	return {
		invokeWithSessionNodeAuthority: scope?.invokeWithSessionNodeAuthority,
		nodePlacementGrantAuthority: scope?.nodePlacementGrantAuthority
	};
}
function getSharedGatewayContextResolver(owners) {
	const first = owners[0] ? gatewayContextResolvers.get(owners[0]) : void 0;
	return owners.every((owner) => gatewayContextResolvers.get(owner) === first) ? first : () => void 0;
}
/**
* Runs plugin gateway handlers with request-scoped context that runtime helpers can read.
*/
function withPluginRuntimeGatewayRequestScope(scope, run) {
	return pluginRuntimeGatewayRequestScope.run(scope, run);
}
/** Runs detached plugin work against one lifecycle-fenced Gateway instance. */
function withPluginRuntimeGatewayContextResolver(resolveGatewayContext, run, options) {
	const current = options?.inheritRequestScope === false ? void 0 : pluginRuntimeGatewayRequestScope.getStore();
	const scoped = {
		...current,
		isWebchatConnect: current?.isWebchatConnect ?? (() => false),
		resolveGatewayContext
	};
	delete scoped.context;
	return pluginRuntimeGatewayRequestScope.run(scoped, run);
}
/** Runs work against an owned registry handle while preserving any gateway request facts. */
function withPluginRuntimeRegistryScope(registry, run) {
	if (!registry) return run();
	const current = pluginRuntimeGatewayRequestScope.getStore();
	return pluginRuntimeGatewayRequestScope.run({
		isWebchatConnect: () => false,
		...current,
		pluginRegistry: registry
	}, run);
}
/**
* Runs work under the current gateway request scope while attaching plugin identity.
*/
function withPluginRuntimePluginScope(scope, run) {
	const current = pluginRuntimeGatewayRequestScope.getStore();
	const scoped = current ? {
		...current,
		pluginId: scope.pluginId
	} : {
		pluginId: scope.pluginId,
		isWebchatConnect: () => false
	};
	if (scope.pluginSource !== void 0) scoped.pluginSource = scope.pluginSource;
	else delete scoped.pluginSource;
	if (scope.pluginOrigin !== void 0) scoped.pluginOrigin = scope.pluginOrigin;
	else delete scoped.pluginOrigin;
	if (scope.pluginTrustedOfficialInstall !== void 0) scoped.pluginTrustedOfficialInstall = scope.pluginTrustedOfficialInstall;
	else delete scoped.pluginTrustedOfficialInstall;
	return pluginRuntimeGatewayRequestScope.run(scoped, run);
}
/**
* Runs work under the current gateway request scope while attaching plugin identity.
*/
function withPluginRuntimePluginIdScope(pluginId, run) {
	return withPluginRuntimePluginScope({ pluginId }, run);
}
/**
* Returns the current plugin gateway request scope when called from a plugin request handler.
*/
function getPluginRuntimeGatewayRequestScope() {
	return pluginRuntimeGatewayRequestScope.getStore();
}
//#endregion
export { getPluginRuntimeGatewayRequestScope as a, withPluginRuntimeGatewayRequestScope as c, withPluginRuntimeRegistryScope as d, getPluginRuntimeGatewayNodeAuthorities as i, withPluginRuntimePluginIdScope as l, clearGatewayContextResolver as n, getSharedGatewayContextResolver as o, getGatewayContextResolver as r, withPluginRuntimeGatewayContextResolver as s, bindGatewayContextResolver as t, withPluginRuntimePluginScope as u };
