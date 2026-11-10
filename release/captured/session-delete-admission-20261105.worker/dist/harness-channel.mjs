// Match OpenClaw's native channel selection. messageProvider names the channel
// (e.g. feishu), not the model provider. Never infer identity from session text.
export function resolveHarnessMessageChannel(params = {}) {
  return params.messageChannel ?? params.messageProvider;
}
