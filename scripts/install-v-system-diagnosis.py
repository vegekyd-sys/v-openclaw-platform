#!/usr/bin/env python3
"""Install V's self-diagnosis skill and its AGENTS.md routing rule. Runs on V.

Between 2026-10-22 and 10-25 V asked the `openclaw` tool (OpenClaw's built-in
system agent) three times to diagnose problems of its own: a failing UM sync,
a proxied loopback call, V Browser tabs. The system agent can only read
config/status and run doctor; it cannot see logs, files or processes. Each time
it ran a full in-process doctor that froze the production Gateway for
158-310 s, and none of its answers reached V before V's tool call timed out.

This installs the read-only runbook V should follow instead
(ops/v-workspace/skills/v-system-diagnosis) and a short rule in the workspace
AGENTS.md that points to it. AGENTS.md is the only workspace file every harness
injects; the skills catalog is truncated alphabetically around "geelark-" on V,
so the skill's own description is never seen and the rule names its path.

    ./install-v-system-diagnosis.py --check       show what would change; change nothing
    ./install-v-system-diagnosis.py               install (backs up AGENTS.md and any old skill)
    ./install-v-system-diagnosis.py --uninstall   remove the rule and the skill (backs up first)

The rule sits between BEGIN/END markers, inserted before ANCHOR on first
install and replaced in place afterwards, so re-running is idempotent. AGENTS.md
is a core document: install only after Tianyi approved this exact block, then
commit it in the workspace git.
"""
import argparse
import datetime
import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.realpath(__file__))
REPO = os.path.dirname(HERE)
SKILL_NAME = "v-system-diagnosis"
SKILL_SRC = os.path.join(REPO, "ops", "v-workspace", "skills", SKILL_NAME)
BLOCK_SRC = os.path.join(REPO, "ops", "v-workspace", "agents-md", f"{SKILL_NAME}.md")
DEFAULT_WORKSPACE = "/home/openclaw/makaron-openclaw/.openclaw-local/workspace"
DEFAULT_BACKUPS = "/home/openclaw/.openclaw/backups/workspace-docs"
BEGIN = f"<!-- {SKILL_NAME}:begin -->"
END = f"<!-- {SKILL_NAME}:end -->"
ANCHOR = "### Real-Time Progress Updates"
# A bootstrap file over this is truncated by OpenClaw 2026.9.1 (DEFAULT_BOOTSTRAP_MAX_CHARS).
BOOTSTRAP_MAX_CHARS = 20000
TZ = datetime.timezone(datetime.timedelta(hours=8))  # Asia/Shanghai, no DST


def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def render_block():
    body = read(BLOCK_SRC).strip("\n")
    return f"{BEGIN}\n{body}\n{END}\n\n"


def without_block(text):
    """Return text with our marked block removed, or None if it is not there."""
    start = text.find(BEGIN)
    if start < 0:
        return None
    end = text.find(END, start)
    if end < 0 or text.find(BEGIN, start + 1) >= 0:
        raise SystemExit(f"AGENTS.md has a broken {SKILL_NAME} block; fix it by hand")
    end += len(END)
    while text[end:end + 1] == "\n":
        end += 1
    return text[:start] + text[end:]


def with_block(text):
    base = without_block(text)
    if base is None:
        base = text
    if base.count(ANCHOR) != 1:
        raise SystemExit(f"anchor {ANCHOR!r} found {base.count(ANCHOR)} times in AGENTS.md; expected exactly once")
    i = base.index(ANCHOR)
    return base[:i] + render_block() + base[i:]


def skill_files(root):
    out = {}
    for dirpath, _, names in os.walk(root):
        for name in names:
            path = os.path.join(dirpath, name)
            out[os.path.relpath(path, root)] = hashlib.sha256(open(path, "rb").read()).hexdigest()
    return out


def write_like(path, text, like):
    """Write text atomically, keeping the owner and mode of the file `like`."""
    st = os.stat(like)
    tmp = f"{path}.{SKILL_NAME}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(tmp, st.st_mode & 0o7777)
    if os.geteuid() == 0:
        os.chown(tmp, st.st_uid, st.st_gid)
    os.replace(tmp, path)


def chown_tree(root, like):
    if os.geteuid() != 0:
        return
    st = os.stat(like)
    for dirpath, dirs, names in os.walk(root):
        for p in [dirpath] + [os.path.join(dirpath, n) for n in names]:
            os.chown(p, st.st_uid, st.st_gid)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--workspace", default=DEFAULT_WORKSPACE)
    ap.add_argument("--backup-dir", default=DEFAULT_BACKUPS)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="report only")
    mode.add_argument("--uninstall", action="store_true")
    args = ap.parse_args(argv)

    agents = os.path.join(args.workspace, "AGENTS.md")
    skills_dir = os.path.join(args.workspace, "skills")
    skill_dst = os.path.join(skills_dir, SKILL_NAME)
    if not os.path.isfile(agents) or not os.path.isdir(skills_dir):
        raise SystemExit(f"not a V workspace (need AGENTS.md and skills/): {args.workspace}")

    before = read(agents)
    if args.uninstall:
        after = without_block(before)
        after = before if after is None else after
        skill_after = {}
    else:
        after = with_block(before)
        skill_after = skill_files(SKILL_SRC)
    skill_before = skill_files(skill_dst) if os.path.isdir(skill_dst) else {}
    report = {
        "workspace": args.workspace,
        "mode": "check" if args.check else ("uninstall" if args.uninstall else "install"),
        "agentsMd": {
            "changed": after != before,
            "sha256Before": sha256(before),
            "sha256After": sha256(after),
            "charsBefore": len(before),
            "charsAfter": len(after),
            "underBootstrapLimit": len(after) <= BOOTSTRAP_MAX_CHARS,
        },
        "skill": {"path": skill_dst, "changed": skill_after != skill_before, "files": sorted(skill_after)},
    }
    if len(after) > BOOTSTRAP_MAX_CHARS:
        report["error"] = f"AGENTS.md would be {len(after)} chars, over the {BOOTSTRAP_MAX_CHARS}-char bootstrap limit"
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2
    if args.check or not (report["agentsMd"]["changed"] or report["skill"]["changed"]):
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    stamp = datetime.datetime.now(TZ).strftime("%Y%m%d-%H%M%S")
    os.makedirs(args.backup_dir, mode=0o700, exist_ok=True)
    backup = os.path.join(args.backup_dir, f"{SKILL_NAME}-{stamp}")
    n = 1
    while os.path.exists(backup):
        n += 1
        backup = os.path.join(args.backup_dir, f"{SKILL_NAME}-{stamp}-{n}")
    os.mkdir(backup, mode=0o700)
    shutil.copy2(agents, os.path.join(backup, "AGENTS.md"))
    if skill_before:
        shutil.copytree(skill_dst, os.path.join(backup, "skill"))
    report["backup"] = backup

    if report["skill"]["changed"]:
        if os.path.isdir(skill_dst):
            shutil.rmtree(skill_dst)
        if not args.uninstall:
            shutil.copytree(SKILL_SRC, skill_dst)
            chown_tree(skill_dst, skills_dir)
    if report["agentsMd"]["changed"]:
        write_like(agents, after, agents)
    if read(agents) != after or (skill_files(skill_dst) if os.path.isdir(skill_dst) else {}) != skill_after:
        report["error"] = "post-write verification failed; restore from backup"
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
