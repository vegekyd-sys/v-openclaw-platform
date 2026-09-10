#!/usr/bin/env python3
"""Snapshot only reachable JS modules; share immutable npm dependencies read-only.

No Gateway, channel, config, credentials, state or shared-service mutation.
The target must be new. Run tests as an unprivileged UID in a systemd sandbox.
"""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--core', required=True)
p.add_argument('--dependencies', required=True)
p.add_argument('--target', required=True)
a = p.parse_args()
core, deps, target = map(lambda s: Path(s).resolve(), [a.core, a.dependencies, a.target])
if target.exists() or not core.is_dir() or not deps.is_dir():
    raise SystemExit('Target must be new; core and immutable dependencies must exist')
if '/labs/baselines/' not in str(deps):
    raise SystemExit('Dependency reuse requires a lab immutable baseline')
if shutil.disk_usage(target.parent).free < 3.3 * 1024 ** 3:
    raise SystemExit('Preserve at least 3 GiB free space; snapshot refused')
dist = core / 'dist'
patterns = ['cron-*.js', 'cron-tool-*.js', 'openclaw-tools-*.js',
            'gateway-caller-context-*.js', 'agent-runtime-identity-token-*.js',
            'host-capability-*.js', 'list-snapshot-revision-*.js', 'service-*.js',
            'agent-run-registry-*.js', 'src-*.js']
todo = [f for pattern in patterns for f in dist.glob(pattern)]
seen = {}
while todo:
    f = todo.pop().resolve()
    if f in seen or not f.is_file():
        continue
    if not f.is_relative_to(core):
        raise SystemExit(f'Dependency outside core snapshot: {f}')
    raw = f.read_bytes()
    seen[f] = hashlib.sha256(raw).hexdigest()
    if f.suffix in ('.js', '.mjs'):
        for relative in re.findall(r'[\'\"](\.{1,2}/[^\'\"\n]+\.(?:js|mjs|json))[\'\"]', raw.decode()):
            dependency = (f.parent / relative).resolve()
            if dependency.is_file():
                todo.append(dependency)
total = sum(f.stat().st_size for f in seen)
if total > 150 * 1024 ** 2:
    raise SystemExit(f'Snapshot would exceed 150 MiB: {total}')
target.mkdir(mode=0o755)
manifest = {'sourceCore': str(core), 'dependencyBaseline': str(deps),
            'bytes': total, 'files': {}}
for f, digest in sorted(seen.items()):
    out = target / f.relative_to(core)
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(f, out)  # Never hardlink another task's mutable code.
    if hashlib.sha256(out.read_bytes()).hexdigest() != digest or hashlib.sha256(f.read_bytes()).hexdigest() != digest:
        raise SystemExit(f'Source changed during snapshot; do not use candidate: {f}')
    manifest['files'][str(f.relative_to(core))] = digest
shutil.copyfile(core / 'package.json', target / 'package.json')
(target / 'node_modules').symlink_to(deps, target_is_directory=True)
(target / 'snapshot.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'files': len(seen), 'copiedMiB': round(total / 1024 ** 2, 2), 'target': str(target)}))
