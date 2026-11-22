import gzip
import json
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

from sync import sync


class SyncTest(unittest.TestCase):
    def test_failed_publish_preserves_receipt_and_retries_current_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            now = int(time.time())
            (state / "snapshot.json.gz").write_bytes(gzip.compress(json.dumps({"end": now}).encode()))
            receipt = state / "published-public.json"
            receipt.write_text(json.dumps({"end": now - 3600}))
            with patch("sync.Snapshot.refresh") as collect, patch("sync.subprocess.run") as publish:
                publish.side_effect = subprocess.CalledProcessError(1, "publish")
                with self.assertRaises(subprocess.CalledProcessError):
                    sync(state)
                self.assertEqual(json.loads(receipt.read_text())["end"], now - 3600)
                publish.side_effect = None
                sync(state)
                sync(state)
                self.assertEqual(json.loads(receipt.read_text())["end"], now)
                self.assertEqual(publish.call_count, 2)
                collect.assert_not_called()
