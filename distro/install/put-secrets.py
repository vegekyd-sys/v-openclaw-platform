#!/usr/bin/env python3
"""Put keys into /etc/v/secrets.env from stdin without showing them.

    <something that prints KEY=VALUE lines> | ssh <machine> 'sudo python3 <pkg>/install/put-secrets.py'
    sudo v-ctl put-secrets            (after the install; paste KEY=VALUE lines, then Ctrl-D)

Each KEY=VALUE line from stdin replaces that key in the file (or is added); every other line in the
file is kept. The file is root:root 0600. Only key names are printed, never values. Lines that are not
KEY=VALUE with a non-empty value, comments and `export ` prefixes are handled like the installer does.
Options: --file PATH (default /etc/v/secrets.env), --only NAME[,NAME...] (ignore other keys on stdin),
--rename OLD=NEW (store a key under the name this machine uses).
"""
import argparse
import os
import re
import sys
import tempfile

KEY = re.compile(r"^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$")


def parse(text):
    out = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = KEY.match(line)
        if not m:
            continue
        value = m.group(2).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        if value:
            out[m.group(1)] = value
    return out


def merge(existing_text, new):
    """New file text: same keys replaced in place, the rest appended; comments and other keys kept."""
    lines = existing_text.splitlines()
    done = set()
    for i, raw in enumerate(lines):
        m = KEY.match(raw.strip())
        if m and m.group(1) in new:
            lines[i] = f"{m.group(1)}={new[m.group(1)]}"
            done.add(m.group(1))
    report = {k: ("replaced" if k in done else "added") for k in new}
    lines += [f"{k}={v}" for k, v in new.items() if k not in done]
    return "\n".join(lines).rstrip("\n") + "\n", report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--file", default="/etc/v/secrets.env")
    ap.add_argument("--only", default="")
    ap.add_argument("--rename", action="append", default=[])
    a = ap.parse_args(argv)
    new = parse(sys.stdin.read())
    for r in a.rename:
        old, _, to = r.partition("=")
        if old in new and to:
            new[to] = new.pop(old)
    if a.only:
        keep = {k.strip() for k in a.only.split(",") if k.strip()}
        missing = sorted(keep - set(new))
        new = {k: v for k, v in new.items() if k in keep}
        if missing:
            print("not on stdin: " + ", ".join(missing), file=sys.stderr)
    if not new:
        print("no KEY=VALUE lines with a value on stdin; nothing written", file=sys.stderr)
        return 1
    d = os.path.dirname(a.file) or "."
    os.makedirs(d, mode=0o755, exist_ok=True)
    existing = open(a.file, encoding="utf-8").read() if os.path.exists(a.file) else ""
    text, report = merge(existing, new)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".secrets.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.chmod(tmp, 0o600)
        if os.geteuid() == 0:
            os.chown(tmp, 0, 0)
        os.replace(tmp, a.file)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    for k in sorted(report):
        print(f"{report[k]:8} {k}")
    st = os.stat(a.file)
    print(f"file     {a.file} mode {oct(st.st_mode & 0o777)[2:]} uid {st.st_uid}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
