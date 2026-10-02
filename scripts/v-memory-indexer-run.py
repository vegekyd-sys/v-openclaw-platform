#!/usr/bin/env python3
"""Run V's memory indexer (or an OpenClaw CLI command) as the Gateway would.

The node binary, dist, user and environment come from the Gateway unit as systemd
resolves it (Environment= and EnvironmentFile= across all drop-ins, ExecStart=),
so this works while the Gateway is stopped and follows every release that changes
the unit. Nothing here holds a copy of a secret.

  v-memory-indexer-run.py [agent...]               real-time indexer (default makaron)
  v-memory-indexer-run.py --cli <openclaw args...>  e.g. --cli memory index --force --agent makaron
  DRY_RUN=1 ...                                    print what would run, run nothing
  GATEWAY_UNIT=<unit>                              default openclaw-gateway.service
"""
import os
import shlex
import subprocess
import sys

UNIT = os.environ.get("GATEWAY_UNIT", "openclaw-gateway.service")
INDEXER = os.path.join(os.path.dirname(os.path.realpath(__file__)), "v-memory-indexer.mjs")
# Variables that would make the child talk to, or pose as, the Gateway service.
DROP = {"OPENCLAW_GATEWAY_PORT", "OPENCLAW_SYSTEMD_UNIT", "NODE_OPTIONS"}
DROP_PREFIX = ("OPENCLAW_SERVICE_",)


def show(prop):
    return subprocess.run(["systemctl", "show", UNIT, "-p", prop, "--value"], check=True, capture_output=True, text=True).stdout


def read_env_file(path):
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(("#", ";")) or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip().removeprefix("export ").strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            env[key] = value
    return env


def gateway_environment():
    env = {}
    for item in shlex.split(show("Environment")):
        key, _, value = item.partition("=")
        env[key] = value
    # systemd applies EnvironmentFile= after Environment=; later files win.
    for line in show("EnvironmentFiles").splitlines():
        path, _, flags = line.strip().partition(" ")
        if not path:
            continue
        try:
            env.update(read_env_file(path))
        except FileNotFoundError:
            if "ignore_errors=yes" not in flags:
                raise
    return {k: v for k, v in env.items() if k not in DROP and not k.startswith(DROP_PREFIX)}


def gateway_node_and_dist():
    exec_start = show("ExecStart")
    argv = exec_start.split("argv[]=", 1)[1].split(" ;", 1)[0].split()
    entry = next(a for a in argv[1:] if a.endswith("/dist/index.js"))
    return argv[0], entry, os.path.dirname(entry)


def main():
    args = sys.argv[1:]
    node, entry, dist = gateway_node_and_dist()
    user = show("User").strip() or "root"
    env = gateway_environment()
    env.setdefault("PATH", "/usr/local/bin:/usr/bin:/bin")
    env.setdefault("LANG", "C.UTF-8")
    env["USER"] = env["LOGNAME"] = user
    if args[:1] == ["--cli"]:
        command = [node, entry, *args[1:]]
    else:
        env["OPENCLAW_DIST"] = dist
        command = [node, INDEXER, *(args or ["makaron"])]
    if os.environ.get("DRY_RUN") == "1":
        print(f"would run as {user}: {' '.join(command)}")
        print(f"environment: {len(env)} variables, OPENCLAW_CONFIG_PATH={env.get('OPENCLAW_CONFIG_PATH')}, HOME={env.get('HOME')}")
        return
    cwd = env.get("HOME", "/")
    os.chdir(cwd)
    os.execvpe("runuser", ["runuser", "-u", user, "--", "env", "-i", *[f"{k}={v}" for k, v in env.items()], *command], os.environ)


if __name__ == "__main__":
    main()
