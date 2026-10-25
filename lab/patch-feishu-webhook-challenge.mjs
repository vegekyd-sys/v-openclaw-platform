// Feishu URL registration sends an encrypted challenge without event signature
// headers. Authenticate only this handshake with encryption + verification token;
// never admit unsigned ordinary events to the dispatcher.
export function authenticatedWebhookChallenge(payload, {decrypt, verificationToken, safeEqual}) {
  if (!payload || typeof payload.encrypt !== 'string' || !verificationToken) return null;
  try {
    const value = JSON.parse(decrypt(payload.encrypt));
    if (value?.type !== 'url_verification' || typeof value.challenge !== 'string' ||
        !value.challenge.length || value.challenge.length > 4096 ||
        typeof value.token !== 'string' || !safeEqual(value.token, verificationToken)) return null;
    return {challenge:value.challenge};
  } catch { return null; }
}

export function patchWebhookChallenge(source) {
  const marker = '// v-feishu-authenticated-url-challenge-v1';
  if (source.includes(marker)) return source;
  const anchor = '\t\t\t\t\trespondText(res, 401, "Invalid signature");';
  if (source.split(anchor).length !== 2) throw Error('webhook signature anchor drift');
  return marker+'\n'+authenticatedWebhookChallenge.toString()+'\n'+source.replace(anchor,
    `\t\t\t\t\tconst handshake = authenticatedWebhookChallenge(parseFeishuWebhookPayload(rawBody), {
\t\t\t\t\t\tdecrypt: value => new Lark.AESCipher(encryptKey).decrypt(value),
\t\t\t\t\t\tverificationToken: account.verificationToken?.trim(), safeEqual: safeEqualSecret
\t\t\t\t\t});
\t\t\t\t\tif (handshake) {
\t\t\t\t\t\tres.statusCode = 200;
\t\t\t\t\t\tres.setHeader("Content-Type", "application/json; charset=utf-8");
\t\t\t\t\t\tres.end(JSON.stringify(handshake));
\t\t\t\t\t\treturn;
\t\t\t\t\t}
`+anchor);
}
