// Boot options that put a real Codex app-server behind /vds, with the fake model as DeepSeek.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CODEX_BIN = process.env.C3_CODEX_BIN;
export const DEEPSEEK_PLUGIN = process.env.C3_DEEPSEEK_PLUGIN;

export function vdsBoot({ modelScript, config = {}, ...rest } = {}) {
  if (!CODEX_BIN || !DEEPSEEK_PLUGIN) throw new Error("C3_CODEX_BIN and C3_DEEPSEEK_PLUGIN are required");
  return {
    modelScript,
    setup: (_dir, { stateDir, modelPort }) => {
      const home = path.join(stateDir, "agents", "main", "agent", "codex-home");
      mkdirSync(home, { recursive: true });
      writeFileSync(
        path.join(home, "config.toml"),
        `[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "http://127.0.0.1:${modelPort}/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`,
      );
      return {};
    },
    env: { DEEPSEEK_API_KEY: "contract" },
    config: {
      models: {
        providers: {
          deepseek: {
            baseUrl: "FAKE_MODEL_URL",
            apiKey: "contract",
            api: "openai-responses",
            request: { allowPrivateNetwork: true },
            models: [{ id: "deepseek-flash", name: "deepseek-flash", contextWindow: 1000000, maxTokens: 8192, input: ["text", "image"], reasoning: true, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
          },
        },
      },
      plugins: {
        load: { paths: [DEEPSEEK_PLUGIN] },
        entries: {
          codex: { enabled: true, config: { appServer: { command: CODEX_BIN, mode: "yolo", approvalPolicy: "never", sandbox: "danger-full-access" } } },
        },
      },
      agents: {
        defaults: {
          model: { primary: "deepseek/deepseek-flash" },
          models: { "deepseek/deepseek-flash": { alias: "vds", agentRuntime: { id: "codex" } } },
        },
      },
      ...config,
    },
    ...rest,
  };
}

/** /vcodex: a real Codex app-server on its OpenAI route, the fake model as OpenAI. */
export function vcodexBoot({ modelScript, config = {}, ...rest } = {}) {
  if (!CODEX_BIN) throw new Error("C3_CODEX_BIN is required");
  return {
    modelScript,
    setup: (_dir, { stateDir, modelPort }) => {
      const home = path.join(stateDir, "agents", "main", "agent", "codex-home");
      mkdirSync(home, { recursive: true });
      writeFileSync(path.join(home, "config.toml"), `openai_base_url = "http://127.0.0.1:${modelPort}/v1"\n`);
      writeFileSync(path.join(home, "auth.json"), JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "contract" }));
      return {};
    },
    env: { OPENAI_API_KEY: "contract" },
    config: {
      plugins: { entries: { codex: { enabled: true, config: { appServer: { command: CODEX_BIN, mode: "yolo", approvalPolicy: "never", sandbox: "danger-full-access" } } } } },
      agents: { defaults: { model: { primary: "openai/gpt-5.6-sol" }, models: { "openai/gpt-5.6-sol": { alias: "vcodex", agentRuntime: { id: "codex" } } } } },
      ...config,
    },
    ...rest,
  };
}

/** Both routes in one Gateway, so a session can switch between /vds and /vcodex. */
export function bothBoot({ modelScript } = {}) {
  const vds = vdsBoot({ modelScript });
  return {
    ...vds,
    setup: (dir, ctx) => {
      vds.setup(dir, ctx);
      const file = path.join(ctx.stateDir, "agents", "main", "agent", "codex-home");
      writeFileSync(path.join(file, "config.toml"), `openai_base_url = "http://127.0.0.1:${ctx.modelPort}/v1"\n${readFileSync(path.join(file, "config.toml"), "utf8")}`);
      return {};
    },
    env: { ...vds.env, OPENAI_API_KEY: "contract" },
    config: {
      ...vds.config,
      agents: { defaults: { model: vds.config.agents.defaults.model, models: { ...vds.config.agents.defaults.models, "openai/gpt-5.6-sol": { alias: "vcodex", agentRuntime: { id: "codex" } } } } },
    },
  };
}
