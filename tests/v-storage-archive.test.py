#!/usr/bin/env python3
"""The archiver deletes local data. It must upload and verify first, wait out the cool-off,
delete only what is unchanged since the upload, leave a stub that says how to get it
back, keep symlinks pointing somewhere meaningful, never delete an object in COS, and
never overwrite an earlier archive.

Runs anywhere with tar and zstd; the T0->T1 rsync test needs GNU rsync (Linux)."""
import base64
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts", "v-storage"))
spec = importlib.util.spec_from_file_location("archive", os.path.join(HERE, "..", "scripts", "v-storage", "archive.py"))
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)
DAY = A.DAY


class FakeCos:
    """Just enough of COS: PUT, multipart, HEAD, GET bucket. Records every DELETE."""

    def __init__(self):
        self.objects, self.uploads, self.deletes = {}, {}, []

    def request(self, method, bucket, key="", params=None, body=b"", headers=None, stream=False, **kw):
        params = params or {}
        if method == "PUT" and "partNumber" in params:
            self.uploads[params["uploadId"]]["parts"][int(params["partNumber"])] = body
            return 200, {"ETag": '"%s"' % hashlib.md5(body).hexdigest()}, b""
        if method == "PUT":
            self.objects[key] = (body, hashlib.md5(body).hexdigest())
            return 200, {"ETag": '"%s"' % self.objects[key][1]}, b""
        if method == "POST" and "uploads" in params:
            uid = "u%d" % len(self.uploads)
            self.uploads[uid] = {"key": key, "parts": {}}
            return 200, {}, ("<x><UploadId>%s</UploadId></x>" % uid).encode()
        if method == "POST" and "uploadId" in params:
            u = self.uploads.pop(params["uploadId"])
            parts = [u["parts"][n] for n in sorted(u["parts"])]
            # Real COS does not use S3's md5-of-md5s; any opaque value with the part count.
            etag = "%s-%d" % (hashlib.sha1(b"".join(parts)).hexdigest()[:32], len(parts))
            self.objects[u["key"]] = (b"".join(parts), etag)
            return 200, {}, b""
        if method == "HEAD":
            data, etag = self.objects[key]
            return 200, {"Content-Length": str(len(data)), "ETag": '"%s"' % etag}, b""
        if method == "GET" and key == "":
            xml = "<r><IsTruncated>false</IsTruncated>%s</r>" % "".join(
                "<Contents><Key>%s</Key><Size>%d</Size><StorageClass>STANDARD</StorageClass></Contents>" % (k, len(v[0]))
                for k, v in self.objects.items())
            return 200, {}, xml.encode()
        if method == "DELETE":
            self.deletes.append((key, dict(params)))
            self.uploads.pop(params.get("uploadId"), None)
            return 204, {}, b""
        raise AssertionError((method, key, params))


def write(p, data=b"x", age=0, now=None):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    if age:
        t = (now or time.time()) - age
        os.utime(p, (t, t))
    return p


def age_tree(root, age, now):
    """Set every entry (directories too) to `age` seconds old: scan() counts directory
    mtimes, because adding a file to a directory makes it warm again."""
    t = now - age
    for dp, dn, fn in os.walk(root, topdown=False):
        for n in fn:
            os.utime(os.path.join(dp, n), (t, t), follow_symlinks=False)
        os.utime(dp, (t, t))


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(mock.patch.object(A, "STATE_DIR", self.tmp / "state"))
        self.enterContext(mock.patch.object(A, "STATE", self.tmp / "state/state.json"))
        self.enterContext(mock.patch.object(A, "RECEIPTS", self.tmp / "state/receipts.jsonl"))
        self.enterContext(mock.patch.object(A, "USAGE", self.tmp / "state/usage.json"))
        self.enterContext(mock.patch.object(A, "PART", 4096))
        self.enterContext(mock.patch.object(A, "open_paths", return_value=set()))
        self.enterContext(mock.patch.object(A, "notify", return_value=True))
        (self.tmp / "state").mkdir()
        self.cos = FakeCos()
        self.enterContext(mock.patch.object(A.cos, "request", side_effect=self.cos.request))
        # ctime cannot be set back; pretend scan's ages come from mtime only.
        real_lstat = os.lstat

        class St:
            def __init__(self, s):
                self._s = s

            def __getattr__(self, k):
                return self._s.st_mtime if k == "st_ctime" else getattr(self._s, k)
        self.enterContext(mock.patch.object(A.os, "lstat", side_effect=lambda p, **kw: St(real_lstat(p, **kw))))
        self.now = time.time()

    def policy(self, cats):
        return dict(A.DEFAULTS, bucket="b", prefix="archive/v", rate_mb_s=1000, categories=cats)

    def receipts(self):
        f = self.tmp / "state/receipts.jsonl"
        return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []


class Pure(Base):
    def test_month_items_skip_stubs_links_and_young_months(self):
        root = self.tmp / "inbound"
        write(root / "a.jpg", age=70 * DAY)
        write(root / "b.jpg", age=70 * DAY)
        write(root / "c.jpg")
        write(root / "ARCHIVED-2020-01.md")
        os.symlink(root / "a.jpg", root / "link.jpg")
        cat = {"name": "m", "root": str(root), "group": "month", "min_age_days": 30, "action": "to-t2"}
        got = dict(A.items(cat))
        old_month = A.month_of(self.now - 70 * DAY)
        self.assertEqual(sorted(os.path.basename(p) for p in got[old_month]), ["a.jpg", "b.jpg"])
        self.assertTrue(A.old_enough(cat, old_month, A.scan(got[old_month]), self.now))
        this_month = A.month_of(self.now)
        self.assertFalse(A.old_enough(cat, this_month, A.scan(got[this_month]), self.now))

    def test_scan_flags_dotdot_links(self):
        d = self.tmp / "item"
        write(d / "f")
        os.symlink("../elsewhere", d / "l")
        self.assertEqual(A.scan([str(d)])["problem"], "relative-dotdot-link")


    def test_keys_are_dated(self):
        cat = {"name": "c"}
        p = self.policy([])
        self.assertNotEqual(A.object_key(p, cat, "x", self.now), A.object_key(p, cat, "x", self.now + 2 * DAY))


class ToT2(Base):
    def setUp(self):
        super().setUp()
        self.t1 = self.tmp / "t1"
        self.links = self.tmp / "t0"
        self.links.mkdir()
        write(self.t1 / "proj/a.mp4", os.urandom(10000), age=100 * DAY, now=self.now)
        write(self.t1 / "proj/sub/b.txt", b"hello", age=100 * DAY, now=self.now)
        write(self.t1 / "report.md", b"# r", age=100 * DAY, now=self.now)
        age_tree(self.t1 / "proj", 100 * DAY, self.now)
        write(self.t1 / "fresh/x", b"new")
        os.symlink(self.t1 / "proj", self.links / "proj")
        os.symlink(self.t1 / "report.md", self.links / "report.md")
        self.cat = {"name": "out", "root": str(self.t1), "action": "to-t2", "min_age_days": 90,
                    "link_roots": [str(self.links)]}

    def test_upload_then_delete_after_cool_off(self):
        p = self.policy([self.cat])
        r1 = A.run(p, self.now)
        self.assertEqual(len(r1["uploaded"]), 2, r1)
        self.assertEqual(r1["deleted"], [])
        self.assertTrue((self.t1 / "proj/a.mp4").exists(), "nothing deleted before the cool-off")
        key = [k for k in self.cos.objects if "proj" in k][0]
        self.assertTrue(key.endswith(".tar.zst"))
        r2 = A.run(p, self.now + 3600)
        self.assertEqual(r2["deleted"], [])
        r3 = A.run(p, self.now + 25 * 3600)
        self.assertEqual(sorted(r3["deleted"]), ["out:proj", "out:report.md"], r3)
        # directory -> stub directory; its symlink still resolves
        self.assertEqual(os.listdir(self.t1 / "proj"), ["ARCHIVED.md"])
        self.assertIn(key, (self.links / "proj" / "ARCHIVED.md").read_text())
        # file -> sibling stub; the link moved with it
        self.assertFalse((self.t1 / "report.md").exists())
        self.assertTrue((self.t1 / "report.md.ARCHIVED.md").exists())
        self.assertFalse(os.path.lexists(self.links / "report.md"))
        self.assertEqual(os.readlink(self.links / "report.md.ARCHIVED.md"), str(self.t1 / "report.md.ARCHIVED.md"))
        self.assertTrue((self.t1 / "fresh/x").exists())
        rec = self.receipts()
        self.assertEqual({(r["from"], r["to"]) for r in rec}, {("T0", "T2")} if A.tier_of(str(self.t1)) == "T0" else {("T1", "T2")})
        # the archive really contains the files
        data = self.cos.objects[key][0]
        listing = subprocess.run("zstd -d -q -c | tar -tf -", shell=True, input=data, capture_output=True).stdout.decode()
        self.assertIn("proj/sub/b.txt", listing)
        self.assertIn("proj/a.mp4", listing)
        # COS objects are never deleted; a fourth run does nothing new
        self.assertEqual([d for d in self.cos.deletes if "uploadId" not in d[1]], [])
        r4 = A.run(p, self.now + 2 * DAY)
        self.assertEqual((r4["uploaded"], r4["deleted"]), ([], []))

    def test_changed_after_upload_is_kept_and_uploaded_again(self):
        p = self.policy([self.cat])
        A.run(p, self.now)
        write(self.t1 / "proj/late.txt", b"late")  # someone wrote into it after the upload
        r = A.run(p, self.now + 25 * 3600)
        self.assertNotIn("out:proj", r["deleted"])
        self.assertTrue((self.t1 / "proj/a.mp4").exists())
        r = A.run(p, self.now + 26 * 3600)
        self.assertFalse(any(u.startswith("out:proj") for u in r["uploaded"]), "warm again: wait")
        age_tree(self.t1 / "proj", 100 * DAY, self.now)  # cold again later
        r = A.run(p, self.now + 27 * 3600)
        self.assertTrue(any(u.startswith("out:proj") for u in r["uploaded"]), r)

    def test_object_mismatch_blocks_delete(self):
        p = self.policy([self.cat])
        A.run(p, self.now)
        for k in list(self.cos.objects):
            self.cos.objects[k] = (b"truncated", "bad")
        r = A.run(p, self.now + 25 * 3600)
        self.assertEqual(r["deleted"], [])
        self.assertEqual(len(r["errors"]), 2)
        self.assertTrue((self.t1 / "proj/a.mp4").exists())

    def test_open_item_is_skipped(self):
        with mock.patch.object(A, "open_paths", return_value={str(self.t1 / "proj/a.mp4")}):
            r = A.run(self.policy([self.cat]), self.now)
        self.assertIn("out:proj: open", r["skipped"])

    def test_dry_run_changes_nothing(self):
        r = A.run(self.policy([self.cat]), self.now, dry=True)
        self.assertEqual(len(r["uploaded"]), 2)
        self.assertEqual(self.cos.objects, {})


class Month(Base):
    def test_month_pack_and_stub(self):
        root = self.tmp / "inbound"
        for n in ("a.jpg", "b.mov"):
            write(root / n, os.urandom(3000), age=70 * DAY, now=self.now)
        write(root / "today.jpg")
        cat = {"name": "media", "root": str(root), "action": "to-t2", "group": "month", "min_age_days": 30}
        p = self.policy([cat])
        A.run(p, self.now)
        A.run(p, self.now + 25 * 3600)
        month = A.month_of(self.now - 70 * DAY)
        self.assertEqual(sorted(os.listdir(root)), sorted(["ARCHIVED-%s.md" % month, "today.jpg"]))
        stub = (root / ("ARCHIVED-%s.md" % month)).read_text()
        self.assertIn("a.jpg", stub)
        self.assertIn("b.mov", stub)


@unittest.skipUnless(sys.platform.startswith("linux"), "needs GNU rsync -AX")
class ToT1(Base):
    def test_move_with_symlink(self):
        src = self.tmp / "work"
        dest = self.tmp / "disk1"
        dest.mkdir()
        write(src / "old/a.bin", os.urandom(5000), age=20 * DAY, now=self.now)
        age_tree(src / "old", 20 * DAY, self.now)
        write(src / "new/b.bin", b"b")
        cat = {"name": "work", "root": str(src), "action": "to-t1", "dest": str(dest), "min_age_days": 14}
        r = A.run(self.policy([cat]), self.now)
        self.assertEqual(r["moved"], ["work:old: moved"])
        self.assertEqual(os.readlink(src / "old"), str(dest / "old"))
        self.assertEqual((src / "old/a.bin").stat().st_size, 5000)
        self.assertFalse(os.path.islink(src / "new"))


if __name__ == "__main__":
    unittest.main()
