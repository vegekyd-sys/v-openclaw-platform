#!/usr/bin/env python3
"""Move V's data down the tiers automatically: T0 system disk -> T1 data disk -> T2 COS.

docs/v-storage-tiering-plan.md. Every move is copy, verify, then delete; nothing is
deleted that has not been verified at its destination, and this program never
deletes anything in COS.

Categories come from /etc/v-storage/policy.json "archive.categories":

  {"name": "work", "root": ".../workspace/work", "action": "to-t1",
   "dest": "/srv/openclaw-data/disk1/work-archive", "min_age_days": 14}
      item = each entry of root; moved with rsync, verified (file count, bytes, an
      empty itemize pass), source replaced by an absolute symlink.

  {"name": "output-alt-cold", "root": "/srv/openclaw-data/disk1/openclaw/output-alt",
   "action": "to-t2", "min_age_days": 90, "link_roots": ["/srv/openclaw-data/output-alt"]}
      item = each entry; streamed as tar | zstd into a multipart upload (each part
      checked by Content-MD5, the object checked by size and multipart ETag).
      The local copy is deleted only on a later run, at least `cool_hours` after the
      upload, if it has not changed since. A directory becomes a directory holding
      ARCHIVED.md; a file becomes <name>.ARCHIVED.md, and symlinks to it under
      link_roots are moved to the stub.

  {"name": "media-inbound", "root": ".../media/inbound", "action": "to-t2",
   "group": "month", "min_age_days": 30}
      item = all files of one calendar month (by mtime) in a flat directory; the stub
      is ARCHIVED-<YYYY-MM>.md listing the files.

Age is the newest mtime/ctime of anything in the item, never atime. An item is
skipped if a process has it open or its cwd inside, if it holds an immutable or
append-only file (the 9/30 recovered files are protected on purpose), or if it holds
a symlink with '..'.

Receipts: /var/lib/v-archive/receipts.jsonl, one line per finished move
({"at","category","from","to","bytes","files","src","dest"}), read by flow.py.
Bucket usage by storage class: /var/lib/v-archive/cos-usage.json.

    archive.py                     one run (timer, 02:00): delete what cooled, then move
    archive.py --dry-run           list what would move or be deleted
    archive.py --restore <stub|key> [dest]   bring an archived item back
    archive.py --usage             refresh cos-usage.json only
"""
import datetime
import fcntl
import glob
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cos  # noqa: E402

STATE_DIR = Path(os.environ.get("V_ARCHIVE_STATE_DIR", "/var/lib/v-archive"))
STATE = STATE_DIR / "state.json"
RECEIPTS = STATE_DIR / "receipts.jsonl"
USAGE = STATE_DIR / "cos-usage.json"
POLICY_PATH = Path(os.environ.get("V_STORAGE_POLICY", "/etc/v-storage/policy.json"))
SENTINEL = "/opt/v-sentinel"
DAY = 86400
PART = 64 * 1024 * 1024
TZ = datetime.timezone(datetime.timedelta(hours=8))
FS_IOC_GETFLAGS = 0x80086601
PROTECTED = 0x10 | 0x20  # immutable, append-only

DEFAULTS = {
    "bucket": "",
    "prefix": "archive/v",
    "cool_hours": 24,
    "rate_mb_s": 40,  # runs at night only; internal COS traffic bypasses the public shaper (#693)
    "max_bytes_per_run": 300 * 10 ** 9,
    "max_seconds_per_run": 5 * 3600,
    "categories": [],
}


BUCKET_FILE = Path(os.environ.get("V_ARCHIVE_BUCKET_FILE", "/etc/v-storage/archive-bucket"))


def load_policy():
    p = dict(DEFAULTS)
    if POLICY_PATH.exists():
        p.update(json.loads(POLICY_PATH.read_text()).get("archive", {}))
    if not p["bucket"] and BUCKET_FILE.exists():
        # The bucket name carries the account APPID, so it lives on V, not in git.
        p["bucket"] = BUCKET_FILE.read_text().strip()
    return p


# ---------- scanning (pure-ish, tested on temp dirs) ----------

def open_paths():
    out = set()
    for p in glob.glob("/proc/[0-9]*"):
        try:
            out.add(os.readlink(p + "/cwd"))
        except OSError:
            pass
        for fd in glob.glob(p + "/fd/*"):
            try:
                out.add(os.readlink(fd))
            except OSError:
                pass
    return out


def protected(path):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    except OSError:
        return False
    try:
        flags = struct.unpack("I", fcntl.ioctl(fd, FS_IOC_GETFLAGS, b"\0\0\0\0"))[0]
        return bool(flags & PROTECTED)
    except OSError:
        return False
    finally:
        os.close(fd)


def scan(paths, age_by="mtime+ctime"):
    """Facts about a set of paths (an item, or a month's files).

    Age counts ctime by default: an unpacked archive keeps old mtimes, and new files in
    the workspace must not look cold. Data-disk categories use age_by="mtime" because
    their items got there through our own move, which resets ctime but already passed
    the ctime check on the way."""
    newest, size, files, problem = 0.0, 0, 0, None
    entries = []
    for top in paths:
        entries.append(top)
        if os.path.isdir(top) and not os.path.islink(top):
            for dp, dn, fn in os.walk(top):
                entries.extend(os.path.join(dp, n) for n in dn + fn)
    for q in entries:
        try:
            st = os.lstat(q)
        except FileNotFoundError:
            continue
        newest = max(newest, st.st_mtime, st.st_ctime if age_by != "mtime" else 0)
        if os.path.islink(q):
            if ".." in os.readlink(q).split("/"):
                problem = problem or "relative-dotdot-link"
        elif not os.path.isdir(q):
            size += st.st_size
            files += 1
            if problem is None and protected(q):
                problem = "protected-file"
    return {"newest": newest, "bytes": size, "files": files, "problem": problem}


def is_busy(paths, opened):
    return any(o == p or o.startswith(p.rstrip("/") + "/") for p in paths for o in opened)


def month_of(ts):
    return datetime.datetime.fromtimestamp(ts, TZ).strftime("%Y-%m")


def month_end(month):
    y, m = map(int, month.split("-"))
    nxt = datetime.datetime(y + (m == 12), m % 12 + 1, 1, tzinfo=TZ)
    return nxt.timestamp()


def items(cat):
    """[(item_id, [paths])] for a category. item_id is stable across runs."""
    root = cat["root"]
    if not os.path.isdir(root):
        return []
    if cat.get("group") == "month":
        months = {}
        for name in os.listdir(root):
            p = os.path.join(root, name)
            if name.startswith("ARCHIVED-") or os.path.islink(p) or not os.path.isfile(p):
                continue
            months.setdefault(month_of(os.lstat(p).st_mtime), []).append(p)
        return sorted(months.items())
    out = []
    for name in sorted(os.listdir(root)):
        p = os.path.join(root, name)
        if os.path.islink(p) or name.endswith(".ARCHIVED.md") or name.startswith(".") \
                or os.path.exists(os.path.join(p, "ARCHIVED.md")):
            continue
        out.append((name, [p]))
    return out


def old_enough(cat, item_id, facts, now):
    limit = cat["min_age_days"] * DAY
    if cat.get("group") == "month" and now - month_end(item_id) < limit:
        return False
    return now - facts["newest"] >= limit


def object_key(policy, cat, item_id, now):
    """Dated, so a later archive of the same name (a month that gets more files, a
    re-created project) never overwrites an earlier object."""
    safe = item_id.replace("/", "_")
    day = datetime.datetime.fromtimestamp(now, TZ).strftime("%Y%m%d")
    return "%s/%s/%s.%s.tar.zst" % (policy["prefix"].rstrip("/"), cat["name"], safe, day)


# ---------- side effects ----------

def notify(text):
    sys.path.insert(0, SENTINEL)
    try:
        import sentinel
        return sentinel.feishu(text)
    except Exception as e:
        print("alert failed: %s" % e, file=sys.stderr)
        return False


def receipt(rec):
    with RECEIPTS.open("a") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def tier_of(path):
    return "T0" if os.stat(path).st_dev == os.stat("/").st_dev else "T1"


def count_files(path):
    out = subprocess.run(["find", path, "-xdev", "-type", "f", "-printf", "%s\n"], capture_output=True, text=True).stdout.split()
    return len(out), sum(int(x) for x in out)


def move_to_t1(cat, item_id, src, facts, now):
    dest_dir = cat["dest"]
    dest = os.path.join(dest_dir, os.path.basename(src))
    if os.path.lexists(dest):
        return "skip-dest-exists"
    st = os.lstat(src)
    r = subprocess.run(["rsync", "-aHAX", "--numeric-ids", "--bwlimit=80000", src, dest_dir + "/"],
                       capture_output=True, text=True)
    if r.returncode:
        return "skip-rsync-%d" % r.returncode
    before = count_files(src) if os.path.isdir(src) else (1, st.st_size)
    after = count_files(dest) if os.path.isdir(dest) else (1, os.lstat(dest).st_size)
    itemize = subprocess.run(["rsync", "-aHAXn", "--numeric-ids", "--itemize-changes", src, dest_dir + "/"],
                             capture_output=True, text=True).stdout.strip()
    if before != after or itemize or scan([src], cat.get("age_by", "mtime+ctime"))["newest"] != facts["newest"]:
        return "skip-verify"
    tmp = src + ".v-archive-link"
    os.symlink(dest, tmp)
    os.lchown(tmp, st.st_uid, st.st_gid)
    shutil.rmtree(src) if os.path.isdir(src) and not os.path.islink(src) else os.unlink(src)
    os.rename(tmp, src)
    receipt({"at": int(now), "category": cat["name"], "from": "T0", "to": "T1", "bytes": facts["bytes"],
             "files": facts["files"], "src": src, "dest": dest})
    return "moved"


class Throttle:
    def __init__(self, mb_s):
        self.rate = mb_s * 1024 * 1024
        self.start = time.monotonic()
        self.sent = 0

    def add(self, n):
        self.sent += n
        ahead = self.sent / self.rate - (time.monotonic() - self.start)
        if ahead > 0:
            time.sleep(ahead)


def upload(policy, key, paths, base, throttle):
    """tar | zstd streamed into COS. Returns (bytes, parts); parts is 0 for a single PUT.

    COS checks each part against its Content-MD5 and we check the part ETag it returns
    against our MD5. Its multipart object ETag is not S3's md5-of-md5s (measured
    2026-11-28), so the object is checked by size and part count, and the ETag it
    reports is recorded and must be unchanged when the local copy is deleted."""
    rel = [os.path.relpath(p, base) for p in paths]
    tar = subprocess.Popen(["tar", "--xattrs", "--acls", "--numeric-owner", "-C", base, "-cf", "-", "--"] + rel,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    zst = subprocess.Popen(["zstd", "-T2", "-6", "-q", "-c"], stdin=tar.stdout, stdout=subprocess.PIPE)
    tar.stdout.close()
    bucket = policy["bucket"]
    hdr = {"x-cos-storage-class": "STANDARD", "Content-Type": "application/zstd",
           "x-cos-server-side-encryption": "AES256"}
    upload_id, md5s, total, parts = None, [], 0, []
    try:
        while True:
            chunk = zst.stdout.read(PART)
            if not chunk and upload_id is not None:
                break
            if upload_id is None and len(chunk) < PART:
                # small object: one PUT
                if tar.wait() or zst.wait():
                    raise RuntimeError("tar/zstd failed: %s" % tar.stderr.read().decode(errors="replace")[-300:])
                _, h, _ = cos.request("PUT", bucket, key, body=chunk, headers=dict(hdr))
                throttle.add(len(chunk))
                if (h.get("ETag") or "").strip('"') != hashlib.md5(chunk).hexdigest():
                    raise RuntimeError("object ETag is not our MD5")
                return len(chunk), 0
            if upload_id is None:
                _, _, body = cos.request("POST", bucket, key, params={"uploads": ""}, headers=dict(hdr))
                upload_id = cos.xml_text(body, "UploadId")
            md5 = hashlib.md5(chunk).digest()
            n = len(md5s) + 1
            _, h, _ = cos.request("PUT", bucket, key, params={"partNumber": str(n), "uploadId": upload_id}, body=chunk)
            etag = (h.get("ETag") or h.get("Etag") or "").strip('"')
            if etag != md5.hex():
                raise RuntimeError("part %d ETag is not our MD5" % n)
            md5s.append(md5)
            parts.append((n, etag))
            total += len(chunk)
            throttle.add(len(chunk))
        if tar.wait() or zst.wait():
            raise RuntimeError("tar/zstd failed: %s" % tar.stderr.read().decode(errors="replace")[-300:])
        xml = "<CompleteMultipartUpload>%s</CompleteMultipartUpload>" % "".join(
            "<Part><PartNumber>%d</PartNumber><ETag>%s</ETag></Part>" % (n, e) for n, e in parts)
        cos.request("POST", bucket, key, params={"uploadId": upload_id}, body=xml.encode())
        return total, len(parts)
    except Exception:
        tar.kill()
        zst.kill()
        if upload_id:
            try:
                cos.request("DELETE", bucket, key, params={"uploadId": upload_id})  # abort the upload only
            except Exception:
                pass
        raise


def head(policy, key):
    _, h, _ = cos.request("HEAD", policy["bucket"], key)
    return {k.lower(): v for k, v in h.items()}


def write_stub(cat, item_id, paths, key, facts):
    lines = ["# 已归档到 COS", "",
             "- 对象：`%s/%s`" % (cat.get("bucket_label", "cos"), key),
             "- 原大小：%.1f MB，%d 个文件" % (facts["bytes"] / 1e6, facts["files"]),
             "- 归档时间：%s" % datetime.datetime.now(TZ).strftime("%Y-%m-%d %H:%M %Z"),
             "- 取回：`sudo /opt/v-storage/archive.py --restore <这个文件的路径>`（30 天内立即可取；"
             "之后是归档存储，先发起恢复，几分钟到几小时后再执行一次）", ""]
    if cat.get("group") == "month":
        lines += ["## 文件", ""] + ["- %s" % os.path.basename(p) for p in sorted(paths)]
    text = "\n".join(lines) + "\n"
    if cat.get("group") == "month":
        stub = os.path.join(cat["root"], "ARCHIVED-%s.md" % item_id)
    elif os.path.isdir(paths[0]):
        stub = os.path.join(paths[0], "ARCHIVED.md")
    else:
        stub = paths[0] + ".ARCHIVED.md"
    owner = os.lstat(paths[0] if os.path.lexists(paths[0]) else cat["root"])
    return stub, text, (owner.st_uid, owner.st_gid)


def finish_delete(cat, item_id, paths, key, facts, now, policy, record=None):
    record = record or {}
    stub, text, (uid, gid) = write_stub(cat, item_id, paths, key, facts)
    links = []
    for lr in cat.get("link_roots", []):
        for p in paths:
            cand = os.path.join(lr, os.path.basename(p))
            if os.path.islink(cand) and os.readlink(cand) == p:
                links.append(cand)
    for p in paths:
        if os.path.isdir(p) and not os.path.islink(p):
            mode = os.lstat(p).st_mode
            shutil.rmtree(p)
            os.mkdir(p, mode & 0o7777)
            os.chown(p, uid, gid)
        else:
            os.unlink(p)
    if os.path.exists(stub):  # a month archived again: keep the earlier list
        text = Path(stub).read_text() + "\n---\n\n" + text
    Path(stub).write_text(text)
    os.chown(stub, uid, gid)
    if cat.get("group") != "month" and not os.path.isdir(paths[0]):
        for link in links:  # a file's name now points at its stub
            os.unlink(link)
            os.symlink(stub, link + ".ARCHIVED.md")
    receipt({"at": int(now), "category": cat["name"], "from": tier_of(cat["root"]), "to": "T2",
             "bytes": facts["bytes"], "files": facts["files"], "src": paths[0] if len(paths) == 1 else cat["root"],
             "dest": key, "objectBytes": record.get("objectBytes"), "uploadedAt": record.get("at")})


def usage_from_records(now):
    """Fallback when listing is not allowed: our own uploads, aged by the lifecycle rule
    (30 days -> ARCHIVE, 180 days -> DEEP_ARCHIVE)."""
    usage = {}
    if RECEIPTS.exists():
        for line in RECEIPTS.read_text().splitlines():
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get("to") != "T2":
                continue
            age = now - r.get("uploadedAt", r["at"])
            cls = "DEEP_ARCHIVE" if age > 180 * DAY else "ARCHIVE" if age > 30 * DAY else "STANDARD"
            usage[cls] = usage.get(cls, 0) + int(r.get("objectBytes", r.get("bytes", 0)))
    state = json.loads(STATE.read_text()) if STATE.exists() else {"uploaded": {}}
    for u in state.get("uploaded", {}).values():  # uploaded, local copy not yet deleted
        usage["STANDARD"] = usage.get("STANDARD", 0) + int(u.get("objectBytes", 0))
    usage["at"] = int(now)
    usage["source"] = "records"
    return usage


def refresh_usage(policy):
    if not policy["bucket"]:
        return None
    try:
        usage = list_usage(policy)
    except cos.CosError as e:
        if e.status != 403:
            raise
        usage = usage_from_records(time.time())
    USAGE.write_text(json.dumps(usage))
    return usage


def list_usage(policy):
    usage, marker = {}, ""
    while True:
        params = {"max-keys": "1000"}
        if marker:
            params["marker"] = marker
        _, _, body = cos.request("GET", policy["bucket"], "", params=params)
        import xml.etree.ElementTree as ET
        root = ET.fromstring(body)
        for c in root.iter("Contents"):
            cls = c.findtext("StorageClass") or "STANDARD"
            usage[cls] = usage.get(cls, 0) + int(c.findtext("Size") or 0)
            marker = c.findtext("Key")
        if (root.findtext("IsTruncated") or "false") != "true":
            break
        marker = root.findtext("NextMarker") or marker
    usage["at"] = int(time.time())
    usage["source"] = "list"
    return usage


# ---------- the run ----------

def run(policy, now, dry=False):
    state = json.loads(STATE.read_text()) if STATE.exists() else {"uploaded": {}}
    opened = open_paths()
    report = {"moved": [], "uploaded": [], "deleted": [], "skipped": [], "errors": []}
    budget = policy["max_bytes_per_run"]
    deadline = time.monotonic() + policy["max_seconds_per_run"]
    throttle = Throttle(policy["rate_mb_s"])
    cats = {c["name"]: c for c in policy["categories"]}

    # 1. delete what was uploaded at least cool_hours ago and has not changed since
    for uid, u in list(state["uploaded"].items()):
        cat = cats.get(u["category"])
        if not cat or now - u["at"] < policy["cool_hours"] * 3600:
            continue
        paths = [p for p in u["paths"] if os.path.lexists(p)]
        if len(paths) != len(u["paths"]):
            report["errors"].append("%s: source changed (missing paths), kept in state" % uid)
            continue
        facts = scan(paths, cat.get("age_by", "mtime+ctime"))
        if facts["newest"] != u["newest"] or facts["bytes"] != u["bytes"] or facts["files"] != u["files"]:
            report["skipped"].append("%s: changed after upload, will re-upload" % uid)
            if not dry:
                del state["uploaded"][uid]
            continue
        if is_busy(paths, opened):
            report["skipped"].append("%s: open" % uid)
            continue
        if dry:
            report["deleted"].append("%s (would)" % uid)
            continue
        try:
            h = head(policy, u["key"])
            if int(h.get("content-length", -1)) != u["objectBytes"] or h.get("etag", "").strip('"') != u["etag"]:
                raise RuntimeError("object does not match the upload record")
            finish_delete(cat, u["item"], paths, u["key"], facts, now, policy, u)
            del state["uploaded"][uid]
            report["deleted"].append(uid)
        except Exception as e:
            report["errors"].append("%s: %s" % (uid, e))
        STATE.write_text(json.dumps(state))

    # 2. move new candidates
    for cat in policy["categories"]:
        for item_id, paths in items(cat):
            uid = "%s:%s" % (cat["name"], item_id)
            if uid in state["uploaded"]:
                continue
            if budget <= 0 or time.monotonic() > deadline:
                break
            facts = scan(paths, cat.get("age_by", "mtime+ctime"))
            if not old_enough(cat, item_id, facts, now) or facts["files"] == 0:
                continue
            if facts["problem"] or is_busy(paths, opened):
                report["skipped"].append("%s: %s" % (uid, facts["problem"] or "open"))
                continue
            if dry:
                report["moved" if cat["action"] == "to-t1" else "uploaded"].append(
                    "%s %.1f MB (would)" % (uid, facts["bytes"] / 1e6))
                budget -= facts["bytes"]
                continue
            try:
                if cat["action"] == "to-t1":
                    budget -= facts["bytes"]
                    result = move_to_t1(cat, item_id, paths[0], facts, now)
                    (report["moved"] if result == "moved" else report["skipped"]).append("%s: %s" % (uid, result))
                else:
                    key = object_key(policy, cat, item_id, now)
                    base = cat["root"]
                    budget -= facts["bytes"]  # counts even if verification below fails
                    obj_bytes, nparts = upload(policy, key, paths, base, throttle)
                    h = head(policy, key)
                    etag = h.get("etag", "").strip('"')
                    if int(h.get("content-length", -1)) != obj_bytes or \
                            (nparts and not etag.endswith("-%d" % nparts)):
                        raise RuntimeError("uploaded object does not match (size %s/%d, etag %s, parts %d)"
                                           % (h.get("content-length"), obj_bytes, etag, nparts))
                    after = scan(paths, cat.get("age_by", "mtime+ctime"))
                    if after["newest"] != facts["newest"]:
                        raise RuntimeError("changed while uploading")
                    state["uploaded"][uid] = {"category": cat["name"], "item": item_id, "paths": paths, "key": key,
                                              "at": int(now), "objectBytes": obj_bytes, "etag": etag, **facts}
                    STATE.write_text(json.dumps(state))
                    report["uploaded"].append("%s %.1f MB -> %.1f MB" % (uid, facts["bytes"] / 1e6, obj_bytes / 1e6))
            except Exception as e:
                report["errors"].append("%s: %s" % (uid, e))
    if not dry:
        STATE.write_text(json.dumps(state))
    return report


def restore(policy, target, dest=None):
    key = None
    if os.path.exists(target):
        target = os.path.abspath(target)
    if os.path.isfile(target) and target.endswith(".md"):
        for line in Path(target).read_text().splitlines():
            if line.startswith("- 对象："):
                key = line.split("`")[1].split("/", 1)[1]
    else:
        key = target
    if not key:
        raise SystemExit("no object key found in %s" % target)
    h = head(policy, key)
    cls = h.get("x-cos-storage-class", "STANDARD")
    if cls in ("ARCHIVE", "DEEP_ARCHIVE") and 'ongoing-request="false"' not in h.get("x-cos-restore", ""):
        if "x-cos-restore" not in h:
            body = ("<RestoreRequest><Days>7</Days><CASJobParameters><Tier>Standard</Tier>"
                    "</CASJobParameters></RestoreRequest>").encode()
            cos.request("POST", policy["bucket"], key, params={"restore": ""}, body=body)
        print("%s 在 %s 存储里，已发起恢复（归档 3–5 小时，深度归档 12–24 小时），之后再执行一次。" % (key, cls))
        return
    dest = dest or (os.path.dirname(target) if os.path.isfile(target) else "/srv/openclaw-data/disk1/openclaw/restore")
    os.makedirs(dest, exist_ok=True)
    _, _, resp = cos.request("GET", policy["bucket"], key, timeout=3600, stream=True)
    p = subprocess.Popen("zstd -d -q -c | tar --xattrs --acls --numeric-owner -xf - -C %s" % subprocess.list2cmdline([dest]),
                         shell=True, stdin=subprocess.PIPE)
    with resp:
        while True:
            chunk = resp.read(8 * 1024 * 1024)
            if not chunk:
                break
            p.stdin.write(chunk)
    p.stdin.close()
    if p.wait():
        raise SystemExit("extract failed")
    print("已取回到 %s" % dest)


def main():
    args = sys.argv[1:]
    policy = load_policy()
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if args[:1] == ["--restore"]:
        restore(policy, args[1], args[2] if len(args) > 2 else None)
        return
    if args == ["--usage"]:
        print(refresh_usage(policy))
        return
    dry = args == ["--dry-run"]
    if not policy["bucket"] and not dry:
        raise SystemExit("no bucket: set archive.bucket or write %s" % BUCKET_FILE)
    with (STATE_DIR / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        report = run(policy, time.time(), dry=dry)
    if not dry:
        try:
            refresh_usage(policy)
        except Exception as e:
            report["errors"].append("usage: %s" % e)
        if report["errors"]:
            notify("V 冷归档 %s 有 %d 个错误\n\n%s" % (datetime.datetime.now(TZ).strftime("%m-%d %H:%M"),
                                                 len(report["errors"]), "\n".join(report["errors"][:10])))
    print(json.dumps({k: (v if dry or k != "skipped" else v[:50]) for k, v in report.items()}, ensure_ascii=False, indent=1))
    if report["errors"] and not dry:
        sys.exit(1)


if __name__ == "__main__":
    main()
