#!/usr/bin/env python3
"""Second copy on COS: pack one verified batch from the vdb archive, upload it
slowly, read it back from COS and check every file's sha256 against the manifest.

Run as root on V after copy_verify.py:
  ionice -c2 -n7 nice -n19 python3 cos_pack.py --manifest batch.tsv --name 2026-05

The COS mount uses the public endpoint (cos.ap-singapore.myqcloud.com), which
shares V's shaped egress with model traffic, so the archive is zstd-compressed
and written at --rate-mb (default 2 MB/s). Writes
  <COS>/<name>.tar.zst, <name>.manifest.tsv, <name>.receipt.json
and the same receipt next to the manifest. remove_sources.py requires it.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tarfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guard import Guard, Throttle  # noqa: E402

DEST = "/srv/openclaw-data/disk1/legacy-sessions-archive/trajectories"
COS = "/lhcos-data/openclaw-archive/v-zkda/legacy-sessions-trajectories"
WORK = "/srv/openclaw-data/disk1/legacy-sessions-archive/work"
BUF = 1 << 20


def read_manifest(path):
    lines = open(path).read().splitlines()
    cols = lines[0].split("\t")
    return [dict(zip(cols, l.split("\t"))) for l in lines[1:] if l]


def pax_ns(ns):
    return "%d.%09d" % divmod(ns, 10 ** 9)


def uncached(path):
    """Open for reading with this file's pages dropped, so a cosfs read goes to COS."""
    f = open(path, "rb")
    os.posix_fadvise(f.fileno(), 0, 0, os.POSIX_FADV_DONTNEED)
    return f


def sha256_of(path):
    h = hashlib.sha256()
    with uncached(path) as f:
        for b in iter(lambda: f.read(BUF), b""):
            h.update(b)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--rate-mb", type=float, default=2)
    args = ap.parse_args()
    rows = read_manifest(args.manifest)
    os.makedirs(COS, mode=0o700, exist_ok=True)
    local = os.path.join(WORK, args.name + ".tar.zst")
    remote = os.path.join(COS, args.name + ".tar.zst")
    if os.path.exists(remote):
        raise SystemExit("already on COS: %s" % remote)

    # 1. Pack from the vdb copies (already sha256-verified) with owner/mode/mtime.
    with open(local + ".partial", "wb") as out:
        z = subprocess.Popen(["zstd", "-3", "-T1", "-q", "-c"], stdin=subprocess.PIPE, stdout=out)
        with tarfile.open(fileobj=z.stdin, mode="w|", format=tarfile.PAX_FORMAT) as tar:
            for r in rows:
                path = os.path.join(DEST, r["name"])
                ti = tar.gettarinfo(path, arcname=r["name"])
                # Exact nanosecond mtime; tarfile would otherwise write a rounded float.
                ti.pax_headers["mtime"] = pax_ns(int(r["mtime_ns"]))
                with open(path, "rb") as f:
                    tar.addfile(ti, f)
        z.stdin.close()
        if z.wait() != 0:
            raise SystemExit("zstd failed")
    os.chmod(local + ".partial", 0o600)
    os.rename(local + ".partial", local)
    subprocess.run(["zstd", "-t", "-q", local], check=True)
    archive_sha = sha256_of(local)

    # 2. Upload slowly; pause while the Gateway looks unhealthy.
    guard, throttle = Guard(), Throttle(args.rate_mb * 1e6)
    with open(local, "rb") as src, open(remote + ".partial", "wb") as dst:
        for b in iter(lambda: src.read(BUF), b""):
            guard.tick()
            dst.write(b)
            throttle.take(len(b))
    os.chmod(remote + ".partial", 0o600)
    os.rename(remote + ".partial", remote)

    # 3. Read back from COS: whole-archive sha256, then every member against the manifest.
    if sha256_of(remote) != archive_sha:
        raise SystemExit("COS archive sha256 differs from the local pack")
    want = {r["name"]: r for r in rows}
    seen = 0
    z = subprocess.Popen(["zstd", "-dc"], stdin=uncached(remote), stdout=subprocess.PIPE)
    with tarfile.open(fileobj=z.stdout, mode="r|") as tar:
        for m in tar:
            r = want.get(m.name)
            if r is None or not m.isreg():
                raise SystemExit("unexpected member %s" % m.name)
            h = hashlib.sha256()
            f = tar.extractfile(m)
            for b in iter(lambda: f.read(BUF), b""):
                h.update(b)
            if h.hexdigest() != r["sha256"] or m.size != int(r["size"]) \
                    or "%04o" % m.mode != r["mode"] or (m.uid, m.gid) != (int(r["uid"]), int(r["gid"])) \
                    or m.pax_headers.get("mtime") != pax_ns(int(r["mtime_ns"])):
                raise SystemExit("COS member differs from manifest: %s" % m.name)
            seen += 1
    if z.wait() != 0 or seen != len(rows):
        raise SystemExit("COS read-back incomplete: %d of %d" % (seen, len(rows)))

    receipt = {
        "name": args.name, "files": len(rows), "bytes": sum(int(r["size"]) for r in rows),
        "manifest": os.path.abspath(args.manifest), "manifest_sha256": sha256_of(args.manifest),
        "cos_archive": remote, "cos_archive_bytes": os.path.getsize(remote), "cos_archive_sha256": archive_sha,
        "cos_members_verified": seen, "verified_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    for path, data in ((os.path.join(COS, args.name + ".manifest.tsv"), open(args.manifest).read()),
                       (os.path.join(COS, args.name + ".receipt.json"), json.dumps(receipt, indent=1)),
                       (args.manifest + ".cos-receipt.json", json.dumps(receipt, indent=1))):
        with open(path + ".partial", "w") as f:
            f.write(data)
        os.chmod(path + ".partial", 0o600)
        os.rename(path + ".partial", path)
    os.unlink(local)
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
