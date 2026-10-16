#!/usr/bin/env python3
"""Find secrets on process command lines. Prints names, never values.

A command line is readable by every local user (ps, /proc/PID/cmdline). This takes
the values of every Gateway EnvironmentFile= (and any --env-file given) and reports
each process whose argv contains one of them, or a KEY=VALUE argument naming one.
Exit 1 if anything is found. Run as root (the env files are 0600).

  v-cmdline-secret-scan.py [--env-file PATH ...] [--proc /proc]
  GATEWAY_UNIT=<unit>   default openclaw-gateway.service

On 2026-10-13 v-memory-indexer's runuser showed 60 Gateway keys this way.
"""
import argparse
import importlib.util
import os
import pwd
import re
import subprocess
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.realpath(__file__))
spec = importlib.util.spec_from_file_location("runner", os.path.join(HERE, "v-memory-indexer-run.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

# Values are matched only for names that look like credentials and only when long
# enough: regions, hosts, ports and ids are not secret and match innocent arguments.
MIN_VALUE_LENGTH = 12
SECRET_NAME = re.compile(r"KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|APPCODE|ACCOUNT", re.I)


def gateway_env_files():
    unit = os.environ.get("GATEWAY_UNIT", "openclaw-gateway.service")
    out = subprocess.run(["systemctl", "show", unit, "-p", "EnvironmentFiles", "--value"], capture_output=True, text=True).stdout
    return [line.split(" ", 1)[0] for line in out.splitlines() if line.strip()]


def secrets_from(paths):
    secrets = {}
    for path in paths:
        try:
            for key, value in runner.read_env_file(path).items():
                secrets.setdefault(key, set()).add(value)
        except FileNotFoundError:
            pass
    return secrets


def unit_of(proc, pid):
    try:
        with open(os.path.join(proc, pid, "cgroup")) as f:
            return f.read().strip().splitlines()[-1].rsplit("/", 1)[-1]
    except OSError:
        return "?"


def scan(proc, secrets):
    by_value = [(v, k) for k, vs in secrets.items() for v in vs if len(v) >= MIN_VALUE_LENGTH and SECRET_NAME.search(k)]
    findings = []
    for pid in sorted((p for p in os.listdir(proc) if p.isdigit()), key=int):
        try:
            with open(os.path.join(proc, pid, "cmdline"), "rb") as f:
                argv = [a.decode("utf-8", "replace") for a in f.read().split(b"\0") if a]
            uid = os.stat(os.path.join(proc, pid)).st_uid
        except OSError:
            continue
        names = set()
        for arg in argv:
            key, eq, _ = arg.partition("=")
            if eq and key in secrets:
                names.add(key)
            names.update(k for v, k in by_value if v in arg)
        if names:
            try:
                user = pwd.getpwuid(uid).pw_name
            except KeyError:
                user = str(uid)
            exe = os.path.basename(argv[0]) if argv else "?"
            findings.append((pid, unit_of(proc, pid), user, exe, sorted(names)))
    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env-file", action="append", default=[])
    ap.add_argument("--proc", default="/proc")
    a = ap.parse_args()
    files = a.env_file or gateway_env_files()
    secrets = secrets_from(files)
    if not secrets:
        print(f"no secrets read from {len(files)} env file(s); run as root", file=sys.stderr)
        return 2
    findings = scan(a.proc, secrets)
    for pid, unit, user, exe, names in findings:
        print(f"LEAK pid={pid} unit={unit} user={user} exe={exe} names={' '.join(names)}")
    print(f"scanned with {sum(len(v) for v in secrets.values())} values from {len(files)} env file(s): {len(findings)} process(es) leaking")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
