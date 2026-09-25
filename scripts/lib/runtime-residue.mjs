// Leftover copies from in-place patching: an extra suffix after a real
// extension (x.js.bak-foo, x.json.predeploy-y, x.mjs.postturn-v1.bak) or a bare
// .bak/.orig/.staged. They are not part of a release but they do enter the
// shared VLab deploy fingerprint.
//
// Match on the shape, not on words: an earlier pattern that looked for
// ".before-" moved OpenClaw's own agent-tools.before-tool-call-*.js out of VLab
// and the Gateway could not start. Compressed and source-map siblings of real
// assets (x.js.br, x.js.gz, x.js.map) are real files.
export const RESIDUE = /\.(bak|orig|staged)$|\.(m?js|cjs|json|css|html)\.(?!(map|br|gz)$)[^/]+$/;

export const isResidue = (path) => RESIDUE.test(path);
