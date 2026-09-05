# Control UI HTTPS candidate (2026-09-05)

Status: independent VLab candidate; production deployment is owned by the coordinator.

## Incident evidence

- V uses OpenClaw 2026.9.1. The browser repeatedly times out on
  `sessions.messages.unsubscribe` after 30 seconds.
- Native unsubscribe is a short synchronous subscription removal, not an LLM run.
- Observed history responses were 2,607,606 bytes / 157 ms server-side and
  951,769 bytes / 217 ms. Initial subscriptions and other startup RPCs also send
  hundreds of KB. These are frame metadata only; no transcripts are in this repo.
- The shared private SSH transport stalled multiple HTTP requests; the remote
  server could return locally in milliseconds. A replacement Tailscale IPv6
  transport loaded the main DM, but does not establish a permanent fix.
- Existing public `https://openclaw.tianyi.live/n6tfdf/` returns HTTP 403
  `proxy_attribution_required`. The Cloudflare tunnel points straight at Gateway,
  whose trustedProxies configuration was absent at inspection.

Inference: the 30-second unsubscribe deadline is a recovery symptom compatible
with transport congestion, not proof of a broken unsubscribe handler. The public
proxy-attribution failure is separately reproduced and deterministic.

## Minimal production change

Keep existing Cloudflare Tunnel, domain, native token authentication, and device
pairing. Add one loopback-only Nginx hop using
`config/control-ui-cloudflare-origin.conf.template`:

`Cloudflare HTTPS -> cloudflared -> dedicated Nginx loopback port -> Gateway 22793`

The proxy overwrites X-Forwarded-For with Cloudflare's CF-Connecting-IP, clears
Forwarded, fixes Host/proto, and preserves WebSocket upgrade. Missing, malformed,
or loopback attribution must not become trusted local traffic. Gateway trusts
only `127.0.0.1/32` for this path. **Do not switch gateway.auth.mode to
trusted-proxy, disable device auth, or allow arbitrary origins.**

The coordinator must choose an unused production proxy port after checking
listeners. Change only the `openclaw.tianyi.live` default origin in
`/etc/cloudflared/v-dashboard.yml`; preserve `/email-template` and `/v-browser`
routes, tunnel credentials, and all other ingresses. Preserve existing config
fields; add the narrow trusted proxy without replacing other valid entries.
The Gateway was observed bound to LAN, not loopback: retain existing firewall
protection and do not open 22793 or the proxy port publicly. Network hardening
outside this scoped route requires a separate impact check.

No token is embedded in the proxy or committed. HTTPS exposes the authenticated
app, not an unauthenticated Gateway/CDP. Cloudflare Access can be an additional
later login layer, but is not claimed to be configured by this candidate.

## Browser authorization

Use the official `openclaw dashboard --json --no-open` owner bootstrap with the
correct instance HOME/STATE/CONFIG, and open the short-lived single-use link only
on that instance's intended origin. Do not print credentials in reports. Native
device identity and approval remain mandatory. The same browser profile and
origin can retain its admin device credential; a new origin/profile, cleared
storage, or revoked device requires authorization again. This is browser-bound,
not blanket trust for every application on the Mac.

## Independent VLab fixture

- Root: `/srv/vlab-control-ui-qa-20260905`.
- Separate HOME, STATE, CODEX_HOME, workspace, config, and full runtime copy.
- Gateway unit: `vlab-control-ui-qa-20260905.service`, CPUQuota 100%,
  MemoryHigh 1536M, MemoryMax 2G, Restart=always / RestartSec=3.
- Standalone proxy unit: `vlab-control-ui-proxy-qa-20260905.service`, 128M / 20%.
- Ports: 25993 Gateway, 25994 strict proxy, 25995 **lab-only edge simulator**.
  Never ship the edge simulator to production; it supplies a synthetic CF IP.
- Channel-free native QA agent, cron disabled, only the existing lab DeepSeek
  provider copied privately. Remove the source provider's agentRuntime override
  so it cannot accidentally require the main lab's Worker plugin.
- `control-ui-lab-profile.mjs` refuses an existing config. Files containing
  credentials remain on the lab, mode 0600, owned by the lab service account.

## Verified security tests

`control-ui-security-probe.mjs <qa-root>`: 10/10 passed. Protocol 4 signed Ed25519
test identities exercise the actual native connection guard.

| Case | Result |
| --- | --- |
| Missing CF client IP | 403 |
| Malformed CF client IP | 403 |
| CF loopback spoof | 403 |
| Valid attribution, app shell | 200 |
| Malicious XFF/Forwarded, valid CF IP | overwritten; app shell 200 |
| Tools invocation without auth | 401 |
| Signed device, missing token | AUTH_TOKEN_MISSING |
| Signed device, wrong token | AUTH_TOKEN_MISMATCH |
| Correct token, unapproved signed device | PAIRING_REQUIRED |
| Foreign browser Origin | CONTROL_UI_ORIGIN_NOT_ALLOWED |

HTTP probes use node:http rather than fetch because fetch did not preserve the
explicit Host test header in this runtime. Early protocol-3 failures were test
fixture errors and are not counted as successful security verification.

Real Chrome acceptance (Asia/Shanghai):
- 14:20:59 native owner-bootstrap login established the WebSocket.
- 14:25:14 visible `CONTROL_UI_REPLY_OK`, with actual `printf CONTROL_UI_TOOL_OK`
  execution; UI reported 7 seconds. An earlier attempt correctly failed because
  the source provider still selected an absent Worker runtime; the private QA
  provider override was removed and the test repeated successfully.
- 14:26:23 second session returned `CONTROL_UI_SECOND_OK` (UI: 4 seconds).
- Switching back to the first session restored its visible history.
- 14:27:18 browser reload disconnected with code 1001; native device credentials
  reconnected at 14:27:19 without entering another secret or approving again.
- 14:27:33 deliberately restarting only the isolated Nginx proxy caused code 1006;
  the browser automatically reconnected at 14:27:35. Gateway PID stayed 1562135,
  NRestarts stayed 0. The first connection had lasted over 6 minutes without the
  earlier 50-second disconnect pattern.
- 14:27:58 post-reconnect message visibly returned `CONTROL_UI_RECONNECT_OK`
  (UI: 2 seconds), confirming the connection could deliver a new response.

This verifies the proxy mechanics and native browser authorization on a small,
isolated fixture. It does not prove public Cloudflare end-to-end latency or V's
large-history performance. Production promotion retains those explicit gates.

## Deployment and rollback gates

1. Coordinator backs up exact main config, Cloudflare ingress config, relevant
   Nginx file and service metadata privately on production.
2. Render the reviewed strict proxy on an unused loopback port; nginx -t.
3. Apply narrow Gateway proxy trust and the existing HTTPS origin if absent;
   validate with the same 9.1 runtime. Schedule any required Gateway restart with
   the coordinator rather than silently interrupting active sessions.
4. Change only the intended Cloudflare ingress destination; reload/restart that
   tunnel service as required, keeping the private fallback available.
5. Real public-browser owner login; visible history, tool/reply, session switch,
   reload/reconnect; no 30s subscription failures over a representative window.
   Verify unauthenticated access is blocked and Feishu/Workers remain healthy.
6. If checks fail, restore the exact backed-up ingress/config and remove only the
   newly installed proxy stanza/service. Validate and perform the necessary
   coordinated reload/restart. Keep the original authenticated private route.

Official references:
- https://docs.openclaw.ai/web/control-ui
- https://docs.openclaw.ai/gateway/cloudflare-access
- https://docs.openclaw.ai/gateway/stable-https-url
