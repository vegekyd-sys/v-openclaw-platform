import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import remote_snapshot
from server import Snapshot


class TransferTest(unittest.TestCase):
    def test_truncated_download_retries_same_file_without_recollecting(self):
        data = {"start": 1, "end": 2, "rows": []}
        raw = gzip.compress(json.dumps(data).encode())
        checksum = hashlib.sha256(raw).hexdigest().encode() + b"  snapshot.gz\n"
        replies = [b"/tmp/v-dashboard.abcdefgh\n", b"", checksum, raw[:-8], raw, b""]
        with patch.object(remote_snapshot, "remote", side_effect=replies) as remote, \
                patch.object(remote_snapshot.time, "sleep"):
            self.assertEqual(remote_snapshot.capture(1, 2), data)
        commands = [call.args[0] for call in remote.call_args_list]
        self.assertEqual(sum("python3 capture.pyz" in cmd for cmd in commands), 1)
        self.assertEqual(commands[3], commands[4])
        self.assertIn("rmdir", commands[-1])

    def test_corrupt_transfer_never_replaces_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Snapshot(Path(directory), 30)
            original = gzip.compress(b'{"end":1}')
            state.file.write_bytes(original)
            with patch.object(remote_snapshot, "remote", side_effect=[
                    b"/tmp/v-dashboard.abcdefgh\n", b"", b"a"*64 + b"  snapshot.gz\n",
                    b"partial", b"partial", b"partial", b""]), patch.object(remote_snapshot.time, "sleep"):
                state.refresh(background=False)
            self.assertIn("快照下载失败", state.error)
            self.assertEqual(state.file.read_bytes(), original)
