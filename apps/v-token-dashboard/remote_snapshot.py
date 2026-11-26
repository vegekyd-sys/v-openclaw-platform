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

# Waits between attempts. Long enough to ride out a Tailscale or Wi-Fi blip
# instead of throwing away a 20-minute capture on V after three seconds.
BACKOFF = (30, 90, 180)
CAPTURE_LIMIT = 2400          # hard cap on one capture run on V (seconds)
REUSE_LIMIT = 5 * 3600        # a later round may reuse a capture this young
REAP_MINUTES = 360            # older collection dirs on V are orphans; > REUSE_LIMIT
GLOBAL_LOCK = "/tmp/v-dashboard-global.lock"  # never matches the reaper's pattern
BUSY, TIMED_OUT, MISSING = 75, 124, 3
STAGE = re.compile(r"/tmp/v-dashboard\.[A-Za-z0-9]{8}")
PENDING = "remote-stage.json"
FILES = ("capture.pyz", "capture.lock", "snapshot.tmp", "snapshot.gz")


class Interrupted(RuntimeError):
    """The connection kept failing; V may still hold a usable result."""


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


def stderr_tail(exc, lines=3):
    text = getattr(exc, "stderr", None) or b""
    if isinstance(text, bytes):
        text = text.decode(errors="replace")
    tail = [line.strip() for line in text.splitlines() if line.strip()][-lines:]
    return ("：" + " | ".join(tail))[:400] if tail else ""


def retry(stage, operation):
    for attempt in range(len(BACKOFF) + 1):
        try:
            return operation()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, EOFError, OSError) as exc:
            code = getattr(exc, "returncode", None)
            detail = stderr_tail(exc)
            if code == BUSY:
                raise RuntimeError(f"{stage}跳过：V 上另一轮采集仍在进行") from None
            if code == TIMED_OUT:
                raise RuntimeError(f"{stage}超过 {CAPTURE_LIMIT} 秒被终止{detail}") from None
            reason = f"退出码 {code}" if code is not None else type(exc).__name__
            if code is not None and code != 255:
                raise RuntimeError(f"{stage}失败（{reason}）{detail}") from None
            if attempt == len(BACKOFF):
                raise Interrupted(f"{stage}失败（{reason}）{detail}") from None
            print(f"{stage}中断（{reason}），{BACKOFF[attempt]} 秒后重试{detail}", flush=True)
            time.sleep(BACKOFF[attempt])


def load_pending(state):
    try:
        record = json.loads((state / PENDING).read_text())
        if STAGE.fullmatch(record["stage"]):
            return {"stage": record["stage"], "start": int(record["start"]),
                    "end": int(record["end"]), "done": bool(record.get("done"))}
    except (TypeError, OSError, ValueError, KeyError):
        pass
    return None


def save_pending(state, record):
    if state is not None:
        temporary = state / (PENDING + ".tmp")
        temporary.write_text(json.dumps(record))
        temporary.replace(state / PENDING)


def reap():
    """Remove collection dirs a lost round left behind on V (one /tmp level only)."""
    try:
        remote("find /tmp -maxdepth 1 -type d -name 'v-dashboard.????????' -user openclaw "
               f"-mmin +{REAP_MINUTES} -exec rm -rf -- {{}} +")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
        print(f"V 上过期采集目录清理失败，下一轮再试{stderr_tail(exc)}", flush=True)


def cleanup(stage, state):
    files = " ".join(f"{stage}/{name}" for name in FILES)
    try:
        retry("采集临时目录清理", lambda: remote(
            f"[ ! -e {stage} ] || {{ rm -f {files} && rmdir {stage}; }}"))
    except RuntimeError as exc:
        print(f"{exc}，下一轮再清理", flush=True)
        return
    if state is not None and (load_pending(state) or {}).get("stage") == stage:
        (state / PENDING).unlink(missing_ok=True)


def checksum(result):
    digest = result.decode().split()
    if len(digest) != 2 or not re.fullmatch(r"[0-9a-f]{64}", digest[0]):
        raise ValueError("invalid capture checksum")
    return digest[0]


def finished(stage):
    """Checksum of a capture an earlier round left on V, or None when there is none."""
    def probe():
        try:
            # Waits for a capture that is still running in that dir.
            return remote(f"umask 077; cd {stage} 2>/dev/null || exit {MISSING}; "
                          f"flock capture.lock test -f snapshot.gz || exit {MISSING}; "
                          "sha256sum snapshot.gz", timeout=CAPTURE_LIMIT + 300)
        except subprocess.CalledProcessError as exc:
            if exc.returncode == MISSING:
                return None
            raise
    result = retry("续用上一轮采集", probe)
    return None if result is None else checksum(result)


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


def capture(start, end, state=None):
    """Return a validated snapshot. With a local state dir, a round that loses the
    connection keeps its dir on V and the next round downloads that result
    (window up to REUSE_LIMIT old) instead of starting a second full scan."""
    reap()
    pending = load_pending(state) if state is not None else None
    if pending and (pending["done"] or time.time() - pending["end"] >= REUSE_LIMIT):
        cleanup(pending["stage"], state)
        pending = None
    digest = None
    if pending:
        stage = pending["stage"]
        digest = finished(stage)
        if digest is None:
            cleanup(stage, state)
            pending = None
        else:
            start, end = pending["start"], pending["end"]
            print("续用上一轮在 V 上完成的采集", flush=True)
    if not pending:
        stage = retry("采集目录创建", lambda: remote("umask 077; mktemp -d /tmp/v-dashboard.XXXXXXXX")).decode().strip()
        if not STAGE.fullmatch(stage):
            raise ValueError("invalid collection directory")
        save_pending(state, {"stage": stage, "start": int(start), "end": int(end)})
    prefix = f"umask 077; cd {stage} && "
    keep = False
    try:
        if digest is None:
            archive = capture_archive()
            retry("采集程序上传", lambda: remote(prefix + "cat > capture.pyz", payload=archive))
            # capture.lock serializes retries inside this dir, so a capture that a
            # dropped SSH session left running is awaited and its file reused.
            # The global lock stops a second round from starting a parallel scan.
            job = (f"test -f snapshot.gz || (flock -n -E {BUSY} {GLOBAL_LOCK} "
                   f"timeout {CAPTURE_LIMIT} nice -n 12 python3 capture.pyz {int(start)} {int(end)} "
                   "> snapshot.tmp && mv snapshot.tmp snapshot.gz)")
            digest = checksum(retry("V 用量采集", lambda: remote(
                prefix + "flock capture.lock sh -c " + shlex.quote(job) + " && sha256sum snapshot.gz",
                timeout=CAPTURE_LIMIT + 300)))
        data = download(stage, digest, start, end)
        save_pending(state, {"stage": stage, "start": int(start), "end": int(end), "done": True})
        return data
    except Interrupted:
        keep = state is not None
        if keep:
            print("V 上的采集目录保留给下一轮续用", flush=True)
        raise
    finally:
        if not keep:
            cleanup(stage, state)
