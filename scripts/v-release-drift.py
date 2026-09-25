#!/usr/bin/env python3
"""Release drift check for V. Runs on the host itself, on its own hourly timer.

It exists for one failure mode: somebody patches the running release in place.
That has been the normal way to ship here, and it is invisible to everything
else we watch -- the service stays active, the health endpoint stays 200, the
release ID and the git commit recorded next to it keep describing a build that
no longer matches the bytes on disk. On 2026-09-23 the release directory was
edited during the twenty minutes it took to audit it.

Deliberately separate from sentinel.py's two-minute loop: hashing ~8600 files
is real I/O on a host whose root filesystem sits at 88%. It borrows only that
module's Feishu path, so alerts still never travel through the thing being
watched.

    ./release-drift.py --check      print findings, exit 1 on drift, send nothing
    ./release-drift.py              alert on a drift set not already reported
    ./release-drift.py --accept     adopt the live state as expected (after a
                                    deploy that was supposed to change things)
"""
import hashlib
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

EXPECTED_PATH = "/opt/v-sentinel/expected-release.json"
# Components captured whole (--base none): the worker plugin and the Feishu
# plugin. On 2026-09-23 the Feishu plugin was patched in place while this check
# only looked at core dist, so it saw nothing.
COMPONENTS_DIR = "/opt/v-sentinel/expected-release.d"
STATE_PATH = "/var/lib/v-sentinel/release-drift.json"
UNIT = "openclaw-gateway.service"
# Leftover backups from in-place patching. Not part of the release, but they
# enter the deploy channel's directory fingerprint and have blocked releases.
RESIDUE_SUFFIXES = (".bak", ".orig", ".staged")
RESIDUE_MARKERS = (".bak-", ".pre-", ".predeploy-")


def sh(cmd, timeout=600):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True,
                              text=True, timeout=timeout).stdout
    except Exception:
        return ""


def is_residue(path):
    return path.endswith(RESIDUE_SUFFIXES) or any(m in path for m in RESIDUE_MARKERS)


def hash_tree(root, skip_dirs=()):
    """sha256 every regular file under root, keyed by ./-prefixed relative path.

    Done in-process rather than by shelling out to find|xargs sha256sum so a
    path containing a newline cannot fabricate or hide an entry.
    """
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for name in filenames:
            full = os.path.join(dirpath, name)
            if os.path.islink(full) or not os.path.isfile(full):
                continue
            h = hashlib.sha256()
            try:
                with open(full, "rb") as f:
                    for chunk in iter(lambda: f.read(1 << 20), b""):
                        h.update(chunk)
            except OSError:
                continue
            out["./" + os.path.relpath(full, root)] = h.hexdigest()
    return out


def whole_capture(expected):
    """A component captured with --base none declares every file it has."""
    return expected.get("capturedFrom", {}).get("baseDir") == "none"


def find_drift(expected, live, check_process=True, base=None):
    """Compare the live tree against the manifest. Returns ordered findings.

    `base` is the hash map of the upstream install the manifest was captured
    against. The manifest only declares files that differ from it, so every
    other live file must still equal base. Without this, a file that matched
    upstream at capture time could be patched in place unseen -- which is what
    happened on 2026-09-25 04:01 (GPT-6 backport into two untouched bundles).
    """
    declared = {f["path"]: f["sha256"] for f in expected.get("files", [])}
    known_residue = {f["path"] for f in expected.get("residue", [])}
    findings = []

    for path, sha in sorted(declared.items()):
        actual = live.get(path)
        if actual is None:
            findings.append(("gone", path))
        elif actual != sha:
            findings.append(("drifted", path))

    for path in sorted(live):
        if path in declared or path in known_residue:
            continue
        if is_residue(path):
            findings.append(("new-residue", path))
        elif whole_capture(expected):
            findings.append(("added", path))
        elif base is not None:
            base_sha = base.get(path)
            if base_sha is None:
                findings.append(("added", path))
            elif base_sha != live[path]:
                findings.append(("drifted-from-base", path))

    if not check_process:
        return findings

    # A drop-in added after the capture can repoint ExecStart without touching
    # a byte of the release directory, so the bytes alone are not enough.
    runtime_dir = expected["capturedFrom"]["runtimeDir"]
    release_root = runtime_dir[:-5] if runtime_dir.endswith("/dist") else runtime_dir
    exec_start = sh("systemctl show %s -p ExecStart --no-pager" % UNIT, timeout=30)
    if release_root not in exec_start:
        findings.append(("execstart-elsewhere", exec_start.strip()[:400]))

    # The process that is actually serving traffic, which is not necessarily
    # what the unit file would start today.
    running = sh("ps -eo args | grep -F 'gateway --port' | grep -v grep", timeout=30)
    if running and release_root not in running:
        findings.append(("running-process-elsewhere", running.strip().splitlines()[0][:400]))

    return findings


BASE_CACHE = "/var/lib/v-sentinel/base-hashes.json"
BASE_INVENTORY_DIR = "/opt/v-sentinel/base"


def base_hashes(base_dir):
    """Hashes of the upstream install. It never changes, so hash it once and
    reuse; a changed file count or newest mtime invalidates the cache."""
    if base_dir and base_dir.startswith("npm:"):
        # A published package is not on this host; its inventory is shipped
        # from the repo (release/captured/base/) by install-v-release-drift.sh.
        name = re.sub(r"[/:]", "__", base_dir[4:].lstrip("@"))
        try:
            with open(os.path.join(BASE_INVENTORY_DIR, name + ".json")) as f:
                return json.load(f)["files"]
        except Exception:
            return None
    if not base_dir or base_dir == "none" or not os.path.isdir(base_dir):
        return None
    count, newest = 0, 0.0
    for dirpath, _d, filenames in os.walk(base_dir):
        for name in filenames:
            full = os.path.join(dirpath, name)
            try:
                newest = max(newest, os.lstat(full).st_mtime)
            except OSError:
                continue
            count += 1
    key = "%s|%d|%.3f" % (base_dir, count, newest)
    try:
        with open(BASE_CACHE) as f:
            cached = json.load(f)
        if cached.get("key") == key:
            return cached["hashes"]
    except Exception:
        pass
    hashes = hash_tree(base_dir)
    os.makedirs(os.path.dirname(BASE_CACHE), exist_ok=True)
    tmp = BASE_CACHE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"key": key, "hashes": hashes}, f)
    os.replace(tmp, BASE_CACHE)
    return hashes


def load_manifests():
    """The core manifest first, then every component manifest beside it."""
    manifests = []
    with open(EXPECTED_PATH) as f:
        manifests.append(("core", json.load(f)))
    if os.path.isdir(COMPONENTS_DIR):
        for name in sorted(os.listdir(COMPONENTS_DIR)):
            if name.endswith(".json"):
                with open(os.path.join(COMPONENTS_DIR, name)) as f:
                    manifests.append((name[:-5], json.load(f)))
    return manifests


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""

    try:
        manifests = load_manifests()
    except Exception as e:
        print("cannot read expected manifests: %s" % e, file=sys.stderr)
        return 2

    expected = manifests[0][1]
    findings = []
    total = 0
    for label, manifest in manifests:
        runtime_dir = manifest["capturedFrom"]["runtimeDir"]
        if not os.path.isdir(runtime_dir):
            findings.append(("root-missing", "%s %s" % (label, runtime_dir)))
            continue
        skip = ("node_modules",) if whole_capture(manifest) else ()
        live = hash_tree(runtime_dir, skip)
        total += len(live)
        base = base_hashes(manifest.get("capturedFrom", {}).get("baseDir")) if not whole_capture(manifest) else None
        for kind, detail in find_drift(manifest, live, check_process=(label == "core"), base=base):
            findings.append((kind, detail if label == "core" else "%s:%s" % (label, detail)))

    if mode == "--accept":
        print("live trees have %d files; %d findings against the current manifests"
              % (total, len(findings)))
        print("re-run scripts/capture-production-runtime.mjs from the repo and "
              "ship the new manifest here; this script does not rewrite it")
        return 0

    report = "\n".join("  %-22s %s" % (kind, detail) for kind, detail in findings)
    if mode == "--check":
        print("release %s: %d files live in %d roots, %d findings"
              % (expected.get("release"), total, len(manifests), len(findings)))
        if report:
            print(report)
        return 1 if findings else 0

    if not findings:
        save_state({})
        return 0

    # Alert once per distinct drift set. A drift that persists is already known;
    # a drift that changes is new information.
    digest = hashlib.sha256(repr(findings).encode()).hexdigest()
    if load_state().get("digest") == digest:
        return 1

    from sentinel import feishu  # noqa: E402  (same directory, installed alongside)
    shown = findings[:15]
    text = ("【V 发布漂移】%s\n线上 release 与 manifest 不一致，共 %d 处：\n%s%s\n"
            "manifest: %s（capturedAt %s）\n"
            "V 被改了（热修或 V 自己改了自己）。先查谁改的：sudo journalctl | grep COMMAND=\n"
            "要保留：capture-production-runtime.mjs → PR 进 dev → install-v-release-drift.sh → "
            "sync-vlab-from-v.mjs --name <新发版> --apply\n"
            "不保留：把 V 恢复回去（promote-to-v.mjs --undo，或热改留下的备份）\n"
            "流程：docs/vlab-v-sync-flow.md；manifest release/captured/%s，unit %s"
            % (expected.get("release"), len(findings),
               "\n".join("  %s %s" % (k, d) for k, d in shown),
               "\n  ...另有 %d 处" % (len(findings) - len(shown)) if len(findings) > len(shown) else "",
               EXPECTED_PATH, expected.get("capturedAt"),
               expected.get("release"), UNIT))
    if feishu(text):
        save_state({"digest": digest, "count": len(findings)})
    return 1


def load_state():
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(s):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(s, f)
    os.replace(tmp, STATE_PATH)


if __name__ == "__main__":
    sys.exit(main())
