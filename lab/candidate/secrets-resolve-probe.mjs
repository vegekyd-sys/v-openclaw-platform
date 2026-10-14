// What a Worker's runtime config does before every turn: resolve agent-runtime SecretRefs
// (command-config-resolution -> secrets.resolve on the Gateway, local fallback). Run as a
// Worker would be (VLAB_WORKER_CHILD=1, OPENCLAW_CONFIG_PATH = Worker config). Prints how long
// it took, whether the value equals the environment's, and the diagnostics (fallback or not).
const dist = process.argv[2];
const started = performance.now();
const rt = await import(`${dist}/plugin-sdk/agent-runtime.js`);
const cfg = rt.loadConfig();
const targets = await import(`${dist}/command-secret-targets-esC7Faew.js`);
const { resolveCommandConfigWithSecrets } = await import(`${dist}/command-config-resolution.runtime.js`);
const targetIds = targets.t({ config: cfg, includeChannelTargets: false });
const optionalActivePaths = targets.n(cfg);
const diagnostics = [];
const runtime = { log: () => {}, error: (m) => diagnostics.push(String(m).replace(/(key|token)[^ ]*/giu, "$1…").slice(0, 200)) };
const t = performance.now();
const r = await resolveCommandConfigWithSecrets({ config: cfg, commandName: "agent", targetIds, ...(optionalActivePaths?.size ? { optionalActivePaths } : {}), runtime });
const value = r.resolvedConfig?.plugins?.entries?.google?.config?.webSearch?.apiKey;
console.log(JSON.stringify({ resolveMs: Math.round(performance.now() - t), totalMs: Math.round(performance.now() - started), equalsEnv: typeof value === "string" && value === process.env.GOOGLE_API_KEY, fellBack: diagnostics.some((d) => /unavailable|resolved command secrets locally|attempted local/u.test(d)), diagnostics: diagnostics.filter((d) => /gateway/u.test(d)) }));
process.exit(0);
