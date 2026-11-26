import fnmatch
import gzip
import hashlib
import json
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import remote_snapshot
from server import Snapshot

STAGE = "/tmp/v-dashboard.abcdefgh"


def snapshot(start=1, end=2):
    raw = gzip.compress(json.dumps({"start": start, "end": end, "rows": []}).encode())
    return raw, hashlib.sha256(raw).hexdigest().encode() + b"  snapshot.gz\n"


def lost(stderr=b""):
    return subprocess.CalledProcessError(255, "ssh", stderr=stderr)


class FakeV:
    """Answers remote() by command kind; each kind takes queued replies."""

    def __init__(self, **replies):
        self.replies = {kind: list(values) for kind, values in replies.items()}
        self.commands = []

    def kind(self, command):
        for kind, marker in (("reap", "find /tmp"), ("mktemp", "mktemp"), ("upload", "cat > capture.pyz"),
                             ("probe", "flock capture.lock test"), ("capture", "python3 capture.pyz"),
                             ("download", "cat /tmp/"), ("cleanup", "rmdir")):
            if marker in command:
                return kind
        raise AssertionError(command)

    def __call__(self, command, payload=None, timeout=90):
        kind = self.kind(command)
        self.commands.append((kind, command))
        queue = self.replies.get(kind) or [b""]
        reply = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(reply, BaseException):
            raise reply
        return reply

    def kinds(self):
        return [kind for kind, _ in self.commands]


class TransferTest(unittest.TestCase):
    def run_capture(self, fake, state=None, start=1, end=2):
        with patch.object(remote_snapshot, "remote", fake), \
                patch.object(remote_snapshot.time, "sleep") as sleep:
            try:
                return remote_snapshot.capture(start, end, state), sleep
            except RuntimeError as exc:
                return exc, sleep

    def test_truncated_download_retries_same_file_without_recollecting(self):
        raw, checksum = snapshot()
        fake = FakeV(mktemp=[STAGE.encode() + b"\n"], capture=[checksum], download=[raw[:-8], raw])
        data, sleep = self.run_capture(fake)
        self.assertEqual(data, {"start": 1, "end": 2, "rows": []})
        self.assertEqual(fake.kinds(), ["reap", "mktemp", "upload", "capture", "download", "download", "cleanup"])
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [30])

    def test_backoff_spans_minutes_before_giving_up(self):
        fake = FakeV(mktemp=[lost()])
        error, sleep = self.run_capture(fake)
        self.assertIsInstance(error, remote_snapshot.Interrupted)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [30, 90, 180])
        self.assertEqual(fake.kinds().count("mktemp"), 4)

    def test_capture_is_time_capped_and_globally_exclusive(self):
        raw, checksum = snapshot()
        fake = FakeV(mktemp=[STAGE.encode()], capture=[checksum], download=[raw])
        self.run_capture(fake)
        command = dict(fake.commands)["capture"]
        self.assertIn("flock -n -E 75 /tmp/v-dashboard-global.lock timeout 2400 nice -n 12 python3", command)

    def test_busy_global_lock_fails_round_without_retry_and_cleans_own_dir(self):
        fake = FakeV(mktemp=[STAGE.encode()], capture=[subprocess.CalledProcessError(75, "ssh")])
        error, sleep = self.run_capture(fake)
        self.assertNotIsInstance(error, remote_snapshot.Interrupted)
        self.assertIn("另一轮采集仍在进行", str(error))
        sleep.assert_not_called()
        self.assertEqual(fake.kinds()[-1], "cleanup")

    def test_error_includes_last_stderr_lines(self):
        stderr = b"Traceback (most recent call last):\n  File x\nsqlite3.OperationalError: locked\n\n"
        fake = FakeV(mktemp=[STAGE.encode()], capture=[subprocess.CalledProcessError(1, "ssh", stderr=stderr)])
        error, _ = self.run_capture(fake)
        self.assertIn("sqlite3.OperationalError: locked", str(error))
        self.assertIn("退出码 1", str(error))

    def test_reaper_is_one_level_and_spares_live_dirs_and_global_lock(self):
        raw, checksum = snapshot()
        fake = FakeV(mktemp=[STAGE.encode()], capture=[checksum], download=[raw])
        self.run_capture(fake)
        kind, command = fake.commands[0]
        self.assertEqual(kind, "reap")
        self.assertIn("-maxdepth 1", command)
        self.assertIn("-mmin +360", command)
        self.assertIn("-user openclaw", command)
        pattern = "v-dashboard.????????"
        self.assertIn(f"'{pattern}'", command)
        self.assertTrue(fnmatch.fnmatch(STAGE.rsplit("/", 1)[1], pattern))
        self.assertFalse(fnmatch.fnmatch(remote_snapshot.GLOBAL_LOCK.rsplit("/", 1)[1], pattern))
        self.assertGreater(remote_snapshot.REAP_MINUTES * 60,
                           remote_snapshot.REUSE_LIMIT + remote_snapshot.CAPTURE_LIMIT)

    def test_reaper_failure_does_not_block_round(self):
        raw, checksum = snapshot()
        fake = FakeV(reap=[lost(b"Connection reset")], mktemp=[STAGE.encode()], capture=[checksum], download=[raw])
        data, _ = self.run_capture(fake)
        self.assertEqual(data["rows"], [])

    def test_interrupted_round_keeps_dir_and_next_round_reuses_its_result(self):
        start, end = int(time.time()) - 7200, int(time.time()) - 3600
        raw, checksum = snapshot(start, end)
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            first = FakeV(mktemp=[STAGE.encode()], capture=[checksum], download=[lost()])
            error, _ = self.run_capture(first, state, start, end)
            self.assertIsInstance(error, remote_snapshot.Interrupted)
            self.assertNotIn("cleanup", first.kinds())
            self.assertEqual(json.loads((state / "remote-stage.json").read_text())["stage"], STAGE)

            second = FakeV(probe=[checksum], download=[raw])
            data, _ = self.run_capture(second, state, start=end, end=end + 1800)
            self.assertEqual((data["start"], data["end"]), (start, end))
            self.assertEqual(second.kinds(), ["reap", "probe", "download", "cleanup"])
            self.assertIn(STAGE, dict(second.commands)["probe"])
            self.assertFalse((state / "remote-stage.json").exists())

    def test_missing_or_stale_previous_dir_falls_back_to_fresh_capture(self):
        now = int(time.time())
        raw, checksum = snapshot(100, 200)
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            for record, expected in (
                    ({"stage": STAGE, "start": 1, "end": now - 3600},
                     ["reap", "probe", "cleanup", "mktemp", "upload", "capture", "download", "cleanup"]),
                    ({"stage": STAGE, "start": 1, "end": now - remote_snapshot.REUSE_LIMIT},
                     ["reap", "cleanup", "mktemp", "upload", "capture", "download", "cleanup"]),
                    ({"stage": STAGE, "start": 1, "end": now - 60, "done": True},
                     ["reap", "cleanup", "mktemp", "upload", "capture", "download", "cleanup"])):
                (state / "remote-stage.json").write_text(json.dumps(record))
                fake = FakeV(probe=[subprocess.CalledProcessError(3, "ssh")],
                             mktemp=[b"/tmp/v-dashboard.zyxwvuts"], capture=[checksum], download=[raw])
                data, _ = self.run_capture(fake, state, start=100, end=200)
                self.assertEqual(data["end"], 200)
                self.assertEqual(fake.kinds(), expected)
                self.assertFalse((state / "remote-stage.json").exists())

    def test_failed_cleanup_is_remembered_and_never_reused(self):
        now = int(time.time())
        raw, checksum = snapshot(now - 600, now - 300)
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            fake = FakeV(mktemp=[STAGE.encode()], capture=[checksum], download=[raw], cleanup=[lost()])
            data, sleep = self.run_capture(fake, state, now - 600, now - 300)
            self.assertEqual(data["end"], now - 300)
            self.assertEqual(fake.kinds().count("cleanup"), 4)
            record = json.loads((state / "remote-stage.json").read_text())
            self.assertTrue(record["done"])
            raw2, checksum2 = snapshot(100, 200)
            fake = FakeV(mktemp=[b"/tmp/v-dashboard.zyxwvuts"], capture=[checksum2], download=[raw2])
            data, _ = self.run_capture(fake, state, start=100, end=200)
            self.assertEqual(data["end"], 200)
            self.assertEqual(fake.kinds()[:2], ["reap", "cleanup"])
            self.assertIn(STAGE, fake.commands[1][1])
            self.assertNotIn("probe", fake.kinds())

    def test_corrupt_transfer_never_replaces_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Snapshot(Path(directory), 30)
            original = gzip.compress(b'{"end":1}')
            state.file.write_bytes(original)
            fake = FakeV(mktemp=[STAGE.encode()], capture=[b"a" * 64 + b"  snapshot.gz\n"], download=[b"partial"])
            with patch.object(remote_snapshot, "remote", fake), patch.object(remote_snapshot.time, "sleep"):
                state.refresh(background=False)
            self.assertIn("快照下载失败", state.error)
            self.assertEqual(state.file.read_bytes(), original)
            self.assertEqual(fake.kinds().count("download"), 4)
            # The verified file on V is kept for the next round instead of deleted.
            self.assertNotIn("cleanup", fake.kinds())
            self.assertTrue((Path(directory) / "remote-stage.json").exists())


if __name__ == "__main__":
    unittest.main()
