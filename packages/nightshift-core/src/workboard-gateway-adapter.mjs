import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class WorkboardGatewayAdapter {
  constructor({
    board = "nightshift",
    command = process.env.NIGHTSHIFT_OPENCLAW_COMMAND ?? "openclaw",
    configPath = process.env.OPENCLAW_CONFIG_PATH,
    entry = process.env.NIGHTSHIFT_OPENCLAW_ENTRY,
    env = process.env,
    gatewayUrl = process.env.NIGHTSHIFT_GATEWAY_URL,
    applyConcurrency = positiveInteger(process.env.NIGHTSHIFT_WORKBOARD_APPLY_CONCURRENCY, 8),
    listBatchSize = positiveInteger(process.env.NIGHTSHIFT_WORKBOARD_LIST_BATCH_SIZE, 100, 500),
    listConcurrency = positiveInteger(process.env.NIGHTSHIFT_WORKBOARD_LIST_CONCURRENCY, 4),
    maxBufferBytes = positiveBufferSize(process.env.NIGHTSHIFT_GATEWAY_MAX_BUFFER_BYTES, 32 * 1024 * 1024),
    rpcTimeoutMs = positiveTimeout(process.env.NIGHTSHIFT_GATEWAY_RPC_TIMEOUT_MS, 30_000),
    runner = defaultRunner,
  } = {}) {
    this.board = board;
    this.command = command;
    this.configPath = configPath;
    this.entry = entry;
    this.env = env;
    this.gatewayUrl = gatewayUrl;
    this.applyConcurrency = applyConcurrency;
    this.listBatchSize = listBatchSize;
    this.listConcurrency = listConcurrency;
    this.maxBufferBytes = maxBufferBytes;
    this.rpcTimeoutMs = rpcTimeoutMs;
    this.runner = runner;
    this.sessionSnapshots = null;
  }

  async listCards({ cardIds = null } = {}) {
    if (!Array.isArray(cardIds)) {
      const result = await this.call("workboard.cards.list", { boardId: this.board });
      return result.cards ?? [];
    }
    const ids = uniqueCardIds(cardIds);
    if (ids.length === 0) return [];
    const cards = [];
    for (let offset = 0; offset < ids.length; offset += this.listBatchSize * this.listConcurrency) {
      const window = ids.slice(offset, offset + this.listBatchSize * this.listConcurrency);
      const batches = [];
      for (let index = 0; index < window.length; index += this.listBatchSize) {
        batches.push(window.slice(index, index + this.listBatchSize));
      }
      const results = await Promise.all(batches.map((batch) => this.call("workboard.cards.list", {
        boardId: this.board,
        cardIds: batch,
      })));
      for (const result of results) cards.push(...(result.cards ?? []));
    }
    return cards;
  }

  async applyPlan(actions, { cards = null, dryRun = false } = {}) {
    const results = [];
    const knownCards = cards ? [...cards] : await this.listCards();
    for (let offset = 0; offset < actions.length; offset += this.applyConcurrency) {
      const batch = actions.slice(offset, offset + this.applyConcurrency);
      const applied = await Promise.all(batch.map((action) => this.applyAction(action, { dryRun, knownCards })));
      for (const result of applied) {
        results.push(result);
        if (result.card?.id && !knownCards.some((card) => card.id === result.card.id)) {
          knownCards.push(result.card);
        }
      }
    }
    return results;
  }

  async applyAction(action, { dryRun = false, knownCards = null } = {}) {
    if (action.type === "schedule_timer") {
      return { action, status: "deferred", reason: "timer_store_required" };
    }
    const marker = gatewayIdempotencyLabel(action.idempotencyKey);
    const existing = (knownCards ?? await this.listCards()).find((card) =>
      (card.labels ?? []).includes(marker),
    );
    if (existing) return { action, card: existing, status: "reused" };

    const card = action.card ?? approvalCard(action);
    const payload = {
      boardId: this.board,
      title: card.title,
      status: card.status ?? "ready",
      priority: card.priority ?? "normal",
      agentId: card.assignedAgent ?? undefined,
      labels: [...new Set([...(card.labels ?? []), marker])],
      maxRetries: card.automation?.maxAttempts ?? undefined,
      maxRuntimeSeconds: card.automation?.maxRuntimeSeconds ?? undefined,
      notes: card.notes ?? null,
      metadata: {
        automation: {
          ...(card.automation ?? {}),
          boardId: this.board,
          nightshiftActionKey: action.idempotencyKey,
        },
      },
    };
    if (dryRun) return { action, payload, status: "planned" };
    const result = await this.call("workboard.cards.create", payload);
    return { action, card: result.card, status: "created" };
  }

  async moveCard(id, status, position) {
    const result = await this.call("workboard.cards.move", { id, position, status });
    return result.card;
  }

  async updateCard(id, patch) {
    const result = await this.call("workboard.cards.update", { id, patch });
    return result.card;
  }

  async dispatch(maxStarts = 1, { cardIds = null } = {}) {
    return this.call("workboard.cards.dispatch", {
      boardId: this.board,
      maxStarts,
      ...(Array.isArray(cardIds) ? { cardIds: uniqueCardIds(cardIds) } : {}),
    });
  }

  async getSession(sessionKey, { limit = 300 } = {}) {
    if (!sessionKey) throw new Error("A native Workboard session key is required");
    if (this.sessionSnapshots?.has(sessionKey)) {
      const snapshot = this.sessionSnapshots.get(sessionKey);
      if (snapshot.error) throw snapshot.error;
      return snapshot.value;
    }
    return this.call("sessions.get", { key: sessionKey, limit });
  }

  async prefetchSessions(sessionKeys, { concurrency = 8, limit = 12 } = {}) {
    const keys = uniqueCardIds(sessionKeys);
    const snapshots = new Map();
    for (let offset = 0; offset < keys.length; offset += concurrency) {
      const batch = keys.slice(offset, offset + concurrency);
      const results = await Promise.all(batch.map(async (key) => {
        try {
          return { key, value: await this.call("sessions.get", { key, limit }) };
        } catch (error) {
          return { error, key };
        }
      }));
      for (const result of results) snapshots.set(result.key, result);
    }
    this.sessionSnapshots = snapshots;
    return { count: keys.length, failed: [...snapshots.values()].filter((entry) => entry.error).length };
  }

  clearSessionSnapshots() {
    this.sessionSnapshots = null;
  }

  async completeCard(id, input = {}) {
    const result = await this.call("workboard.cards.complete", { id, ...input });
    return result.card;
  }

  async blockCard(id, input = {}) {
    const result = await this.call("workboard.cards.block", { id, ...input });
    return result.card;
  }

  async getSkillsStatus(agentId) {
    if (!agentId) throw new Error("An Agent id is required for Skill preflight");
    return this.call("skills.status", { agentId });
  }

  async call(method, params) {
    if (!this.gatewayUrl) throw new Error("NIGHTSHIFT_GATEWAY_URL is required");
    const gateway = new URL(this.gatewayUrl);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(gateway.hostname)) {
      throw new Error("Night Shift Workboard Gateway must be loopback-local");
    }
    if (!this.configPath) throw new Error("OPENCLAW_CONFIG_PATH is required");
    const config = JSON.parse(await readFile(this.configPath, "utf8"));
    const token = config.gateway?.auth?.token;
    if (!token) throw new Error("Gateway auth token is missing from the configured file");
    const args = [
      ...(this.entry ? [this.entry] : []),
      "gateway",
      "call",
      method,
      "--params",
      JSON.stringify(params),
      "--json",
      "--timeout",
      String(this.rpcTimeoutMs),
    ];
    const output = await this.runner(this.command, args, {
      ...this.env,
      OPENCLAW_GATEWAY_TOKEN: token,
      OPENCLAW_GATEWAY_URL: this.gatewayUrl,
    }, { maxBufferBytes: this.maxBufferBytes, timeoutMs: this.rpcTimeoutMs + 5000 });
    return typeof output === "string" ? JSON.parse(output) : output;
  }
}

function uniqueCardIds(cardIds) {
  return [...new Set(cardIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))];
}

function positiveTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 120_000 ? parsed : fallback;
}

function positiveInteger(value, fallback, maximum = 32) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

function positiveBufferSize(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1024 * 1024 && parsed <= 256 * 1024 * 1024 ? parsed : fallback;
}

export function gatewayIdempotencyLabel(key) {
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 20);
  return `nightshift-action:${digest}`;
}

function approvalCard(action) {
  return {
    title: `${action.instanceId}｜${action.contentItemId ? `${action.contentItemId}｜` : ""}审批 ${action.stageId}`,
    status: "review",
    labels: [
      `instance:${action.instanceId}`,
      `stage:${action.stageId}`,
      ...(action.contentItemId ? [`content-item:${action.contentItemId}`] : []),
      "nightshift:approval",
    ],
    automation: { approval: action.approval, contentItemId: action.contentItemId ?? null, instanceId: action.instanceId, stageId: action.stageId },
  };
}

async function defaultRunner(command, args, env, { maxBufferBytes = 32 * 1024 * 1024, timeoutMs = 35_000 } = {}) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: "utf8",
      env,
      killSignal: "SIGKILL",
      maxBuffer: maxBufferBytes,
      timeout: timeoutMs,
    });
    return stdout;
  } catch (error) {
    const detail = String(error?.stderr ?? "").trim().slice(0, 2000);
    throw new Error(
      `OpenClaw Gateway RPC failed${error?.code ? ` (exit ${error.code})` : ""}${detail ? `: ${detail}` : ""}`,
    );
  }
}
