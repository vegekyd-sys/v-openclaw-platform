function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function isSessionRolloverAdmissionError(error) {
  const message = errorMessage(error);
  return (
    message.includes('Session "') &&
    message.includes('" changed while starting work. Retry.')
  );
}

function validSessionId(session) {
  return (
    typeof session?.sessionId === "string" &&
    session.sessionId.trim().length > 0
  );
}

export async function runWithSessionRolloverRetry(options) {
  const maxRetries = Number.isFinite(options.maxRetries)
    ? Math.max(0, Math.floor(options.maxRetries))
    : 1;
  let session = { ...options.initialSession };
  let retries = 0;

  let latestBeforeExecution;
  try {
    latestBeforeExecution = await options.readLatestSession();
  } catch (error) {
    options.onRebindError?.(error);
  }
  if (
    latestBeforeExecution?.exists === true &&
    validSessionId(latestBeforeExecution) &&
    latestBeforeExecution.sessionId !== session.sessionId
  ) {
    const previousSessionId = session.sessionId;
    session = {
      ...session,
      sessionId: latestBeforeExecution.sessionId,
      ...(typeof latestBeforeExecution.sessionFile === "string" &&
      latestBeforeExecution.sessionFile.trim().length > 0
        ? { sessionFile: latestBeforeExecution.sessionFile }
        : {}),
    };
    options.onRebind?.({
      previousSessionId,
      nextSessionId: session.sessionId,
    });
  }

  for (;;) {
    try {
      return {
        value: await options.execute(session, retries),
        retries,
        session,
      };
    } catch (error) {
      if (
        retries >= maxRetries ||
        !isSessionRolloverAdmissionError(error)
      ) {
        throw error;
      }

      const latest = await options.readLatestSession();
      if (
        latest?.exists !== true ||
        !validSessionId(latest) ||
        latest.sessionId === session.sessionId
      ) {
        throw error;
      }

      const previousSessionId = session.sessionId;
      session = {
        ...session,
        sessionId: latest.sessionId,
        ...(typeof latest.sessionFile === "string" &&
        latest.sessionFile.trim().length > 0
          ? { sessionFile: latest.sessionFile }
          : {}),
      };
      retries += 1;
      options.onRetry?.({
        attempt: retries,
        previousSessionId,
        nextSessionId: session.sessionId,
      });
    }
  }
}
