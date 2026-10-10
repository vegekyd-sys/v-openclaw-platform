# Voice avatar reaction and natural farewell H5 release

This release copies the user-reviewed Candidate H5 bytes from e19dbd769564af5dcf2d449c7252c38a5e5b7c2f into a narrow branch from current dev. It does not deploy any OpenClaw core or Worker patch. The existing three voice models and direct-tool/backend task paths remain.

36 reviewed square poses have semantic/emotion labels and event-driven reaction selection from actual user/assistant dialogue beats. A selected plan contains reviewed continuation poses; one picture does not remain longer than five seconds during a call. 256/512 WebP assets are used for mobile/desktop. Avatar Decisions run independently of voice and control execution. The existing Gateway OpenRouter credential is read only into the private phone-service environment.

Xiaohe/Grok natural phone farewells must call native end_call immediately, then say a short farewell. Actual farewell audio drains before closure. Topic changes, quoted farewells and task cancellation remain distinct.

Candidate evidence: 12 actual dialogue samples across GPT Live, Xiaohe and Grok with full caption/image timelines; 3 additional natural farewell calls across Xiaohe/Grok ended through native end_call and original H5 playback drain. Both tested providers continued a negative topic-change input. 31 local direct-tool regressions passed. Synthetic content was limited to USER audio. Physical Safari/AEC and strict immediate final interruption remain unaccepted; this release does not rewrite those gates.

Production cutover uses the existing authenticated /voice entry controller, exact runtime baseline proof, before snapshot, idle/openVoices and relay connection guards. Only openclaw-rtc-h5.service is replaced. Gateway PID/start/Invocation/config and channel services must remain unchanged. Original pointer, launch definition and private environment are retained for rollback. Shared runtime align and H5 byte parity are recorded separately.
