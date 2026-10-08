# Candidate square avatars and final interruption

The user-approved checkpoint is `5ec7ff8a`; the square avatar implementation is `8dc66012`. There is no dev, shared VLab, or production promotion. The original reusable Candidate and trial URLs stay unchanged.

36 new square poses replace portrait compositions, in 256 and 512 pixel WebP versions; 72 files total 860,072 bytes. Thinking states dwell 12 seconds per pose, run one sequence and hold the last pose. Cosmetic decisions and duplicate task events do not restart this dwell. The asset manifest records hashes.

The first real native probe expired before synthetic USER audio was sent and is not an interruption sample. The corrected probe uses continuous synthetic USER PCM and the original H5, native WebRTC, live backend Memory work, original assistant audio and native events. It reached a complete backend result while speaking; the caller then asked to stop and answer a new question. The old result stopped, the new question was answered and the old result did not restart. However, original output PCM remained active until about 3.916 seconds after USER onset. This remains PARTIAL / not accepted as immediate interruption. Native recognition of the first input token arrived at about 1.958 seconds; recognition alone is not playback interruption proof. Original media and both probe records are preserved privately.

The next prompt revision removes the remaining requirement to finish the spoken answer in `Final source policy`, makes stopping at user speech take precedence, and explicitly avoids finishing a sentence or talking over the caller with an acknowledgement. It requires a new actual probe; it is not yet a proven transport cancellation fix.

Xiaohe and Grok already have backend-speech onset detection, client queue clearing, upstream cancellation and retired-response isolation. Their local tests pass; their corresponding physical final-interruption paths are not claimed accepted. GPT Live keeps the native audio path; local muting or an unsupported Realtime cancel message is not a substitute for confirmed native cancellation.

The third probe reached a real complete Memory result, but spoken output was only a screen redirect and ended before manual USER interruption. No barge input was sent; this sample is INCONCLUSIVE, not a pass. The final policy is now shortened to remove the conflicting demand to deliver every fact, explicitly retain a substantive summary, and give caller speech precedence. This remains a candidate experiment pending a real interruption sample.
