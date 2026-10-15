#!/usr/bin/env python3
"""Delete originals of one batch, only after both copies are verified.

Run as root on V:
  python3 remove_sources.py --manifest batch.tsv            # dry run
  python3 remove_sources.py --manifest batch.tsv --apply

Requires <manifest>.cos-receipt.json from cos_pack.py whose manifest_sha256
matches. For every row, before unlinking the original:
- the vdb copy exists with the manifest size, mtime, owner and mode, and its
  sha256 (re-read from disk now) equals the manifest;
- the original still has the manifest size and mtime, one link, and is not
  open by any process;
- with --fresh-plan, the file is still in a plan.py result taken just before
  (still unreferenced and older than 14 days).
Anything that fails is left in place and reported.
"""
import argparse
import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guard import Guard, Throttle  # noqa: E402

SD = "/home/openclaw/.openclaw/agents/makaron/sessions"
DEST = "/srv/openclaw-data/disk1/legacy-sessions-archive/trajectories"
BUF = 1 << 20


def sha256_file(path, throttle):
    h = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY)
    try:
        for b in iter(lambda: os.read(fd, BUF), b""):
            h.update(b)
            throttle.take(len(b))
        os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
    finally:
        os.close(fd)
    return h.hexdigest()


def open_files_under(root):
    found = set()
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            for fd in os.listdir("/proc/%s/fd" % pid):
                try:
                    t = os.readlink("/proc/%s/fd/%s" % (pid, fd))
                except OSError:
                    continue
                if t.startswith(root + "/"):
                    found.add(os.path.basename(t))
        except OSError:
            continue
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--fresh-plan", help="plan.py output taken right before removal")
    ap.add_argument("--rate-mb", type=float, default=60, help="vdb re-read rate")
    args = ap.parse_args()
    receipt = json.load(open(args.manifest + ".cos-receipt.json"))
    h = hashlib.sha256(open(args.manifest, "rb").read()).hexdigest()
    if receipt["manifest_sha256"] != h or receipt["cos_members_verified"] != receipt["files"]:
        raise SystemExit("COS receipt does not cover this manifest")
    lines = open(args.manifest).read().splitlines()
    cols = lines[0].split("\t")
    rows = [dict(zip(cols, l.split("\t"))) for l in lines[1:] if l]
    if len(rows) != receipt["files"]:
        raise SystemExit("manifest rows %d != receipt files %d" % (len(rows), receipt["files"]))
    movable = None
    if args.fresh_plan:
        movable = set(r["name"] for r in json.load(open(args.fresh_plan))["move"])
    busy = open_files_under(SD)
    guard, throttle = Guard(), Throttle(args.rate_mb * 1e6)
    removed = removed_bytes = 0
    problems = []
    log_path = args.manifest + (".removed.tsv" if args.apply else ".dryrun.tsv")
    with open(log_path, "x") as log:
        os.chmod(log_path, 0o600)
        for i, r in enumerate(rows):
            guard.tick()
            src, dst = os.path.join(SD, r["name"]), os.path.join(DEST, r["name"])
            try:
                s, d = os.lstat(src), os.lstat(dst)
            except FileNotFoundError as e:
                problems.append([r["name"], "missing: %s" % e.filename])
                continue
            meta = (int(r["size"]), int(r["mtime_ns"]))
            if (s.st_size, s.st_mtime_ns) != meta or s.st_nlink != 1:
                problems.append([r["name"], "original changed"])
                continue
            if (d.st_size, d.st_mtime_ns) != meta or (d.st_uid, d.st_gid) != (int(r["uid"]), int(r["gid"])) \
                    or "%04o" % (d.st_mode & 0o7777) != r["mode"]:
                problems.append([r["name"], "archive copy metadata differs"])
                continue
            if movable is not None and r["name"] not in movable:
                problems.append([r["name"], "no longer movable in fresh plan"])
                continue
            if r["name"] in busy:
                problems.append([r["name"], "original is open"])
                continue
            if sha256_file(dst, throttle) != r["sha256"]:
                problems.append([r["name"], "archive copy sha256 differs"])
                continue
            if args.apply:
                os.unlink(src)
                if i % 200 == 199:
                    time.sleep(0.2)
            removed += 1
            removed_bytes += s.st_size
            log.write("%s\t%s\n" % (r["name"], r["sha256"]))
        if args.apply:
            fd = os.open(SD, os.O_RDONLY)
            os.fsync(fd)
            os.close(fd)
    print(json.dumps({"apply": args.apply, "rows": len(rows), "removed": removed,
                      "removed_bytes": removed_bytes, "problems": problems[:50],
                      "problem_count": len(problems), "log": log_path}, ensure_ascii=False))
    if problems:
        sys.exit(2)


if __name__ == "__main__":
    main()
