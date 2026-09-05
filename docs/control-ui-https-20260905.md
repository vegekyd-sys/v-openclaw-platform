# Control UI HTTPS candidate (2026-09-05)

Status: independent VLab candidate deployed by the coordinator; initial production
HTTPS acceptance passed. Longer real-business observation remains separate.

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

## Production acceptance (2026-09-05 Asia/Shanghai)

The coordinator deployed the candidate on loopback port 22794 and restarted the
main Gateway. This specialist performed read-only config/log checks plus the
explicitly authorized browser pairing and limited test message; no production
config or service writes were performed by this specialist.

- Nginx matches the reviewed template; existing Cloudflare unrelated ingresses
  and the email-template / v-browser paths remain intact.
- Native token auth and device pairing remain enabled. Trusted proxy is exactly
  127.0.0.1/32; the proxy listens only on loopback. Gateway's pre-existing LAN bind
  remains unchanged.
- 14:45:56 Gateway ready, PID 818462, NRestarts 0. Cold SQLite loading caused a
  lengthy startup, tracked by the coordinator independently of HTTPS routing.
- Public page HTTP 200, first byte 2.079 seconds / total 2.111 seconds in one Mac
  curl sample. Public unauthenticated POST /tools/invoke returned HTTP 401.
- Native one-time owner bootstrap redeemed in Chrome on the HTTPS origin. No
  gateway token was printed or embedded in versioned assets.
- 14:48:03 HTTPS WebSocket connected. The real main DM (207.4k/258.4k context)
  loaded visible historical messages and an enabled composer; verified by the
  next browser observation within 7.4 seconds, not a precise render benchmark.
- 14:48:55 chat.send accepted (247 ms Gateway time). At 14:49:13 the UI visibly
  showed the printf tool and V_HTTPS_REPLY_OK. Context display subsequently became
  45.5k; compaction quality is outside this transport acceptance.
- Switched to the real V Backup group (91.3k/500k), history and input available.
  One CUA mouse-dispatch call timed out at 2234 ms but the click had taken effect;
  the next AX check confirmed successful navigation. No duplicate click was sent.
- 14:50:55 deliberate browser reload ended the connection; 14:50:55.873 connected
  again, and message subscription succeeded at 14:50:56.370 (177 ms). No new
  credential entry or device approval was required. Original HTTPS connection
  lasted about 2m51s until this deliberate reload, beyond the earlier ~50s pattern.
- In this initial acceptance window, neither browser state nor inspected Gateway
  logs showed the original CLIENT_TIMEOUT / subscription recovery failure.
- Around 14:53, the original private UI tab was navigated to the public main DM.
  The task-created temporary Mac tunnel process was terminated, port 22793 no
  longer had a local listener, and the public main DM still showed the test reply
  and usable composer. The original LaunchAgent plist remains intact but was left
  unloaded; it can be restored explicitly if private fallback is needed.

Conclusion: public authenticated Control UI is initially usable with real V
history, a tool-backed reply, session switching, and remembered-browser reload.
This is not a long-duration SLA or a claim that large-page rendering is fully
optimized. Do not infer unrelated Feishu/Worker/Browser acceptance from this report.

## Exact production rollback (coordinator only; not executed)

Reviewed implementation:
`/Users/tianyicai/v-openclaw-platform-browser91/scripts/deploy-control-ui-https.mjs`.
Installed production script: `/tmp/deploy-control-ui-https.mjs`.
Private backup: `/home/openclaw/.openclaw/backups/control-ui-https-20260905`:

- `openclaw.json.before` (sensitive; diagnostic backup, do not overwrite whole config)
- `v-dashboard.yml.before`
- `proxy-fields.before.json` (original trustedProxies and allowedOrigins)

After coordinator approval and checking that no later changes to these proxy
fields would be lost, run through Tailscale management SSH only:

```sh
ssh -o ProxyCommand='/usr/local/bin/tailscale nc 100.82.39.107 22' \
  -o HostKeyAlias=100.82.39.107 -o IdentitiesOnly=yes -o BatchMode=yes \
  -i /Users/tianyicai/.ssh/v-zkda-20260719 ubuntu@100.82.39.107 \
  'sudo /opt/node-v22.23.1/bin/node /tmp/deploy-control-ui-https.mjs rollback'
```

The script asserts the production hostname and root identity. It restores only
the saved proxy fields in the current Gateway config, changes the exact default
Cloudflare origin from 22794 back to 22793, moves this Nginx stanza into the backup
directory as `nginx.disabled-<timestamp>`, validates/reloads Nginx, and restarts
only `cloudflared-v-dashboard.service`. **It does not restart the main Gateway**;
the coordinator must arrange that separately for the reverted config to apply.
Then verify Gateway readiness, Feishu/WeCom/Workers and authenticated access.

This rollback restores the pre-change routing state, which previously returned
proxy-attribution 403 on the public UI; it is not a claim that the prior public
route becomes usable. Retain an authenticated private fallback as needed.
The independent Astra backup is
`/home/openclaw/.openclaw/backups/astra-ui-20260905`; do not restore entire config
snapshots across these changes or remove unrelated Astra/model changes.

## QA teardown

At the coordinator's request after production acceptance, both task-owned units
`vlab-control-ui-qa-20260905.service` and
`vlab-control-ui-proxy-qa-20260905.service` were stopped. Verified inactive,
MainPID=0 and no listeners on 25993–25995. The Mac QA forwarding SSH process was
also stopped. The isolated fixture files are retained for reproducibility; no
shared lab Gateway, Browser/Astra instance, or production service was stopped.
