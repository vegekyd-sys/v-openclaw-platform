"""Collect and enrich on V, then transfer the finished snapshot independently."""
import gzip
import hashlib
import io
import json
import re
import shlex
import subprocess
import time
import zipfile
from pathlib import Path


def capture_archive():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in ("collect.py", "people.py"):
            archive.write(Path(__file__).with_name(name), name)
        archive.writestr("__main__.py", """import gzip, json, sys
from collect import collect
from people import ROOT, enrich

data = enrich(collect(ROOT, int(sys.argv[1]), int(sys.argv[2])))
with gzip.open(sys.stdout.buffer, 'wb') as output:
    output.write(json.dumps(data, ensure_ascii=False).encode())
""")
    return stream.getvalue()


def remote(command, *, payload=None, timeout=90):
    result = subprocess.run(
        ["ssh", "-T", "-S", "none", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
         "-o", "ServerAliveInterval=20", "-o", "ServerAliveCountMax=3", "v",
         "cd /tmp && sudo -n -Hu openclaw sh -c " + shlex.quote(command)],
        input=payload, capture_output=True, timeout=timeout, check=True)
    return result.stdout


def retry(stage, operation):
    for attempt in range(3):
        try:
            return operation()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, EOFError, OSError) as exc:
            code = getattr(exc, "returncode", None)
            reason = f"退出码 {code}" if code is not None else type(exc).__name__
            if attempt == 2 or (code is not None and code != 255):
                raise RuntimeError(f"{stage}失败（{reason}）") from None
            print(f"{stage}中断（{reason}），正在重试", flush=True)
            time.sleep(2 ** attempt)


def download(stage, digest, start, end):
    def checked_read():
        raw = remote(f"cat {stage}/snapshot.gz", timeout=300)
        if hashlib.sha256(raw).hexdigest() != digest:
            raise EOFError("Snapshot transfer checksum mismatch")
        return raw

    raw = retry("快照下载", checked_read)
    data = json.loads(gzip.decompress(raw))
    if data["start"] != start or data["end"] != end or not isinstance(data["rows"], list):
        raise ValueError("snapshot failed validation")
    return data


def capture(start, end):
    stage = retry("采集目录创建", lambda: remote("umask 077; mktemp -d /tmp/v-dashboard.XXXXXXXX")).decode().strip()
    if not re.fullmatch(r"/tmp/v-dashboard\.[A-Za-z0-9]{8}", stage):
        raise ValueError("invalid collection directory")
    prefix = f"umask 077; cd {stage} && "
    try:
        archive = capture_archive()
        retry("采集程序上传", lambda: remote(prefix + "cat > capture.pyz", payload=archive))
        # A disconnected SSH client can leave a capture finishing on V. Serialize
        # retries and reuse the completed file for this exact collection window.
        job = (f"test -f snapshot.gz || (nice -n 12 python3 capture.pyz {int(start)} {int(end)} "
               "> snapshot.tmp && mv snapshot.tmp snapshot.gz)")
        result = retry("V 用量采集", lambda: remote(prefix + "flock capture.lock sh -c " +
                       shlex.quote(job) + " && sha256sum snapshot.gz", timeout=2700))
        digest = result.decode().split()
        if len(digest) != 2 or not re.fullmatch(r"[0-9a-f]{64}", digest[0]):
            raise ValueError("invalid capture checksum")
        return download(stage, digest[0], start, end)
    finally:
        try:
            remote(prefix + f"rm -f capture.pyz capture.lock snapshot.tmp snapshot.gz && rmdir {stage}")
        except (OSError, subprocess.SubprocessError):
            print("本轮采集临时目录清理失败", flush=True)
