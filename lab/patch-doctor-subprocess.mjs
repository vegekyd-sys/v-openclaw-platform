import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// The built-in assistant's doctor runs in its own process, without the two transcript-wide scans.
//
// OpenClaw's built-in assistant (the `openclaw` tool, runs `openclaw-turn-*`) handled its `doctor` action
// with `await doctorCommand(runtime, { nonInteractive: true })` inside the Gateway. Doctor is a CLI
// command: most of it is synchronous file and SQLite work, and two of its health contributions read
// every transcript. doctor:session-transcript-labels lists every transcript session and JSON.parses
// every transcript_events row (V, 2026-10-23: about 15 GB of the 27.3 GB makaron database);
// doctor:session-transcript-headers reads the first row of every session. On 2026-10-22 two such runs
// froze V's Gateway for 310 s (21:37) and 158 s (22:20); the journal shows "Backups" at 21:36:57 and the
// next section ("Cron") at 21:42:54. Its report also went to the Gateway's stdout (the journal), not to
// the tool result: note() writes to process.stdout and the tool only captures runtime.log/error.
//
// operations-CTofDiKh.js: the doctor action now runs `openclaw doctor --non-interactive` in a child
// process: the Gateway's node (its execArgv without --inspect), this dist's index.js, the Gateway's
// environment and cwd, under `ionice -c3` (Linux, when present) and `nice -n 10`. Its stdout and stderr
// go line by line to the operation's runtime.log / runtime.error, up to 1 MiB; a non-zero exit is
// passed to runtime.exit as the in-process doctor would. Upstream made the same move (openclaw #157228,
// 2026-09-24, doctor-process.ts) and later ran `doctor --lint` in that child instead (#171960, 10-14).
//
// doctor-health-contributions-Dz7xROs_.js: with OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS=1, which only
// that child gets, the two transcript contributions are replaced by one note. Their findings can only
// be acted on with `doctor --fix`, which the assistant does not run ("run with OpenClaw stopped"). Doctor
// has no official way to skip a contribution: --skip/--only only select `doctor --lint` checks, and these
// two are not lint checks.
//
// OPENCLAW_V_DOCTOR_SUBPROCESS=0 restores the in-process doctor (with both scans);
// OPENCLAW_V_DOCTOR_TRANSCRIPT_SCANS=1 keeps both scans in the child.

export const MARKER = 'doctor-subprocess';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const OPERATIONS = 'operations-CTofDiKh.js';
export const CONTRIBUTIONS = 'doctor-health-contributions-Dz7xROs_.js';
export const BEFORE = {
  [OPERATIONS]: 'eb6286b448bce628be922e8dba7c969d3ea1f84644e3cf14ea5e1daa994cacb6',
  [CONTRIBUTIONS]: 'a9b70992118e040866d5144e98b7d293b460d57a56918c4bfa23fd29ad50b10e',
};

const RUNNER_ANCHOR = '//#region src/system-agent/operations-execute.ts\n';
const RUNNER = `//#region ${MARKER}
const DOCTOR_SUBPROCESS_OUTPUT_MAX_BYTES = 1024 * 1024;
function findExecutableOnPath(name) {
	for (const dir of (process.env.PATH ?? "").split(":")) {
		if (!dir) continue;
		const candidate = \`\${dir}/\${name}\`;
		try {
			fs.accessSync(candidate, fs.constants.X_OK);
			return candidate;
		} catch {}
	}
}
/** Runs \`openclaw doctor --non-interactive\` from this dist in a child process, output to the runtime. */
async function runDoctorSubprocess(runtime) {
	const [{ spawn }, { StringDecoder }, { fileURLToPath }] = await Promise.all([
		import("node:child_process"),
		import("node:string_decoder"),
		import("node:url")
	]);
	const argv = [
		process.execPath,
		...process.execArgv.filter((arg) => !/^--(inspect|debug)/.test(arg)),
		fileURLToPath(new URL("./index.js", import.meta.url)),
		"doctor",
		"--non-interactive"
	];
	const nice = findExecutableOnPath("nice");
	if (nice) argv.unshift(nice, "-n", "10");
	const ionice = process.platform === "linux" ? findExecutableOnPath("ionice") : void 0;
	if (ionice) argv.unshift(ionice, "-c3");
	const env = { ...process.env };
	if (env.OPENCLAW_V_DOCTOR_TRANSCRIPT_SCANS === "1") delete env.OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS;
	else env.OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS = "1";
	const child = spawn(argv[0], argv.slice(1), {
		cwd: process.cwd(),
		env,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	});
	let remaining = DOCTOR_SUBPROCESS_OUTPUT_MAX_BYTES;
	let truncated = false;
	const forward = (stream, write) => {
		const decoder = new StringDecoder("utf8");
		let pending = "";
		const push = (text) => {
			pending += text;
			let newline;
			while ((newline = pending.indexOf("\\n")) >= 0) {
				write(pending.slice(0, newline));
				pending = pending.slice(newline + 1);
			}
		};
		stream.on("data", (chunk) => {
			const accepted = chunk.subarray(0, Math.max(remaining, 0));
			remaining -= accepted.byteLength;
			truncated ||= accepted.byteLength < chunk.byteLength;
			push(decoder.write(accepted));
		});
		return () => {
			if (!truncated) push(decoder.end());
			if (pending) write(pending);
		};
	};
	const endStdout = forward(child.stdout, (line) => runtime.log(line));
	const endStderr = forward(child.stderr, (line) => runtime.error(line));
	const result = await new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code, signal) => resolve({
			code,
			signal
		}));
	});
	endStdout();
	endStderr();
	if (truncated) runtime.error("Doctor output was truncated after 1 MiB. Run \`openclaw doctor --non-interactive\` on this host for the complete report.");
	if (result.signal) throw new Error(\`Doctor process stopped unexpectedly (\${result.signal}).\`);
	if (result.code !== 0) runtime.exit(result.code ?? 1);
}
//#endregion
`;
const IMPORT_BEFORE = 'import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";\n';
const IMPORT_AFTER = `${IMPORT_BEFORE}import fs from "node:fs";\n`;
const DOCTOR_BEFORE = `\t\tcase "doctor":
\t\t\tawait (opts.deps?.runDoctor ?? (await import("./doctor-C3VXV-em.js")).doctorCommand)(runtime, { nonInteractive: true });
\t\t\treturn { applied: false };
`;
const DOCTOR_AFTER = `\t\tcase "doctor":
\t\t\t// ${MARKER}: keep doctor's synchronous work and transcript scans off the Gateway's main thread.
\t\t\tif (!opts.deps?.runDoctor && process.env.OPENCLAW_V_DOCTOR_SUBPROCESS !== "0") {
\t\t\t\tawait runDoctorSubprocess(runtime);
\t\t\t\treturn { applied: false };
\t\t\t}
\t\t\tawait (opts.deps?.runDoctor ?? (await import("./doctor-C3VXV-em.js")).doctorCommand)(runtime, { nonInteractive: true });
\t\t\treturn { applied: false };
`;

const RUN_BEFORE = `async function runDoctorHealthContributions(ctx) {
\tawait runDoctorHealthContributionList(ctx, resolveDoctorHealthContributions());
}
`;
const RUN_AFTER = `const TRANSCRIPT_SCAN_CONTRIBUTION_IDS = new Set(["doctor:session-transcript-headers", "doctor:session-transcript-labels"]);
/** ${MARKER}: the assistant's doctor child replaces the transcript-wide scans with a note. */
function skipTranscriptScanContributions(contributions) {
\tconst at = contributions.findIndex((contribution) => TRANSCRIPT_SCAN_CONTRIBUTION_IDS.has(contribution.id));
\tif (at < 0) return contributions;
\tconst kept = contributions.filter((contribution) => !TRANSCRIPT_SCAN_CONTRIBUTION_IDS.has(contribution.id));
\tkept.splice(at, 0, {
\t\t...contributions[at],
\t\tid: "doctor:session-transcript-scans-skipped",
\t\tlabel: "Session transcript scans",
\t\trun: async () => {
\t\t\tconst { note } = await loadNoteModule();
\t\t\tnote("Skipped the transcript header and label checks: they read every stored transcript event. Run \`openclaw doctor\` in a shell on this host to include them.", "Session transcripts");
\t\t}
\t});
\treturn kept;
}
async function runDoctorHealthContributions(ctx) {
\tconst contributions = resolveDoctorHealthContributions();
\tawait runDoctorHealthContributionList(ctx, process.env.OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS === "1" ? skipTranscriptScanContributions(contributions) : contributions);
}
`;

const once = (source, needle, what) => assert.equal(source.split(needle).length, 2, `Expected exactly one ${what}`);

const EDITS = {
  [OPERATIONS]: [
    [IMPORT_BEFORE, IMPORT_AFTER, 'operations first import'],
    [RUNNER_ANCHOR, `${RUNNER}${RUNNER_ANCHOR}`, 'operations-execute region'],
    [DOCTOR_BEFORE, DOCTOR_AFTER, 'doctor operation'],
  ],
  [CONTRIBUTIONS]: [[RUN_BEFORE, RUN_AFTER, 'runDoctorHealthContributions']],
};

export function patch(name, source) {
  assert(EDITS[name], `unknown file ${name}`);
  assert(!source.includes(MARKER), `${name} already patched`);
  for (const [before, , what] of EDITS[name]) once(source, before, what);
  return EDITS[name].reduce((out, [before, after]) => out.replace(before, () => after), source);
}

export function unpatch(name, source) {
  assert(EDITS[name], `unknown file ${name}`);
  assert(source.includes(MARKER), `${name} not patched`);
  for (const [, after, what] of EDITS[name]) once(source, after, `patched ${what}`);
  return EDITS[name].reduceRight((out, [before, after]) => out.replace(after, () => before), source);
}
