#!/usr/bin/env python3
"""Run V's memory indexer (or an OpenClaw CLI command) as the Gateway would.

The node binary, dist, user and environment come from the Gateway unit as systemd
resolves it (Environment= and EnvironmentFile= across all drop-ins, ExecStart=),
so this works while the Gateway is stopped and follows every release that changes
the unit. Nothing here holds a copy of a secret.

The environment is handed over with execve(), never as KEY=VALUE arguments: a process
command line is world-readable (ps, /proc/PID/cmdline) while its environment is not.
Until 2026-10-13 this ran `runuser -- env -i KEY=VALUE ...`, and the waiting runuser
showed every Gateway secret to every local user. The indexer itself is handed only the
unit's Environment= variables and the EnvironmentFile= variables its config refers to
(`${NAME}` substitutions and env SecretRefs). OpenClaw's loadConfig() then loads
~/.openclaw/.env and the config's env.vars into the process by itself, so most keys are
still in its environment, like the Gateway's: readable by openclaw and root only.

  v-memory-indexer-run.py [agent...]               real-time indexer (default makaron)
  v-memory-indexer-run.py --cli <openclaw args...>  e.g. --cli memory index --force --agent makaron
  DRY_RUN=1 ...                                    print what would run, run nothing
  GATEWAY_UNIT=<unit>                              default openclaw-gateway.service
"""
import json
import os
import pwd
import re
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
    """(environment, names set by Environment=) as the Gateway gets them."""
    env = {}
    for item in shlex.split(show("Environment")):
        key, _, value = item.partition("=")
        env[key] = value
    unit_names = set(env)
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
    return {k: v for k, v in env.items() if k not in DROP and not k.startswith(DROP_PREFIX)}, unit_names


SUBSTITUTION = re.compile(r"(?<!\$)\$\{([A-Z_][A-Z0-9_]*)\}")
ENV_SECRET_REF = re.compile(r'"source"\s*:\s*"env"[^{}]*?"id"\s*:\s*"([A-Za-z_][A-Za-z0-9_]*)"|"id"\s*:\s*"([A-Za-z_][A-Za-z0-9_]*)"[^{}]*?"source"\s*:\s*"env"')


def config_env_names(text):
    """Environment variables an OpenClaw config refers to: ${NAME} substitutions and
    {"source": "env", "id": NAME} SecretRefs."""
    names = set(SUBSTITUTION.findall(text))
    for a, b in ENV_SECRET_REF.findall(text):
        names.add(a or b)
    return names


def indexer_environment(env, unit_names):
    """The Gateway environment cut down to what the indexer's config can use."""
    path = env.get("OPENCLAW_CONFIG_PATH") or os.path.join(env.get("HOME", "/"), ".openclaw", "openclaw.json")
    with open(path, encoding="utf-8") as f:
        wanted = unit_names | config_env_names(f.read())
    return {k: v for k, v in env.items() if k in wanted}


INTEGRITY_NAMES = ("OPENCLAW_DB91_INTEGRITY_EPOCH", "OPENCLAW_DB91_INTEGRITY_DIR")


def gateway_integrity_environment():
    """The running Gateway's DB91 integrity epoch, as it hands it to its workers.

    Opening the agent database for writing runs the DB91 integrity check unless a proof
    from this Gateway boot (receipt in OPENCLAW_DB91_INTEGRITY_DIR, tagged with the epoch)
    still matches the file. The Gateway sets both variables for its workers only, so the
    indexer re-checked the whole database on every start: 164 s at 12 GB (2026-10-02),
    over 21 min at 21.8 GB under the unit's MemoryHigh=1G (2026-10-21, page cache evicted
    and re-read, 32 GB read). Read them from a Gateway child; none found, the indexer
    checks the database itself as before.
    """
    try:
        main = show("MainPID").strip()
    except (subprocess.CalledProcessError, OSError):
        return {}  # no systemd or no Gateway unit (CI, VLab candidates): check the DB as before
    if not main or main == "0":
        return {}
    for pid in sorted(p for p in os.listdir("/proc") if p.isdigit()):
        try:
            with open(f"/proc/{pid}/stat", encoding="utf-8", errors="replace") as f:
                ppid = f.read().rsplit(")", 1)[1].split()[1]
            if ppid != main:
                continue
            with open(f"/proc/{pid}/environ", "rb") as f:
                items = f.read().split(b"\0")
        except (OSError, IndexError):
            continue
        found = {}
        for item in items:
            key, _, value = item.decode("utf-8", "replace").partition("=")
            if key in INTEGRITY_NAMES and value:
                found[key] = value
        if len(found) == len(INTEGRITY_NAMES):
            return found
    return {}


def exec_as(user, command, env):
    """execve() the command as user with exactly env: the values never reach argv."""
    pw = pwd.getpwnam(user)
    os.chdir(env.get("HOME") or pw.pw_dir or "/")
    if os.geteuid() != pw.pw_uid:
        os.initgroups(user, pw.pw_gid)
        os.setgid(pw.pw_gid)
        os.setuid(pw.pw_uid)
    os.execve(command[0], command, env)


def gateway_node_and_dist():
    exec_start = show("ExecStart")
    argv = exec_start.split("argv[]=", 1)[1].split(" ;", 1)[0].split()
    entry = next(a for a in argv[1:] if a.endswith("/dist/index.js"))
    return argv[0], entry, os.path.dirname(entry)


def main():
    args = sys.argv[1:]
    node, entry, dist = gateway_node_and_dist()
    user = show("User").strip() or "root"
    env, unit_names = gateway_environment()
    if args[:1] == ["--cli"]:
        # An arbitrary CLI command (e.g. memory index --force) may need any provider key.
        command = [node, entry, *args[1:]]
    else:
        env = indexer_environment(env, unit_names)
        integrity = gateway_integrity_environment()
        env.update(integrity)
        print(f"v-memory-indexer-run: DB91 integrity epoch {'from the running Gateway' if integrity else 'not found; the indexer checks the database itself'}", file=sys.stderr, flush=True)
        env["OPENCLAW_DIST"] = dist
        command = [node, INDEXER, *(args or ["makaron"])]
    env.setdefault("PATH", "/usr/local/bin:/usr/bin:/bin")
    env.setdefault("LANG", "C.UTF-8")
    env["USER"] = env["LOGNAME"] = user
    if os.environ.get("DRY_RUN") == "1":
        print(f"would run as {user}: {' '.join(command)}")
        print(f"environment: {len(env)} variables, OPENCLAW_CONFIG_PATH={env.get('OPENCLAW_CONFIG_PATH')}, HOME={env.get('HOME')}")
        print(f"names: {' '.join(sorted(env))}")
        return
    exec_as(user, command, env)


if __name__ == "__main__":
    main()
