// A Worker runs a nested agentCommand to execute one Harness attempt. Its
// process-local terminal event is NOT the Gateway's terminal publication.
// Forwarding end/error to onAgentEvent makes core's lifecycle backstop believe
// that publication already happened. Defer it so the native Gateway owner can
// finalize delivery, cancellation and session state using its own generation.
export function deferWorkerTerminalEvent(event) {
  if (event?.stream !== 'lifecycle' || !['end', 'error'].includes(event.data?.phase)) return event;
  const {executionSettled, terminalDelivery, terminalReceipt, ...data} = event.data;
  return {...event, data: {...data, phase: 'finishing'}};
}

export function gatewayOwnedEventArgs(name, args) {
  return name === 'onAgentEvent' ? args.map(deferWorkerTerminalEvent) : args;
}
