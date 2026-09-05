# WeCom and V Browser: diagnosis and acceptance gates

Historical diagnosis below, before the retry deployment. Updated WeCom production results are in [the 02:10 deployment report](wecom91-production-acceptance-20260906.md). Browser remains a separate task.
No production restart, plugin install, or configuration change occurred during the initial diagnosis described below.

## WeCom

- Production remains on `2026.8.17-vlab.1` after the preceding rollback.
- A one-shot process imported the immutable `2026.8.17-vlab.2` candidate with native tool configuration. It did not register a Gateway or connect a channel.
- Contact, document, disk, calendar, meeting and todo read requests all reached the official API and returned `850003`, expired robot capability authorization. This is distinct from company-wide visibility.
- The candidate crosses the old module-global runtime configuration failure, but does not yet prove Gateway/Worker integration or successful business requests.
- The robot creator must renew the existing required capabilities through the enterprise WeChat robot settings; do not broaden scopes automatically.

Acceptance after authorization: each real read-only business API must succeed (an empty result is acceptable only with API success), then the same tools must work from a real WeCom Worker session, preserving sender identity and returning a visible reply. Ordinary Feishu and WeCom conversations must also succeed after deployment.

### Authorization recheck after user renewal

User renewed V and VLab authorization. One-shot candidate on production V now successfully returns contact (1 match), disk (3 files), document (`errcode=0`), calendar, meeting and todo read results. Six requests took 430–930 ms. No `850003` or runtime-initialization error, Gateway PID unchanged. Successful CLI results put JSON text directly in `details`; the diagnostic parser must decode that string rather than assume `details.stdout`.

The currently configured VLab integration generation still has no WeCom bot ID/secret; remote authorization alone does not configure a Gateway account. Do not copy production credentials into it. This recheck proves V authorization and the isolated candidate's business calls, not installed production native/Worker acceptance.

## Restart outage evidence (Asia/Shanghai)

- Candidate restart: 2026-09-06 01:01:11.
- Codex agent database open took 63,721 ms, logged at 01:02:30.739; database size 5,202,866,176 bytes.
- Feishu WebSocket ready: 01:02:38.351. A real delayed message arrived at 01:02:40.529 and dispatched at 01:02:40.551.
- Gateway ready: 01:02:52.544.
- Rollback restart: 01:03:17. Database open then took 2,527 ms; Gateway ready 01:03:45.894.
- Configuration files were unchanged. This proves startup delay before channels, not that the candidate plugin caused the delay. Locking versus cold I/O or database validation remains unresolved.
- Prior recovery smoke had a real visible reply, not merely green health. Do not run database repair or destructive session resets to investigate this delay.

## V Browser

- Mac unlocked and the existing public H3 report tab renders in Chrome. Dedicated browser Gateway is OpenClaw 9.1, not 7.1.
- Native V Browser can list shared tabs, but snapshot timed out (`page.ariaSnapshot`, 5 s internal timeout; 18.346 s total) and screenshot timed out (20 s internal timeout; 27.204 s total).
- Transport showed pending `Page.captureScreenshot`, `Detached while handling command`, followed by temporarily unavailable Playwright target identities.
- Foreground/background comparison was not completed: the second lease acquisition timed out first. Do not infer that bringing the tab forward fixes the issue.
- Test lease expired and cleanup check found zero active routes and no pending commands. No unrelated lease was terminated.

Acceptance: use an existing user-shared tab through the real V Browser path, not a substitute headless browser. Require tab listing, readable snapshot, valid screenshot, visible screenshot delivery, repeat operation and lease release; test both Worker and Codex runtimes. Chrome UI availability, device online and lease acquisition alone do not pass. Preserve target/host access restrictions.
