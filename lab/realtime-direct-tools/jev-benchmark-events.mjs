// Both event envelopes are emitted by the actual Gateway. Match the original
// personal session and the measurement boundary before accepting a tool start.
export function measuredGatewayEvents(rows, {sessionKey, since}) {
  return rows.filter(row => row.at >= since &&
    ['agent', 'session.tool'].includes(row.event) &&
    row.payload?.sessionKey === sessionKey);
}
export function firstMeasuredToolStart(rows, name) {
  return rows.find(row => row.payload?.stream === 'tool' &&
    row.payload?.data?.name === name && row.payload?.data?.phase === 'start');
}
