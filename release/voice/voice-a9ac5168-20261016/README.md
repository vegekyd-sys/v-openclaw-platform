# Voice production version registration

This record covers the standalone Voice plugin and rtc-h5 entry, which the platform drift sentinel does **not** cover. A green core sentinel alone does not validate Voice.

To audit a release, read the active Gateway configuration plugin path and the rtc-h5 process command line, require both to match `manifest.json`, then hash every relative path in `artifact-manifest.json` under `entryDirectory`. Both release roots must carry the exact source commit and all 177 file hashes. Check the served `/voice/app.js` hash independently too. Do not infer the running version from the `current` symlink alone.

The product artifact excludes credentials, native provider environment, dedicated Lark profile, logs and user data. Those must never be copied into this directory or Git. The entry launcher is recorded separately without its environment contents.

Activation and acceptance are separate fields. The acceptance summary explicitly identifies synthetic speech versus human listening and the scenarios actually exercised.
