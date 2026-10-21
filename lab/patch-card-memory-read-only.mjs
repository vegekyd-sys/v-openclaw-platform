import { createHash } from 'node:crypto';

// card-memory-read-only (V 2026-10-22, Tianyi: every Night Shift task reads memory but never writes it).
// A Workboard card session (`agent:<id>:subagent:workboard-<board>-<card>`, any board, any Workflow) may
// read the agent's memory, but a write, edit, apply_patch or delete that lands on a memory artifact
// (the paths the memory-write provenance observer classifies: memory/**, MEMORY.md, ...) is refused with
// a message that tells the Agent where its report goes instead. Every file tool reaches memory through
// withMemoryWriteProvenance, and every observer is built with the run's session key, so the guard sits in
// the observer. #454 already stops the memory flush for these sessions; this closes the remaining paths
// (an Agent following AGENTS.md's learning loop, a Skill, or a habit). Shell commands are not file tools
// and stay outside it.
export const MARKER = 'v-card-memory-read-only-v1';
export const RELEASE_DIR = 'lab/release-files/card-memory-read-only';
export const NAME = 'tool-loop-detection-config-Dftl-DTD.js';
export const BEFORE = '30dc362314e99fadeab934f87ad3596524aaa3570b6cee4c4237b2a193d0865e';

export const REPLACEMENTS = [
  [
    '//#region src/agents/memory-write-provenance.ts\nfunction withMemoryWriteProvenance(operations, observer) {\n\tif (!observer) return operations;\n\tconst remove = operations.remove;\n',
    `//#region src/agents/memory-write-provenance.ts
// ${MARKER}: Workboard card sessions read memory and never write it.
function isWorkboardCardSessionKey(sessionKey) {
	return /^agent:[^:]+:subagent:workboard-[^:]+$/u.test(String(sessionKey ?? "").trim().toLowerCase());
}
function cardMemoryReadOnlyError(relativePath) {
	return new Error(\`Night Shift cards may read memory but not write it: \${relativePath} was not changed. Put what this card did in your final message and the stage handoff.\`);
}
function withMemoryWriteProvenance(operations, observer) {
	if (!observer) return operations;
	const remove = operations.remove;
`,
  ],
  [
    '\t\t...remove ? { remove: async (absolutePath) => {\n\t\t\tconst contentBefore',
    '\t\t...remove ? { remove: async (absolutePath) => {\n\t\t\tawait observer.assertWritable?.(absolutePath);\n\t\t\tconst contentBefore',
  ],
  [
    '\treturn {\n\t\tclassifies: async (absolutePath) => await resolveRelativePath(absolutePath) !== void 0,\n\t\twrite: async ({ absolutePath, contentBefore, contentAfter, commit }) => {\n\t\t\tconst relativePath = await resolveRelativePath(absolutePath);\n\t\t\tif (!relativePath) {\n\t\t\t\tawait commit();\n\t\t\t\treturn;\n\t\t\t}\n',
    `	const cardSession = isWorkboardCardSessionKey(params.sessionKey);
	return {
		classifies: async (absolutePath) => await resolveRelativePath(absolutePath) !== void 0,
		assertWritable: async (absolutePath) => {
			if (!cardSession) return;
			const relativePath = await resolveRelativePath(absolutePath);
			if (relativePath) throw cardMemoryReadOnlyError(relativePath);
		},
		write: async ({ absolutePath, contentBefore, contentAfter, commit }) => {
			const relativePath = await resolveRelativePath(absolutePath);
			if (!relativePath) {
				await commit();
				return;
			}
			if (cardSession) throw cardMemoryReadOnlyError(relativePath);
`,
  ],
];

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function patchFile(source) {
  if (sha256(source) !== BEFORE) throw new Error(`${NAME}: unexpected input ${sha256(source)}`);
  let out = source;
  for (const [from, to] of REPLACEMENTS) {
    const count = out.split(from).length - 1;
    if (count !== 1) throw new Error(`${NAME}: expected one match, found ${count}: ${from.slice(0, 70)}`);
    out = out.replace(from, () => to);
  }
  return out;
}
