#!/usr/bin/env python3
"""Copy planned trajectory files to the vdb archive and verify each by sha256.

Never deletes anything. Run as root on V:
  ionice -c2 -n7 nice -n19 python3 copy_verify.py --plan plan.json --month 2026-05 \
      --limit 50 --manifest batch.tsv

For each file: read the source once (hash while copying, then drop it from the
page cache so the agent DB's hot pages stay resident), write <name>.partial,
fsync, restore owner/mode/times, rename, drop the copy from the page cache,
read it back from disk and compare sha256. The source must have the same size,
mtime and ctime before and after. A file already in the archive is accepted
only when its sha256 matches.

Manifest TSV columns: name kind month size mtime_ns mode uid gid sha256
"""
import argparse
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guard import Guard, Throttle  # noqa: E402

SD = "/home/openclaw/.openclaw/agents/makaron/sessions"
DEST = "/srv/openclaw-data/disk1/legacy-sessions-archive/trajectories"
BUF = 1 << 20
OPENCLAW_GID = 1003


def sha256_file(path, throttle=None):
    h = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY)
    try:
        while True:
            b = os.read(fd, BUF)
            if not b:
                break
            h.update(b)
            if throttle:
                throttle.take(len(b))
        os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
    finally:
        os.close(fd)
    return h.hexdigest()


def copy_one(r, throttle):
    src = os.path.join(SD, r["name"])
    dst = os.path.join(DEST, r["name"])
    try:
        before = os.lstat(src)
    except FileNotFoundError:
        return None, "source missing"
    if before.st_size != r["size"] or before.st_mtime_ns != r["mtime_ns"] or before.st_nlink != 1:
        return None, "source changed since plan"
    if os.path.lexists(dst):
        h_src = sha256_file(src, throttle)
        h_dst = sha256_file(dst)
        if h_src != h_dst:
            raise SystemExit("archive copy differs from source: %s" % r["name"])
        return h_src, "already archived"
    tmp = dst + ".partial"
    h = hashlib.sha256()
    sfd = os.open(src, os.O_RDONLY | os.O_NOFOLLOW)
    dfd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    try:
        while True:
            b = os.read(sfd, BUF)
            if not b:
                break
            h.update(b)
            os.write(dfd, b)
            throttle.take(len(b))
        os.fsync(dfd)
        os.fchown(dfd, before.st_uid, before.st_gid)
        os.fchmod(dfd, before.st_mode & 0o7777)
        os.posix_fadvise(sfd, 0, 0, os.POSIX_FADV_DONTNEED)
        os.posix_fadvise(dfd, 0, 0, os.POSIX_FADV_DONTNEED)
    finally:
        os.close(sfd)
        os.close(dfd)
    os.utime(tmp, ns=(before.st_atime_ns, before.st_mtime_ns))
    os.rename(tmp, dst)
    after = os.lstat(src)
    if (after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (before.st_size, before.st_mtime_ns, before.st_ctime_ns):
        os.unlink(dst)
        return None, "source changed during copy"
    h_src = h.hexdigest()
    h_dst = sha256_file(dst)
    st = os.lstat(dst)
    if h_dst != h_src or st.st_size != r["size"] or st.st_mtime_ns != r["mtime_ns"] \
            or (st.st_uid, st.st_gid, st.st_mode & 0o7777) != (before.st_uid, before.st_gid, before.st_mode & 0o7777):
        raise SystemExit("verification failed after copy: %s" % r["name"])
    return h_src, "copied"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True)
    ap.add_argument("--month", action="append", help="YYYY-MM; repeatable; default all")
    ap.add_argument("--names", help="file with one name per line, overrides --month")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--rate-mb", type=float, default=20)
    args = ap.parse_args()
    rows = json.load(open(args.plan))["move"]
    if args.names:
        wanted = set(l.strip() for l in open(args.names) if l.strip())
        rows = [r for r in rows if r["name"] in wanted]
    elif args.month:
        rows = [r for r in rows if r["month"] in args.month]
    if args.limit:
        rows = rows[: args.limit]
    os.makedirs(DEST, mode=0o750, exist_ok=True)
    os.chown(DEST, 0, OPENCLAW_GID)
    os.chmod(DEST, 0o750)
    guard, throttle = Guard(), Throttle(args.rate_mb * 1e6)
    counts = {}
    fd = os.open(args.manifest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as out:
        out.write("name\tkind\tmonth\tsize\tmtime_ns\tmode\tuid\tgid\tsha256\n")
        for i, r in enumerate(rows):
            guard.tick()
            sha, status = copy_one(r, throttle)
            counts[status] = counts.get(status, 0) + 1
            if sha:
                out.write("\t".join(str(r[k]) for k in ("name", "kind", "month", "size", "mtime_ns", "mode", "uid", "gid")) + "\t" + sha + "\n")
                out.flush()
            if i % 500 == 0:
                print("progress %d/%d %s" % (i, len(rows), counts), file=sys.stderr, flush=True)
    print(json.dumps({"selected": len(rows), "counts": counts, "manifest": args.manifest}))


if __name__ == "__main__":
    main()
