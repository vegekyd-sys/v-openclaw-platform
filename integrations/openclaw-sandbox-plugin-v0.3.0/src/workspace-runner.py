#!/usr/bin/env python3
"""Small durable argv runner used inside an OpenShell Sandbox.

The Broker starts work quickly and polls this helper later, so an OpenClaw tool
RPC never has to stay open for the lifetime of a build or test command.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(os.environ.get("VLAB_SANDBOX_RUNNER_ROOT", "/sandbox/.versa/ops"))
PROJECT = Path(os.environ.get("VLAB_SANDBOX_RUNNER_PROJECT", "/sandbox/project"))
TERMINAL = {"completed", "failed", "cancelled", "timed_out"}


def fail(message: str) -> None:
    raise SystemExit(message)


def operation_dir(operation_id: str) -> Path:
    if not operation_id.startswith("vop-") or len(operation_id) != 28:
        fail("invalid operation id")
    if any(char not in "0123456789abcdef" for char in operation_id[4:]):
        fail("invalid operation id")
    return ROOT / operation_id


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    temp = path.with_suffix(f".{os.getpid()}.tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    os.chmod(temp, 0o600)
    os.replace(temp, path)


def current_status(directory: Path, max_bytes: int = 200_000) -> dict:
    meta_path = directory / "status.json"
    if not meta_path.exists():
        fail("operation status is missing")
    meta = read_json(meta_path)
    for name in ("stdout", "stderr"):
        path = directory / f"{name}.log"
        if not path.exists():
            meta[name] = ""
            meta[f"{name}Truncated"] = False
            continue
        size = path.stat().st_size
        with path.open("rb") as handle:
            data = handle.read(max_bytes)
        meta[name] = data.decode("utf-8", errors="replace")
        meta[f"{name}Truncated"] = size > len(data)
        meta[f"{name}Bytes"] = size
    return meta


def start(operation_id: str, timeout_seconds: int) -> None:
    directory = operation_dir(operation_id)
    ROOT.mkdir(parents=True, exist_ok=True)
    try:
        directory.mkdir(mode=0o700)
    except FileExistsError:
        print(json.dumps(current_status(directory), ensure_ascii=False))
        return

    try:
        command = json.load(sys.stdin)
        if not isinstance(command, list) or not command or not all(isinstance(value, str) and value for value in command):
            fail("command must be a non-empty argv array")
        write_json(directory / "command.json", {"command": command, "timeoutSeconds": timeout_seconds})
        write_json(directory / "status.json", {
            "operationId": operation_id,
            "status": "starting",
            "createdAt": iso_now(),
            "updatedAt": iso_now(),
            "timeoutSeconds": timeout_seconds,
        })
        subprocess.Popen(
            [sys.executable, __file__, "supervise", operation_id],
            cwd=str(PROJECT),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            close_fds=True,
        )
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            meta = read_json(directory / "status.json")
            if meta.get("status") != "starting":
                break
            time.sleep(0.02)
        print(json.dumps(current_status(directory), ensure_ascii=False))
    except BaseException:
        if (directory / "status.json").exists():
            meta = read_json(directory / "status.json")
            meta.update({"status": "failed", "finishedAt": iso_now(), "updatedAt": iso_now(), "error": "runner start failed"})
            write_json(directory / "status.json", meta)
        raise


def supervise(operation_id: str) -> None:
    directory = operation_dir(operation_id)
    request = read_json(directory / "command.json")
    timeout_seconds = int(request["timeoutSeconds"])
    command = request["command"]
    stdout_path = directory / "stdout.log"
    stderr_path = directory / "stderr.log"
    meta = read_json(directory / "status.json")
    if (directory / "cancel.requested").exists():
        stdout_path.touch(mode=0o600, exist_ok=True)
        stderr_path.touch(mode=0o600, exist_ok=True)
        meta.update({
            "status": "cancelled",
            "finishedAt": iso_now(),
            "updatedAt": iso_now(),
        })
        write_json(directory / "status.json", meta)
        return
    with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
        child = subprocess.Popen(
            command,
            cwd=str(PROJECT),
            stdin=subprocess.DEVNULL,
            stdout=stdout,
            stderr=stderr,
            start_new_session=True,
            close_fds=True,
        )
        meta.update({"status": "running", "pid": child.pid, "startedAt": iso_now(), "updatedAt": iso_now()})
        write_json(directory / "status.json", meta)
        timed_out = False
        try:
            exit_code = child.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
            terminate_group(child.pid)
            try:
                exit_code = child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                kill_group(child.pid)
                exit_code = child.wait()

    cancelled = (directory / "cancel.requested").exists()
    status = "cancelled" if cancelled else "timed_out" if timed_out else "completed" if exit_code == 0 else "failed"
    meta = read_json(directory / "status.json")
    meta.update({
        "status": status,
        "exitCode": exit_code,
        "finishedAt": iso_now(),
        "updatedAt": iso_now(),
    })
    write_json(directory / "status.json", meta)


def status(operation_id: str, max_bytes: int) -> None:
    print(json.dumps(current_status(operation_dir(operation_id), max_bytes), ensure_ascii=False))


def cancel(operation_id: str, max_bytes: int) -> None:
    directory = operation_dir(operation_id)
    meta = read_json(directory / "status.json")
    if meta.get("status") not in TERMINAL:
        (directory / "cancel.requested").touch(mode=0o600, exist_ok=True)
        pid = meta.get("pid")
        if isinstance(pid, int) and pid > 1:
            terminate_group(pid)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            meta = read_json(directory / "status.json")
            if meta.get("status") in TERMINAL:
                break
            time.sleep(0.05)
    print(json.dumps(current_status(directory, max_bytes), ensure_ascii=False))


def list_operations() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    result = []
    for directory in sorted(ROOT.iterdir()):
        status_path = directory / "status.json"
        if directory.is_dir() and status_path.exists():
            result.append(read_json(status_path))
    print(json.dumps({"operations": result}, ensure_ascii=False))


def terminate_group(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass


def kill_group(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def main() -> None:
    if len(sys.argv) < 2:
        fail("usage: workspace-runner.py start|status|cancel|list ...")
    action = sys.argv[1]
    if action == "start" and len(sys.argv) == 4:
        start(sys.argv[2], int(sys.argv[3]))
    elif action == "supervise" and len(sys.argv) == 3:
        supervise(sys.argv[2])
    elif action in {"status", "cancel"} and len(sys.argv) in {3, 4}:
        max_bytes = int(sys.argv[3]) if len(sys.argv) == 4 else 200_000
        (status if action == "status" else cancel)(sys.argv[2], max_bytes)
    elif action == "list" and len(sys.argv) == 2:
        list_operations()
    else:
        fail("invalid runner arguments")


if __name__ == "__main__":
    main()
