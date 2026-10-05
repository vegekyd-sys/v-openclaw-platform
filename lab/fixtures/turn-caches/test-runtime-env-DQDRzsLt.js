//#region src/infra/test-runtime-env.ts
/** Detects Vitest/test execution from the env shape used by local and worker processes. */
function isVitestRuntimeEnv(env = process.env) {
	return env.VITEST === "true" || env.VITEST === "1" || env.VITEST_POOL_ID !== void 0 || env.VITEST_WORKER_ID !== void 0 || env.NODE_ENV === "test";
}
/** Enables the shared fast-test shortcuts only inside a detected test runtime. */
function isFastTestRuntimeEnv(env = process.env) {
	return (isVitestRuntimeEnv(env) || env !== process.env && isVitestRuntimeEnv(process.env)) && env.OPENCLAW_TEST_FAST === "1";
}
//#endregion
export { isVitestRuntimeEnv as n, isFastTestRuntimeEnv as t };
