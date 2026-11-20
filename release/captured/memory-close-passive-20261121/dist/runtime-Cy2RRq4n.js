import { w as resolveStateDir } from "./paths-Dx1CjxA5.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { t as normalizeExactAllowedHost } from "./exact-hostname-B5MIU7_E.js";
import { a as containsSecretSentinel, c as resolveSecretSentinel, i as SECRET_SENTINEL_SUFFIX, n as SECRET_SENTINEL_PATTERN, o as looksLikeSecretSentinel, r as SECRET_SENTINEL_PREFIX } from "./sentinel-ZgmfESkJ.js";
import { r as publishSecretEgressProxy, t as clearSecretEgressProxy } from "./registry-AG1Awcc4.js";
import { n as ensureSecretEgressProxyCa, r as generateLocalProxyLeaf } from "./ca-DsWeiCkK.js";
import fs from "node:fs";
import { URL } from "node:url";
import path from "node:path";
import net from "node:net";
import { X509Certificate, randomBytes, timingSafeEqual } from "node:crypto";
import { Transform } from "node:stream";
import { createSecureContext, rootCertificates } from "node:tls";
import { createServer as createServer$1 } from "node:http";
import { Agent, createServer as createServer$2, request as request$1 } from "node:https";
//#region src/secrets/egress-proxy/stream-substitution.ts
const SENTINEL_PREFIX_BYTES = Buffer.from(SECRET_SENTINEL_PREFIX);
const SENTINEL_SUFFIX_BYTES = Buffer.from(SECRET_SENTINEL_SUFFIX);
var SecretEgressSubstitutionError = class extends Error {
	constructor(reason, details) {
		super(details ? `Secret "${details.secretName}" is not allowed for host "${details.host}". Run: openclaw secrets store set ${details.secretName} --allow-host ${details.host}` : "Secret egress proxy refused an unresolved secret sentinel");
		this.reason = reason;
		this.details = details;
		this.name = "SecretEgressSubstitutionError";
	}
};
function processPendingBuffer(params) {
	let pending = params.buffer;
	for (;;) {
		const prefixIndex = pending.indexOf(SENTINEL_PREFIX_BYTES);
		if (prefixIndex === -1) {
			const carryBytes = params.flush ? 0 : Math.min(pending.length, SENTINEL_PREFIX_BYTES.length - 1);
			const emitBytes = pending.length - carryBytes;
			if (emitBytes > 0) params.push(pending.subarray(0, emitBytes));
			return carryBytes > 0 ? pending.subarray(emitBytes) : Buffer.alloc(0);
		}
		if (prefixIndex > 0) {
			params.push(pending.subarray(0, prefixIndex));
			pending = pending.subarray(prefixIndex);
		}
		const suffixIndex = pending.indexOf(SENTINEL_SUFFIX_BYTES, SENTINEL_PREFIX_BYTES.length);
		if (suffixIndex === -1) {
			if (params.flush || pending.length > 87445) throw new SecretEgressSubstitutionError("unresolved-sentinel");
			return pending;
		}
		const sentinelEnd = suffixIndex + SENTINEL_SUFFIX_BYTES.length;
		if (sentinelEnd > 87445) throw new SecretEgressSubstitutionError("unresolved-sentinel");
		const sentinel = pending.subarray(0, sentinelEnd).toString("ascii");
		const resolved = looksLikeSecretSentinel(sentinel) ? params.resolveSentinel(sentinel) : void 0;
		if (resolved === void 0) throw new SecretEgressSubstitutionError("unresolved-sentinel");
		params.push(Buffer.from(resolved, "utf8"));
		params.onSubstitution();
		pending = pending.subarray(sentinelEnd);
	}
}
/** Rewrites process-local sentinels across arbitrary request-body chunk boundaries. */
function createSecretEgressBodyTransform(params) {
	let pending = Buffer.alloc(0);
	return new Transform({
		transform(chunk, _encoding, callback) {
			try {
				const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				pending = processPendingBuffer({
					buffer: pending.length > 0 ? Buffer.concat([pending, input]) : input,
					flush: false,
					onSubstitution: params.onSubstitution,
					resolveSentinel: params.resolveSentinel,
					push: (output) => this.push(output)
				});
				callback();
			} catch (error) {
				callback(error);
			}
		},
		flush(callback) {
			try {
				pending = processPendingBuffer({
					buffer: pending,
					flush: true,
					onSubstitution: params.onSubstitution,
					resolveSentinel: params.resolveSentinel,
					push: (output) => this.push(output)
				});
				callback();
			} catch (error) {
				callback(error);
			}
		}
	});
}
//#endregion
//#region src/secrets/egress-proxy/proxy-server.ts
const PROXY_AUTH_USERNAME = "openclaw";
const PROXY_AUTH_REALM = "OpenClaw secret egress";
const REFUSAL_BODY = "Secret egress proxy refused the request.\n";
const UPSTREAM_ERROR_BODY = "Secret egress proxy could not reach the upstream host.\n";
function parseConnectTarget(rawTarget) {
	const raw = rawTarget?.trim();
	if (!raw || /[\r\n]/u.test(raw)) throw new Error("Invalid CONNECT target");
	const target = new URL(`https://${raw}`);
	if (target.pathname !== "/" || target.search || target.hash || target.username || target.password) throw new Error("Invalid CONNECT target");
	const port = target.port ? Number(target.port) : 443;
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid CONNECT target port");
	return {
		hostname: normalizeExactAllowedHost(target.hostname),
		port
	};
}
function runKey(run) {
	return `${run.runId}\0${run.instanceId}`;
}
function parseProxyToken(token) {
	if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return;
	const bytes = Buffer.from(token, "base64url");
	return bytes.length === 32 && bytes.toString("base64url") === token ? bytes : void 0;
}
function parseBasicProxyPassword(header) {
	if (typeof header !== "string") return;
	const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/iu.exec(header.trim());
	if (!match?.[1]) return;
	let decoded;
	try {
		decoded = Buffer.from(match[1], "base64").toString("utf8");
	} catch {
		return;
	}
	const colon = decoded.indexOf(":");
	if (colon === -1 || decoded.slice(0, colon) !== PROXY_AUTH_USERNAME) return;
	return decoded.slice(colon + 1);
}
function sendProxyAuthRequired(socket) {
	socket.end(`HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="${PROXY_AUTH_REALM}"\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(REFUSAL_BODY)}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${REFUSAL_BODY}`);
}
function sendHttpRefusal(res, status = 502, body = REFUSAL_BODY) {
	if (res.destroyed || res.writableEnded) return;
	if (res.headersSent) {
		res.destroy();
		return;
	}
	res.writeHead(status, {
		Connection: "close",
		"Content-Length": Buffer.byteLength(body),
		"Content-Type": "text/plain; charset=utf-8"
	});
	res.end(body);
}
function resolveRegisteredSentinel(params) {
	if (!params.registered.isActive()) return;
	const binding = params.registered.sentinelBindings.get(params.sentinel);
	if (!binding) return;
	if (!binding.allowedHosts.has(params.host)) throw new SecretEgressSubstitutionError("destination-not-allowed", {
		host: params.host,
		secretName: binding.name
	});
	return resolveSecretSentinel(params.sentinel);
}
function swapRequestText(params) {
	if (!containsSecretSentinel(params.value)) return {
		value: params.value,
		substituted: false
	};
	let substituted = false;
	const swapped = params.value.replace(new RegExp(SECRET_SENTINEL_PATTERN.source, "g"), (sentinel) => {
		const resolved = resolveRegisteredSentinel({
			sentinel,
			host: params.host,
			registered: params.registered
		});
		if (resolved === void 0) return sentinel;
		substituted = true;
		return params.urlMode ? encodeURIComponent(resolved) : resolved;
	});
	if (containsSecretSentinel(swapped)) throw new SecretEgressSubstitutionError("unresolved-sentinel");
	return {
		value: swapped,
		substituted
	};
}
function swapRequestHeaders(params) {
	const output = {};
	let substituted = false;
	for (const [name, rawValue] of Object.entries(params.headers)) {
		const lowerName = name.toLowerCase();
		if (lowerName === "proxy-authorization" || lowerName === "proxy-connection") continue;
		if (Array.isArray(rawValue)) {
			output[name] = rawValue.map((value) => {
				const swapped = swapRequestText({
					value,
					urlMode: false,
					host: params.host,
					registered: params.registered
				});
				substituted ||= swapped.substituted;
				return swapped.value;
			});
			continue;
		}
		if (rawValue !== void 0) {
			const swapped = swapRequestText({
				value: rawValue,
				urlMode: false,
				host: params.host,
				registered: params.registered
			});
			substituted ||= swapped.substituted;
			output[name] = swapped.value;
		}
	}
	delete output["content-length"];
	delete output["transfer-encoding"];
	return {
		headers: output,
		substituted
	};
}
/** Starts one authenticated, loopback-only substitution proxy. */
async function startSecretEgressProxyServer(params) {
	const ca = await ensureSecretEgressProxyCa(params.caDir);
	const caPem = fs.readFileSync(ca.certPath, "utf8");
	const trustBundlePath = path.join(params.caDir, "trust-bundle.pem");
	fs.writeFileSync(trustBundlePath, `${rootCertificates.join("\n")}\n${caPem}`, { mode: 420 });
	// egress-proxy-tls-reuse-v1: one upstream SecureContext per proxy instead of one per forwarded request.
	const upstreamTlsAgent = new Agent({ secureContext: createSecureContext({ ca: [...rootCertificates, caPem] }) });
	// egress-proxy-tls-reuse-v1: leaves depend only on hostname + CA + the shared leaf key; mint once per proxy.
	const leafCache = /* @__PURE__ */ new Map();
	const LEAF_CACHE_MAX = 512;
	const LEAF_REUSE_MARGIN_MS = 60 * 60 * 1e3;
	const caFileStamp = () => {
		try {
			const stat = fs.statSync(ca.certPath);
			return `${stat.mtimeMs}:${stat.size}`;
		} catch {
			return "missing";
		}
	};
	const leafFor = (hostname) => {
		const caStamp = caFileStamp();
		const cached = leafCache.get(hostname);
		if (cached && cached.caStamp === caStamp && (cached.notAfterMs === void 0 || cached.notAfterMs - Date.now() > LEAF_REUSE_MARGIN_MS)) return cached.promise;
		if (cached) leafCache.delete(hostname);
		const entry = {
			caStamp,
			notAfterMs: void 0,
			promise: void 0
		};
		entry.promise = generateLocalProxyLeaf({
			certDir: params.caDir,
			ca,
			hostname
		}).then((leaf) => {
			let notAfterMs = 0;
			try {
				notAfterMs = Date.parse(new X509Certificate(leaf.cert).validTo) || 0;
			} catch {}
			entry.notAfterMs = notAfterMs;
			return leaf;
		}, (error) => {
			if (leafCache.get(hostname) === entry) leafCache.delete(hostname);
			throw error;
		});
		leafCache.set(hostname, entry);
		if (leafCache.size > LEAF_CACHE_MAX) leafCache.delete(leafCache.keys().next().value);
		return entry.promise;
	};
	const bypassHosts = new Set((params.bypassHosts ?? []).map(normalizeExactAllowedHost));
	const allowedHosts = params.allowedHosts === void 0 ? void 0 : new Set(params.allowedHosts.map(normalizeExactAllowedHost));
	const registrations = /* @__PURE__ */ new Map();
	const sockets = /* @__PURE__ */ new Set();
	const preparations = /* @__PURE__ */ new Set();
	let stopped = false;
	let stopPromise;
	const ownResource = (registered, resource) => {
		if (!registered.resources.has(resource)) {
			registered.resources.add(resource);
			resource.once("close", () => registered.resources.delete(resource));
			resource.on("error", () => resource.destroy());
		}
		if (!registered.isActive()) resource.destroy();
		return resource;
	};
	const revokeRegistration = (registered) => {
		registrations.delete(registered.key);
		registered.sentinelBindings.clear();
		for (const resource of registered.resources) resource.destroy();
		registered.resources.clear();
		for (const server of registered.tlsServers.values()) server.then((ready) => ready?.close(), () => {});
		registered.tlsServers.clear();
	};
	const audit = (event) => params.onAudit(event);
	const hostAllowed = (host, registered) => {
		if (allowedHosts === void 0 || allowedHosts.has(host) || bypassHosts.has(host)) return true;
		for (const binding of registered.sentinelBindings.values()) if (binding.allowedHosts.has(host)) return true;
		return false;
	};
	const hostNotAllowedBody = (host) => `Host "${host}" is not in the secret egress proxy traffic allowlist. Add it to secrets.egressProxy.allowedHosts or bind a store secret to it with: openclaw secrets store set <NAME> --allow-host ${host}, then restart the Gateway.\n`;
	const authorize = (headers) => {
		const rawHeader = headers["proxy-authorization"];
		if (rawHeader === void 0) return "missing-proxy-auth";
		const password = parseBasicProxyPassword(rawHeader);
		if (!password) return "invalid-proxy-auth";
		const candidate = parseProxyToken(password);
		if (!candidate) return "invalid-proxy-auth";
		for (const registered of registrations.values()) if (timingSafeEqual(candidate, registered.token)) return registered;
		return "invalid-proxy-auth";
	};
	const parseRequestTarget = (request, response, base) => {
		try {
			const target = new URL(request.url ?? "/", base);
			return {
				target,
				host: normalizeExactAllowedHost(target.hostname)
			};
		} catch {
			audit({
				kind: "refused",
				host: "unknown",
				substituted: false,
				reason: "upstream-error"
			});
			sendHttpRefusal(response, 400);
			request.resume();
			return;
		}
	};
	const forwardRequest = (forward) => {
		ownResource(forward.registered, forward.request);
		ownResource(forward.registered, forward.response);
		if (!forward.registered.isActive()) return;
		const { host } = forward;
		if (forward.target.protocol !== "https:") {
			audit({
				kind: "refused",
				host,
				substituted: false,
				reason: "non-https-request"
			});
			sendHttpRefusal(forward.response);
			forward.request.resume();
			return;
		}
		if (!hostAllowed(host, forward.registered)) {
			audit({
				kind: "refused",
				host,
				substituted: false,
				reason: "host-not-allowed"
			});
			sendHttpRefusal(forward.response, 403, hostNotAllowedBody(host));
			forward.request.resume();
			return;
		}
		let substituted = false;
		let target;
		let headers;
		try {
			const swappedUrl = swapRequestText({
				value: forward.target.toString(),
				urlMode: true,
				host,
				registered: forward.registered
			});
			target = new URL(swappedUrl.value);
			const swappedHeaders = swapRequestHeaders({
				headers: forward.request.headers,
				host,
				registered: forward.registered
			});
			headers = swappedHeaders.headers;
			headers.host = target.host;
			substituted = swappedUrl.substituted || swappedHeaders.substituted;
		} catch (error) {
			const reason = error instanceof SecretEgressSubstitutionError ? error.reason : "unresolved-sentinel";
			audit({
				kind: "refused",
				host,
				substituted,
				reason
			});
			sendHttpRefusal(forward.response, 502, error instanceof SecretEgressSubstitutionError ? `${error.message}\n` : REFUSAL_BODY);
			forward.request.resume();
			return;
		}
		const bodyTransform = ownResource(forward.registered, createSecretEgressBodyTransform({
			onSubstitution: () => {
				substituted = true;
			},
			resolveSentinel: (sentinel) => resolveRegisteredSentinel({
				sentinel,
				host,
				registered: forward.registered
			})
		}));
		let refused = false;
		const upstream = ownResource(forward.registered, request$1({
			hostname: target.hostname,
			port: target.port || 443,
			path: `${target.pathname}${target.search}`,
			method: forward.request.method,
			headers,
			agent: upstreamTlsAgent
		}, (upstreamResponse) => {
			ownResource(forward.registered, upstreamResponse);
			if (refused || !forward.registered.isActive()) {
				upstreamResponse.destroy();
				return;
			}
			upstreamResponse.once("error", () => forward.response.destroy());
			forward.response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
			upstreamResponse.pipe(forward.response);
		}));
		forward.request.once("error", () => forward.response.destroy());
		forward.response.once("close", () => {
			refused = true;
			forward.request.unpipe(bodyTransform);
			bodyTransform.destroy();
			upstream.destroy();
		});
		bodyTransform.once("finish", () => {
			if (!refused && forward.registered.isActive()) audit({
				kind: "forwarded",
				host,
				substituted
			});
		});
		bodyTransform.once("error", (error) => {
			if (refused || !forward.registered.isActive()) return;
			refused = true;
			forward.request.unpipe(bodyTransform);
			forward.request.resume();
			upstream.destroy();
			const reason = error instanceof SecretEgressSubstitutionError ? error.reason : "unresolved-sentinel";
			audit({
				kind: "refused",
				host,
				substituted,
				reason
			});
			sendHttpRefusal(forward.response, 502, error instanceof SecretEgressSubstitutionError ? `${error.message}\n` : REFUSAL_BODY);
		});
		upstream.once("error", () => {
			if (refused || !forward.registered.isActive()) return;
			refused = true;
			audit({
				kind: "refused",
				host,
				substituted,
				reason: "upstream-error"
			});
			sendHttpRefusal(forward.response, 502, UPSTREAM_ERROR_BODY);
		});
		forward.request.pipe(bodyTransform).pipe(upstream);
	};
	const tlsServerFor = (target, registered) => {
		const key = `${target.hostname}:${target.port}`;
		let server = registered.tlsServers.get(key);
		if (!server) {
			server = leafFor(target.hostname).then((leaf) => {
				if (!registered.isActive()) return;
				return createServer$2(leaf, (request, response) => {
					const parsed = parseRequestTarget(request, response, `https://${target.hostname}${target.port === 443 ? "" : `:${target.port}`}`);
					if (parsed) forwardRequest({
						request,
						response,
						...parsed,
						registered
					});
				}).on("secureConnection", (socket) => ownResource(registered, socket));
			});
			registered.tlsServers.set(key, server);
			preparations.add(server);
			const prepared = server;
			prepared.then(() => preparations.delete(prepared), () => preparations.delete(prepared));
		}
		return server;
	};
	const proxy = createServer$1((request, response) => {
		const parsed = parseRequestTarget(request, response);
		if (!parsed) return;
		const { host } = parsed;
		const authorization = authorize(request.headers);
		if (typeof authorization === "string") {
			audit({
				kind: "refused",
				host,
				substituted: false,
				reason: authorization
			});
			response.writeHead(407, {
				"Proxy-Authenticate": `Basic realm="${PROXY_AUTH_REALM}"`,
				Connection: "close",
				"Content-Length": Buffer.byteLength(REFUSAL_BODY),
				"Content-Type": "text/plain; charset=utf-8"
			});
			response.end(REFUSAL_BODY);
			request.resume();
			return;
		}
		forwardRequest({
			request,
			response,
			...parsed,
			registered: authorization
		});
	});
	proxy.on("connection", (socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.on("error", () => {
			socket.destroy();
		});
	});
	proxy.on("connect", (request, clientSocket, head) => {
		(async () => {
			let target;
			try {
				target = parseConnectTarget(request.url);
			} catch {
				audit({
					kind: "refused",
					host: "unknown",
					substituted: false,
					reason: "upstream-error"
				});
				clientSocket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
				return;
			}
			const authorization = authorize(request.headers);
			if (typeof authorization === "string") {
				audit({
					kind: "refused",
					host: target.hostname,
					substituted: false,
					reason: authorization
				});
				sendProxyAuthRequired(clientSocket);
				return;
			}
			ownResource(authorization, clientSocket);
			if (bypassHosts.has(target.hostname)) {
				const upstream = ownResource(authorization, net.connect(target.port, target.hostname, () => {
					if (!authorization.isActive() || clientSocket.destroyed) {
						upstream.destroy();
						return;
					}
					clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
					if (head.length > 0) upstream.write(head);
					clientSocket.pipe(upstream).pipe(clientSocket);
					audit({
						kind: "forwarded",
						host: target.hostname,
						substituted: false,
						reason: "bypass"
					});
				}));
				clientSocket.once("close", () => upstream.destroy());
				upstream.once("close", () => clientSocket.destroy());
				upstream.once("error", () => clientSocket.destroy());
				return;
			}
			if (!hostAllowed(target.hostname, authorization)) {
				const body = hostNotAllowedBody(target.hostname);
				audit({
					kind: "refused",
					host: target.hostname,
					substituted: false,
					reason: "host-not-allowed"
				});
				clientSocket.end(`HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`);
				return;
			}
			try {
				const tlsServer = await tlsServerFor(target, authorization);
				if (!tlsServer || !authorization.isActive() || clientSocket.destroyed) {
					clientSocket.destroy();
					return;
				}
				clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
				if (head.length > 0) clientSocket.unshift(head);
				tlsServer.emit("connection", clientSocket);
			} catch {
				if (!authorization.isActive() || clientSocket.destroyed) return;
				audit({
					kind: "refused",
					host: target.hostname,
					substituted: false,
					reason: "upstream-error"
				});
				clientSocket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
			}
		})();
	});
	await new Promise((resolve, reject) => {
		proxy.once("error", reject);
		proxy.listen(0, "127.0.0.1", () => {
			proxy.off("error", reject);
			resolve();
		});
	});
	const address = proxy.address();
	if (!address || typeof address === "string") throw new Error("Secret egress proxy failed to bind loopback");
	const proxyOrigin = `http://127.0.0.1:${address.port}`;
	return {
		caCertPath: ca.certPath,
		proxyOrigin,
		registerRun: (run, bindings = []) => {
			if (stopped) throw new Error("Secret egress proxy has stopped");
			const key = runKey(run);
			let registered = registrations.get(key);
			if (!registered) {
				registered = {
					key,
					sentinelBindings: /* @__PURE__ */ new Map(),
					token: randomBytes(32),
					isActive: () => !stopped && registrations.get(key) === registered,
					resources: /* @__PURE__ */ new Set(),
					tlsServers: /* @__PURE__ */ new Map()
				};
				registrations.set(key, registered);
			}
			registered.sentinelBindings = new Map(bindings.map((binding) => [binding.sentinel, {
				allowedHosts: new Set(binding.allowedHosts.map(normalizeExactAllowedHost)),
				name: binding.name
			}]));
			const token = registered.token.toString("base64url");
			const proxyUrl = `http://${PROXY_AUTH_USERNAME}:${token}@127.0.0.1:${address.port}`;
			return {
				HTTPS_PROXY: proxyUrl,
				HTTP_PROXY: proxyUrl,
				NODE_USE_ENV_PROXY: "1",
				NODE_EXTRA_CA_CERTS: trustBundlePath,
				SSL_CERT_FILE: trustBundlePath,
				CURL_CA_BUNDLE: trustBundlePath,
				REQUESTS_CA_BUNDLE: trustBundlePath
			};
		},
		revokeRun: (run) => {
			const registered = registrations.get(runKey(run));
			if (registered) revokeRegistration(registered);
		},
		stop: () => {
			if (stopPromise) return stopPromise;
			stopped = true;
			for (const registered of registrations.values()) revokeRegistration(registered);
			upstreamTlsAgent.destroy();
			leafCache.clear();
			for (const socket of sockets) socket.destroy();
			sockets.clear();
			stopPromise = Promise.all([new Promise((resolve) => {
				proxy.close(() => resolve());
			}), Promise.allSettled(preparations)]).then(() => {});
			return stopPromise;
		}
	};
}
//#endregion
//#region src/secrets/egress-proxy/runtime.ts
const log = createSubsystemLogger("secrets/egress-proxy");
const SECRET_EGRESS_PROXY_DIR_MODE = 448;
function removeProxyDirBestEffort(proxyDir) {
	try {
		fs.rmSync(proxyDir, {
			recursive: true,
			force: true
		});
		fs.rmdirSync(path.dirname(proxyDir));
	} catch {}
}
function removeStaleProxyDirs(parentDir) {
	for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) if (entry.isDirectory() && entry.name.startsWith("gateway-")) fs.rmSync(path.join(parentDir, entry.name), {
		recursive: true,
		force: true
	});
}
/** Starts the process-local proxy and registers it as the current Gateway owner. */
async function startGatewaySecretEgressProxy(params) {
	const parentDir = path.join(resolveStateDir(), "secret-egress-proxy");
	fs.mkdirSync(parentDir, {
		recursive: true,
		mode: SECRET_EGRESS_PROXY_DIR_MODE
	});
	fs.chmodSync(parentDir, SECRET_EGRESS_PROXY_DIR_MODE);
	removeStaleProxyDirs(parentDir);
	const proxyDir = fs.mkdtempSync(path.join(parentDir, "gateway-"));
	fs.chmodSync(proxyDir, SECRET_EGRESS_PROXY_DIR_MODE);
	let proxy;
	try {
		proxy = await startSecretEgressProxyServer({
			caDir: proxyDir,
			...params.allowedHosts !== void 0 ? { allowedHosts: params.allowedHosts } : {},
			...params.bypassHosts ? { bypassHosts: params.bypassHosts } : {},
			onAudit: (event) => log.info("secret egress request", event)
		});
		const ownedProxy = proxy;
		const cleanupOnProcessExit = () => removeProxyDirBestEffort(proxyDir);
		process.once("exit", cleanupOnProcessExit);
		const handle = {
			...ownedProxy,
			stop: async () => {
				clearSecretEgressProxy(handle);
				process.off("exit", cleanupOnProcessExit);
				try {
					await ownedProxy.stop();
				} finally {
					removeProxyDirBestEffort(proxyDir);
				}
			}
		};
		publishSecretEgressProxy(handle);
		return handle;
	} catch (error) {
		await proxy?.stop().catch(() => void 0);
		removeProxyDirBestEffort(proxyDir);
		throw error;
	}
}
//#endregion
export { startGatewaySecretEgressProxy };
