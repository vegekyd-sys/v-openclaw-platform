"""Refresh the private rolling snapshot on the collection Mac and publish it to R2."""
import argparse
import fcntl
import gzip
import json
from pathlib import Path
import subprocess
import tempfile
import time

from server import HERE, Snapshot


def sync(directory, force=False):
    state = Snapshot(directory, 30)
    with (directory / "sync.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        receipt = directory / "published-public.json"
        # A previous upload may have failed after a successful collection.
        # Publish that current snapshot on retry without collecting a second time.
        def snapshot_end():
            if not state.file.exists():
                return 0
            with gzip.open(state.file, "rt") as source:
                return json.load(source)["end"]
        end = snapshot_end()
        previous = json.loads(receipt.read_text())["end"] if receipt.exists() else 0
        if force or time.time() - end >= 6 * 3600 - 60:
            state.refresh(background=False)
            if state.error:
                raise RuntimeError(state.error)
            end = snapshot_end()
        if end == previous:
            return
        subprocess.run(["node", str(HERE / "edge/publish.mjs"), "publish", str(directory)], check=True)
        with tempfile.NamedTemporaryFile("w", dir=directory, delete=False) as out:
            json.dump({"end": end, "publishedAt": int(time.time())}, out)
        Path(out.name).replace(receipt)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    sync(args.data.resolve(), args.force)
