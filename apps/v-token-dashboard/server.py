"""Serve V Platform's private token dashboard on loopback with an atomic snapshot."""
import argparse
import datetime as dt
import gzip
import json
import os
import shlex
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
BEIJING = dt.timezone(dt.timedelta(hours=8))
FILES = {"/": ("index.html", "text/html; charset=utf-8"),
         "/ui.js": ("ui.js", "text/javascript; charset=utf-8"),
         "/style.css": ("style.css", "text/css; charset=utf-8")}


class Snapshot:
    def __init__(self, directory, days):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.file = directory / "snapshot.json.gz"
        self.days = days
        self.lock = threading.Lock()
        self.error = None

    def refresh(self):
        if not self.lock.acquire(blocking=False):
            return
        threading.Thread(target=self.collect, daemon=True).start()

    def collect(self):
        try:
            end = int(time.time())
            today = dt.datetime.fromtimestamp(end, BEIJING).date()
            first_day = today - dt.timedelta(days=self.days - 1)
            start = int(dt.datetime.combine(first_day, dt.time(), BEIJING).timestamp())
            command = f"cd /tmp && sudo -n -H -u openclaw nice -n 12 python3 - {start} {end}"
            with (HERE / "collect.py").open("rb") as source:
                result = subprocess.run(["ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "v", command],
                                        stdin=source, capture_output=True, check=True, timeout=1800)
            program = (HERE / "people.py").read_text()
            enriched = subprocess.run(["ssh", "-T", "-o", "BatchMode=yes", "v",
                                       "cd /tmp && sudo -n -H -u openclaw python3 -c " + shlex.quote(program)],
                                      input=result.stdout, capture_output=True, check=True, timeout=900)
            data = json.loads(gzip.decompress(enriched.stdout))
            if data["start"] != start or data["end"] != end or not isinstance(data["rows"], list):
                raise ValueError("snapshot failed validation")
            if self.file.exists():
                previous = json.loads(gzip.decompress(self.file.read_bytes()))
                for identity in {row[2] for row in data["rows"]}:
                    source = previous.get("nameSources", {}).get(identity)
                    if source in ("飞书通讯录", "飞书群成员") and identity not in data["names"]:
                        data["names"][identity] = previous["names"][identity]
                        data["nameSources"][identity] = source
            with tempfile.NamedTemporaryFile(dir=self.file.parent, delete=False) as out:
                out.write(gzip.compress(json.dumps(data, ensure_ascii=False).encode()))
            os.replace(out.name, self.file)
            self.error = None
        except (OSError, ValueError, subprocess.SubprocessError, KeyError) as exc:
            self.error = f"采集失败（{type(exc).__name__}）。请检查 ssh v 和只读数据源后刷新。"
            print(self.error, flush=True)
        finally:
            self.lock.release()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, content, mime="application/json", gzip_encoded=False):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'")
        self.send_header("Content-Length", str(len(content)))
        if gzip_encoded:
            self.send_header("Content-Encoding", "gzip")
        self.end_headers()
        self.wfile.write(content)

    def local_request(self):
        hosts = (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}")
        if self.headers.get("Host") not in hosts:
            self.reply(403, b"{}")
            return False
        return True

    def do_GET(self):
        if not self.local_request():
            return
        state = self.server.snapshot
        if self.path == "/api/status":
            self.reply(200, json.dumps(dict(busy=state.lock.locked(), error=state.error,
                                           ready=state.file.is_file())).encode())
        elif self.path == "/api/usage" and state.file.is_file():
            self.reply(200, state.file.read_bytes(), gzip_encoded=True)
        elif self.path == "/favicon.ico":
            self.reply(204, b"", "image/x-icon")
        elif self.path == "/v-brand.webp" and (state.file.parent / "v-brand.webp").is_file():
            self.reply(200, (state.file.parent / "v-brand.webp").read_bytes(), "image/webp")
        elif self.path in FILES:
            name, mime = FILES[self.path]
            self.reply(200, (HERE / name).read_bytes(), mime)
        else:
            self.reply(404, b"{}")

    def do_POST(self):
        if not self.local_request():
            return
        if self.path != "/api/refresh" or self.headers.get("Origin") != "http://" + self.headers["Host"]:
            self.reply(403, b"{}")
            return
        self.server.snapshot.refresh()
        self.reply(202, b"{}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4386)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--data", type=Path, default=Path.home() / ".local/state/v-token-dashboard")
    args = parser.parse_args()
    if args.days < 1:
        parser.error("--days must be positive")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.snapshot = Snapshot(args.data, args.days)
    if not server.snapshot.file.exists():
        server.snapshot.refresh()
    print(f"V Token 用量 http://127.0.0.1:{server.server_port}", flush=True)
    server.serve_forever()
