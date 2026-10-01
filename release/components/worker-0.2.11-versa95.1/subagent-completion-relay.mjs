const DEFAULT_WAIT_TIMEOUT_MS = 86_400_000;
const MAX_TRACKED_RELAYS = 10_000;

function increment(stats, key) {
  stats[key] = Number(stats[key] ?? 0) + 1;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function acceptedSubagentRuns(spawns) {
  if (!Array.isArray(spawns)) {
    return [];
  }
  const seen = new Set();
  return spawns.filter((spawn) => {
    const runId = nonEmptyString(spawn?.runId);
    const childSessionKey = nonEmptyString(spawn?.childSessionKey);
    if (
      spawn?.status !== "accepted" ||
      spawn.vlabCompletionExpected === false ||
      !runId ||
      !childSessionKey ||
      seen.has(runId)
    ) {
      return false;
    }
    seen.add(runId);
    return true;
  });
}

function outcomeFromWait(wait) {
  if (wait?.status === "ok") {
    return { status: "ok" };
  }
  if (wait?.status === "timeout") {
    return { status: "timeout" };
  }
  return {
    status: "error",
    error:
      nonEmptyString(wait?.error) ??
      `subagent wait ended with ${String(wait?.status ?? "unknown")}`,
  };
}

export function startSubagentCompletionRelays(options) {
  const active = options.active ?? new Map();
  const stats = options.stats ?? {};
  for (const key of ["started", "completed", "failed", "delivered", "unconfirmed"]) {
    stats[key] = Number(stats[key] ?? 0);
  }
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1_000, Number(options.timeoutMs))
    : DEFAULT_WAIT_TIMEOUT_MS;
  const promises = [];
  // 9.6 closes the initiating turn's tool-caller authority when the parent
  // yields; the relay is process-owned work, so it must not inherit that turn
  // (waitForRun/getSessionMessages would fail "authority is no longer active").
  const detached = typeof options.withoutCaller === "function"
    ? options.withoutCaller
    : run => run();

  for (const spawn of acceptedSubagentRuns(options.spawns)) {
    const runId = spawn.runId.trim();
    if (active.has(runId)) {
      continue;
    }
    while (active.size >= MAX_TRACKED_RELAYS) {
      active.delete(active.keys().next().value);
    }
    increment(stats, "started");
    const relay = detached(() => (async () => {
      try {
        const wait = await options.waitForRun({ runId, timeoutMs });
        let delivered = false;
        const announceParams = {
          childSessionKey: spawn.childSessionKey.trim(),
          childRunId: runId,
          requesterSessionKey: options.requesterSessionKey,
          requesterOrigin: options.requesterOrigin,
          task: nonEmptyString(spawn.task) ?? nonEmptyString(spawn.taskName),
          label: nonEmptyString(spawn.label),
          timeoutMs: Math.min(timeoutMs, 120_000),
          cleanup: spawn.cleanup === "keep" ? "keep" : "delete",
          waitForCompletion: false,
          endedAt: Date.now(),
          outcome: outcomeFromWait(wait),
          spawnMode: spawn.mode === "session" ? "session" : "run",
          expectsCompletionMessage: spawn.mode !== "session",
          onDeliveryResult(result) {
            if (result?.delivered === true) {
              delivered = true;
            }
          },
        };
        const announced =
          typeof options.deliverHarnessTaskCompletion === "function"
            ? await options.deliverHarnessTaskCompletion({
                spawn,
                wait,
                outcome: announceParams.outcome,
              })
            : await options.runNativeAnnounce(announceParams);
        if (announced?.delivered === true) {
          delivered = true;
        }
        if (announced === true || delivered) {
          increment(stats, "delivered");
        } else {
          increment(stats, "unconfirmed");
          // Keep only delivery metadata, never child output or capability tokens.
          const diagnostic = {
            runId,
            path: typeof announced?.path === "string" ? announced.path : undefined,
            reason: typeof announced?.reason === "string" ? announced.reason : undefined,
            error: typeof announced?.error === "string" ? announced.error
              .replace(/https?:\/\/\S+/g, "[url]")
              .replace(/(?:Bearer\s+|(?:token|secret|apiKey|password)[=:]\s*)\S+/gi, "[credential]")
              .slice(0, 400) : undefined,
            terminal: announced?.terminal === true,
            disposition: typeof announced?.disposition === "string" ? announced.disposition : undefined,
            phases: Array.isArray(announced?.phases) ? announced.phases.map(p => ({
              phase: p.phase, delivered: p.delivered === true, path: p.path, reason: p.reason,
            })) : undefined,
          };
          stats.lastUnconfirmed = diagnostic;
          options.logger?.warn?.(`subagent completion delivery unconfirmed: ${JSON.stringify(diagnostic)}`);
        }
        increment(stats, "completed");
      } catch (error) {
        increment(stats, "failed");
        options.logger?.warn?.(
          `native subagent completion relay failed for ${runId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    })());
    active.set(runId, relay);
    promises.push(relay);
  }
  return promises;
}
