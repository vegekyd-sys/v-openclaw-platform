let input = "";
for await (const chunk of process.stdin) {
  input += chunk.toString("utf8");
}
const request = JSON.parse(input);
if (request?.args?.mode === "hang") {
  await new Promise(() => setInterval(() => {}, 10_000));
}
if (request?.args?.mode === "error") {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      error: { code: "FAKE_TOOL_ERROR", message: "fake tool failed" },
    })}\n`,
    () => process.exit(1),
  );
} else {
  process.stdout.write(
    `${JSON.stringify({ ok: true, result: { echoed: request.args } })}\n`,
    () => process.exit(0),
  );
}
