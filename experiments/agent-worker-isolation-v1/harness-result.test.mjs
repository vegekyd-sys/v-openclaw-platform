import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildHarnessAttemptResult } from "./harness-result.mjs";

async function withSession(messages, run) {
  const directory = await mkdtemp(join(tmpdir(), "vlab-harness-result-"));
  const sessionFile = join(directory, "session.jsonl");
  await writeFile(
    sessionFile,
    `${messages
      .map((message) => JSON.stringify({ type: "message", message }))
      .join("\n")}\n`,
  );
  try {
    return await run(sessionFile);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("preserves native sessions_yield as a completed paused attempt", async () => {
  const attempt = await buildHarnessAttemptResult({
    meta: {
      yielded: true,
      stopReason: "end_turn",
      livenessState: "paused",
      agentMeta: {
        provider: "fixture",
        model: "fixture",
        sessionId: "yield-session",
      },
    },
  });

  assert.equal(attempt.yieldDetected, true);
  assert.equal(attempt.aborted, false);
  assert.deepEqual(attempt.assistantTexts, []);
});

test("does not mark an ordinary empty result as a deliberate yield", async () => {
  const attempt = await buildHarnessAttemptResult({
    meta: {
      stopReason: "toolUse",
      livenessState: "active",
      agentMeta: {
        provider: "fixture",
        model: "fixture",
        sessionId: "ordinary-session",
      },
    },
  });

  assert.notEqual(attempt.yieldDetected, true);
});

test("preserves hosted client tool calls from agentCommand metadata", async () => {
  const attempt = await buildHarnessAttemptResult({
    meta: {
      pendingToolCalls: [
        {
          id: "call-1",
          name: "search_catalog",
          arguments: JSON.stringify({ query: "worker parity" }),
        },
      ],
      agentMeta: {
        provider: "fixture",
        model: "fixture",
        sessionId: "client-tool-session",
      },
    },
  });

  assert.deepEqual(attempt.clientToolCalls, [
    {
      name: "search_catalog",
      params: { query: "worker parity" },
    },
  ]);
});

test("preserves async task, cron and delivery evidence as terminal side effects", async () => {
  const attempt = await withSession(
    [
      { role: "user", content: "start background work" },
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tool-1",
            name: "exec",
            arguments: { command: "long-task" },
          },
        ],
        stopReason: "toolUse",
      },
      {
        role: "toolResult",
        toolCallId: "tool-1",
        toolName: "exec",
        content: [{ type: "text", text: "started" }],
        details: {
          async: true,
          status: "started",
          runId: "async-run-1",
          taskId: "async-task-1",
        },
        isError: false,
      },
    ],
    async (sessionFile) =>
      await buildHarnessAttemptResult({
        successfulCronAdds: 1,
        messagingToolSentTargets: [{ channel: "feishu", to: "oc_fixture" }],
        acceptedSessionSpawns: [{ runId: "child-run-1", status: "accepted" }],
        meta: {
          agentMeta: {
            provider: "fixture",
            model: "fixture",
            sessionId: "async-session",
            sessionFile,
          },
        },
      }),
  );

  assert.deepEqual(attempt.toolMetas, [
    {
      toolName: "exec",
      asyncStarted: true,
      asyncTaskRunId: "async-run-1",
      asyncTaskId: "async-task-1",
    },
  ]);
  assert.equal(attempt.successfulCronAdds, 1);
  assert.equal(attempt.replayMetadata.hadPotentialSideEffects, true);
  assert.equal(attempt.replayMetadata.replaySafe, false);
});

test("preserves media-only terminal payloads", async () => {
  const attempt = await buildHarnessAttemptResult({
    payloads: [
      {
        mediaUrls: ["https://example.test/result.png"],
        audioAsVoice: true,
        trustedLocalMedia: true,
      },
    ],
    meta: {
      agentMeta: {
        provider: "fixture",
        model: "fixture",
        sessionId: "media-session",
      },
    },
  });

  assert.deepEqual(attempt.toolMediaUrls, [
    "https://example.test/result.png",
  ]);
  assert.equal(attempt.toolAudioAsVoice, true);
  assert.equal(attempt.toolTrustedLocalMedia, true);
});

test("preserves a terminal tool error instead of classifying it as empty", async () => {
  const attempt = await withSession(
    [
      { role: "user", content: "run the requested tool" },
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tool-error-1",
            name: "exec",
            arguments: { command: "false" },
          },
        ],
        stopReason: "toolUse",
      },
      {
        role: "toolResult",
        toolCallId: "tool-error-1",
        toolName: "exec",
        content: [{ type: "text", text: "Command exited with code 1" }],
        isError: true,
      },
    ],
    async (sessionFile) =>
      await buildHarnessAttemptResult({
        meta: {
          agentMeta: {
            provider: "fixture",
            model: "fixture",
            sessionId: "tool-error-session",
            sessionFile,
          },
        },
      }),
  );

  assert.deepEqual(attempt.lastToolError, {
    toolName: "exec",
    error: "Command exited with code 1",
  });
});

test("does not retain an older tool error after later assistant output", async () => {
  const attempt = await withSession(
    [
      { role: "user", content: "recover after a tool error" },
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tool-error-1",
            name: "exec",
            arguments: { command: "false" },
          },
        ],
        stopReason: "toolUse",
      },
      {
        role: "toolResult",
        toolCallId: "tool-error-1",
        toolName: "exec",
        content: [{ type: "text", text: "Command exited with code 1" }],
        isError: true,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "I recovered." }],
        stopReason: "stop",
      },
    ],
    async (sessionFile) =>
      await buildHarnessAttemptResult({
        meta: {
          agentMeta: {
            provider: "fixture",
            model: "fixture",
            sessionId: "tool-error-recovered-session",
            sessionFile,
          },
        },
      }),
  );

  assert.equal(attempt.lastToolError, undefined);
});
