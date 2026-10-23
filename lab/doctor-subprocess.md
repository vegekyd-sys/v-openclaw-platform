# The built-in assistant's doctor, out of the Gateway

Status: candidate only (2026-10-24). Not merged, not on shared VLab, not on V. Nothing was run on V; V was only
read (journal, unit, dist hashes).

## The freeze

On 2026-10-22 V's Gateway froze twice, 21:37 (310 s) and 22:20 (158 s). Both times V had called the `openclaw`
tool in a group chat, and OpenClaw's built-in assistant (runs `openclaw-turn-*`) ran its `doctor` action.
`operations-CTofDiKh.js` handles it with

```js
case "doctor":
	await (opts.deps?.runDoctor ?? (await import("./doctor-C3VXV-em.js")).doctorCommand)(runtime, { nonInteractive: true });
```

so the whole of `openclaw doctor --non-interactive` ran on the Gateway's main thread. The journal shows the
doctor sections as the Gateway printed them:

| run | doctor start | "Backups" | next section ("Cron") | Backups → Cron | "Doctor complete." |
|---|---|---|---|---|---|
| 10-22 21:36 | 21:36:18 | 21:36:57 | 21:42:54 | 357 s | 21:43:30 |
| 10-22 22:19 | 22:19:18 | 22:19:57 | 22:23:11 | 194 s | 22:23:30 |

In between ran, without printing anything, `doctor:session-transcript-headers` (first
row of every transcript session) and `doctor:session-transcript-labels`
(`doctor-session-transcript-labels-DTxp6Q8J.js`): it lists every transcript session
(`SELECT DISTINCT session_id FROM transcript_events`) and, per session, reads all rows and `JSON.parse`s
each one, synchronously. On V that is ~15 GB of the 27.3 GB makaron database (2026-10-23 estimate). The rest of
doctor is synchronous too (config, plugin loading, state checks): in the candidate below it blocked the main
thread for most of its run even with only 0.5 GB of transcripts.

The report itself never reached the assistant: doctor's `note()` and clack `intro`/`outro` write to
`process.stdout` (V's journal), and the tool only returns what the operation logs to its capture runtime
(`createCaptureRuntime` in `system-agent-tool-a5BdkF7s.js`). In the candidate the capture held only the two
`[warning] core/doctor/node-hosting-preconditions` lines.

## What upstream did

- openclaw #157228 (2026-09-24, "keep Gateway responsive while Doctor runs"): the hosted doctor runs in a
  child process (`src/commands/doctor-process.ts`, `doctor.worker.ts`), output streamed line by line to the
  runtime with a 1 MiB cap.
- openclaw #171960 (2026-10-14, "setup diagnostics can repair state without approval"): that child now runs
  the read-only `doctor --lint` instead of `--non-interactive`, because non-interactive doctor still applies
  "safe" migrations without the user's approval.
- Later doctor work (#175808, #177933, #179089, 10-17…10-20) makes the transcript scans cheaper: a text
  prefilter before `JSON.parse` and a remembered clean-scan identity per store (`session-transcript-labels:v1`
  + build + target) so an unchanged store is not rescanned. Not backported here.

Doctor has no official way to skip a contribution of the full flow: `--skip <id>` / `--only <id>` only select
`doctor --lint` checks, and the two transcript contributions are not lint checks (no `healthChecks`). No
environment variable selects contributions either (V's 9.1 dist has no `OPENCLAW_DOCTOR_*` variable at all;
upstream main's `src/` has none either).

## Change

Plan `lab/doctor-subprocess.plan.json`, patcher `lab/patch-doctor-subprocess.mjs`, builder
`lab/build-doctor-subprocess.mjs`, test `lab/doctor-subprocess.test.mjs`. Two core dist files, V's bytes
unchanged since the 9.1 install (`eb6286b4…`, `a9b70992…`); the first commit of the release files is that copy.

- `operations-CTofDiKh.js`: the `doctor` case runs `openclaw doctor --non-interactive` in a child, as #157228
  did: the Gateway's `process.execPath`, its `execArgv` without `--inspect*`/`--debug*` (V's Gateway listens on
  127.0.0.1:9229) plus `--disable-warning=ExperimentalWarning`, this dist's `index.js`, the Gateway's
  environment and cwd, stdin closed, under `ionice -c3` (Linux, when found on PATH) and `nice -n 10`. stdout
  lines go to `runtime.log`, stderr lines to `runtime.error`, up to 1 MiB (then a truncation note). A non-zero
  exit goes to `runtime.exit(code)`, which in the tool throws "openclaw operation exited with code N" exactly as
  an in-process `runtime.exit` did; a signal is an error. The operation still returns `{ applied: false }`.
- `doctor-health-contributions-Dz7xROs_.js`: when `OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS=1` (set only for
  that child), the two transcript contributions are replaced, in place, by one note ("Session transcripts:
  Skipped the transcript header and label checks … Run `openclaw doctor` in a shell on this host to include
  them."). Their findings can only be acted on with `doctor --fix`, which the assistant does not run
  ("Doctor repairs … run with OpenClaw stopped"). Without the variable the list is V's.
- Switches: `OPENCLAW_V_DOCTOR_SUBPROCESS=0` (Gateway environment) restores the in-process doctor with both
  scans; `OPENCLAW_V_DOCTOR_TRANSCRIPT_SCANS=1` keeps the scans in the child. An injected `deps.runDoctor`
  (tests) still runs in process.
- Tianyi's decision stands: V keeps the `openclaw` tool and its doctor action.

What changes for the assistant: the tool result now carries doctor's report (34–60 KB, 350–430 lines on
VLab; V's journal shows a report of similar size) where it used to carry two warning lines; the journal no
longer gets the report.

## Results

VLab candidates on runtime `feishu-auto-phone-tab-v1` (`operations-CTofDiKh.js`,
`doctor-health-contributions-Dz7xROs_.js`, `doctor-C3VXV-em.js`, the labels module and `index.js` are V's
bytes; the harness asserts the hashes). `lab/candidate/doctor-subprocess-ab.mjs` stands in for the Gateway: it
calls `executeSystemAgentOperation({ kind: "doctor" }, captureRuntime, { approved: false, deps: { setupSurface:
"gateway" } })` as the tool does and measures its own main thread while the operation runs: a 20 ms heartbeat
(largest gap, time lost in gaps over 100 ms) and event-loop utilization (ELU). Arms, in order:
`base` = V's operations chunk (doctor in process), `patched` = release chunk (child, scans skipped),
`patched-full` = release chunk with `OPENCLAW_V_DOCTOR_TRANSCRIPT_SCANS=1` (child, scans kept),
`scans` = the two transcript contributions alone in a child, timed (what the skip saves),
`lint` = `openclaw doctor --lint` in a child, for comparison.

### Main run: V's transcript row count

Data: a SQLite backup of shared VLab's makaron database plus 10 synthetic copies of every transcript session
(`transcript_events` rows only, new session ids): 42,856 sessions, 1,571,196 rows (V: ~1.57 M), 5.1 GB of event
JSON (V: ~15 GB), 13.3 GB database. Codex and the other managed npm plugins copied from shared VLab. Candidate
`candidate-7d367360` below = `lab/doctor-subprocess-results-20261024.json` → `round4_inflated_5.1GB_transcripts`
(commit `c5d5ffee`).

| arm | wall | main-thread ELU | longest heartbeat gap | gaps > 1 s | time lost in gaps > 100 ms | doctor process |
|---|---|---|---|---|---|---|
| base (V today, in process) | 331.4 s | 0.992 | **264.3 s** | 11 | 326.3 s | the "Gateway" itself |
| patched (child, scans skipped) | 60.5 s | 0.032 | **0.22 s** | 0 | 0.22 s | nice 10, ionice idle, ≤ 63 % CPU, 189 MB RSS |
| patched-full (child, scans kept) | 320.8 s | 0.016 | 0.05 s | 0 | 0 | nice 10, ionice idle, ≤ 93 % CPU, 177 MB RSS |
| scans alone (child) | 203.6 s | 0.018 | 0.08 s | 0 | 0 | headers 3.8 s, **labels 194.3 s** (targets makaron, main) |
| lint (child, upstream's hosted doctor) | 36.8 s | 0.023 | 0.10 s | 0 | 0.10 s | 33 checks, exit 1 (findings), no state file changed |

So on this data the in-process doctor holds the main thread for 5.5 minutes, 4.4 of them in one stretch, which
is what V's journal shows (357 s and 194 s between "Backups" and "Cron"). In a child the main thread stays free
(ELU 0.02–0.03) whether or not the scans run; skipping them saves the child ~4.3 minutes of CPU and I/O on
5 GB (labels alone: 194 s, ~26 MB/s), on V's 15 GB proportionally more.

### Other runs

- Round 1 (`round1_…`, commit `147e13ec`): shared VLab's makaron copy as is (0.5 GB of transcripts), but placed
  without a `sessions/` directory, so the two scans never reached makaron (see the harness comment). Doctor's
  other work alone: base 80.8 s wall, longest gap 26.9 s, 75.7 s lost (ELU 0.965); patched 35.4 s, longest gap
  0.14 s, 0.28 s lost (ELU 0.053). The non-scan part of doctor is a freeze of its own.
- Rounds 2–3 also missed the scans (the copy was a symlink, which store discovery rejects) and measured the
  harness's own synchronous `ps` sampling and state-directory walk as ~2 s gaps; both were fixed for round 4.
- Order check (`order_check_patched_first`, 0.5 GB, scans reached): patched first 67.4 s, longest gap 0.06 s;
  base 74.9 s, longest gap 31.5 s, 69.8 s lost; patched-full 65.4 s, longest gap 0.24 s.

Report equivalence (main run, 433 lines / 60 KB per report; `base-vs-patched.diff`). The only differences:

1. the "Session transcript headers" section ("Found 7 canonical session transcripts without a header") is
   replaced by the skip note; "Session transcript labels" printed nothing in either;
2. the two `[warning] core/doctor/node-hosting-preconditions` lines move from the end to where doctor printed
   them (in process they went to the capture runtime, everything else to stdout);
3. "Host desktop": "attached (127.0.0.1:5900, security: VncAuth)" in the first arm of a run, "unavailable:
   unsupported security…" in the later ones. Shared VLab's VNC server refuses the next connection shortly after
   one; the order check (patched first: attached; base second: unavailable) shows it follows the order, not the
   patch;
4. round 1 only: node:sqlite's ExperimentalWarning on the child's stderr, now suppressed with
   `--disable-warning=ExperimentalWarning` (V's Gateway does not set `NODE_NO_WARNINGS`).

`base-vs-patched-full.diff` has only 2 and 3: with the scans kept the child prints the same report as the
in-process doctor.

State writes: non-interactive doctor writes in both arms (`agents/main` agent database, `state/openclaw.sqlite`;
in process also the workboard plugin database and 128 `plugin-skills/` files, which the Gateway has already
written at startup). `doctor --lint` changed no state file. The child does it as a second process, the same way an
operator's `openclaw doctor` on V does. Upstream's #171960 is the way to stop these writes (see below).

## Not covered

- Not run on V, and not on the shared VLab Gateway: the stand-in is a plain Node process calling the operation,
  not a Gateway serving traffic. The Gateway's own `process.env` at run time (e.g. PATH bootstrapping) is
  inherited by the child exactly as the in-process doctor saw it, but was not exercised here.
- V's transcripts are ~15 GB; the main run had 5.1 GB (V's row count, synthetic copies of real sessions). The
  skipped scans scale with that volume; the child's other work does not.
- `ionice -c3` has no effect on V: its disks use the `none` scheduler, which ignores I/O priorities. `nice 10`
  applies; V has 16 cores and 61 GB (21 GB page cache on 10-24, for a 27 GB makaron database).
- What the child costs V while it runs (CPU, disk, page cache next to the Gateway) was not measured; only the
  main thread was. The child lives in the Gateway's cgroup, so a Gateway stop or restart ends it too.
- Concurrency of the child's state writes with the Gateway's writers (agent database process lease) was not
  measured; the writes are small and the same an operator's `openclaw doctor` makes.
- Upstream's later step (#171960: hosted doctor = `doctor --lint`, read-only, no transcript scans by
  construction) is not taken here; it changes the report the assistant gets. It needs Tianyi's decision.
