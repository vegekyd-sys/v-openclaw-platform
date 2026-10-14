// The decision part of scripts/vlab-v-parity.mjs, without SSH, so it can be
// tested: given the hashed trees of every pair, which state is VLab in?
//
//   pairs          from runtime-components.mjs parityPairs(); two pairs may
//                  share a prefix (`copy` marks the second VLab copy)
//   trees[i]       { v: Map<path, sha> | null, vlab: Map | null } for pairs[i];
//                  null = directory absent (allowed only for optional pairs)
//   pending        Map<target, { plan, before, after }> from --pending plans
//   pendingSidecars Set of sidecar component ids the pending release installs
import { isResidue } from './runtime-residue.mjs';

export function evaluateParity({ pairs, trees, pending = new Map(), pendingSidecars = new Set() }) {
  const findings = [];
  const residue = { v: [], vlab: [] };
  let compared = 0;
  pairs.forEach((pair, i) => {
    const v = trees[i].v ?? new Map();
    const vlab = trees[i].vlab ?? new Map();
    for (const [side, tree] of [['v', v], ['vlab', vlab]]) {
      if (side === 'v' && pair.copy) continue; // V's tree was counted with the first pair
      for (const [path, sha] of tree) if (isResidue(path)) residue[side].push({ target: `${pair.prefix}/${path}`, sha });
    }
    const sidecarPending = pair.kind === 'sidecar' && pendingSidecars.has(pair.component);
    for (const path of [...new Set([...v.keys(), ...vlab.keys()])].sort()) {
      if (isResidue(path)) continue;
      compared += 1;
      const target = `${pair.prefix}/${path}`;
      const vSha = v.get(path) ?? null;
      const vlabSha = vlab.get(path) ?? null;
      // A second VLab copy compared under the same prefix (the Codex plugin the
      // VLab Gateway loads, beside the runtime copy) says which one differs.
      const base = { target, component: pair.component, ...(pair.copy ? { copy: pair.copy } : {}) };
      if (vSha === vlabSha) {
        // The release reached the first copy only: this one still equals V's before-bytes.
        const want = pair.copy ? pending.get(target) : null;
        if (want && want.after != null && vlabSha !== want.after) {
          findings.push({ ...base, kind: 'pending-not-deployed-on-vlab', v: vSha, vlab: vlabSha, expectedV: want.before, expectedVlab: want.after });
        }
        continue;
      }
      if (sidecarPending) {
        findings.push({ ...base, kind: 'pending', plan: `sidecar:${pair.component}` });
        continue;
      }
      const want = pending.get(target);
      if (want) {
        const vOk = vSha === want.before;
        const vlabOk = want.after == null || vlabSha === want.after;
        if (vOk && vlabOk) {
          findings.push({ ...base, kind: 'pending', plan: want.plan });
          continue;
        }
        findings.push({ ...base, kind: vOk ? 'pending-not-deployed-on-vlab' : 'pending-base-moved-on-v',
          v: vSha, vlab: vlabSha, expectedV: want.before, expectedVlab: want.after });
        continue;
      }
      findings.push({ ...base, kind: vSha == null ? 'only-on-vlab' : vlabSha == null ? 'only-on-v' : 'differs', v: vSha, vlab: vlabSha,
        ...(pair.blocking === false ? { advisory: true } : {}) });
    }
  });
  for (const target of pending.keys()) {
    if (!findings.some((f) => f.target === target)) {
      findings.push({ target, kind: 'pending-but-identical', note: 'already on V, or not deployed to VLab' });
    }
  }
  const blocking = findings.filter((f) => f.kind !== 'pending' && !f.advisory);
  const ahead = findings.some((f) => f.kind === 'pending');
  const state = blocking.length ? 'DIVERGED' : ahead ? 'AHEAD' : 'ALIGNED';
  return { state, compared, findings, residue };
}

export function parseSums(out) {
  const tree = new Map();
  for (const line of out.split('\n')) {
    const m = /^([0-9a-f]{64})\s+\.\/(.+)$/.exec(line);
    if (m) tree.set(m[2], m[1]);
  }
  return tree;
}
