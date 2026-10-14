#!/usr/bin/env python3
"""Offline tests for scripts/v-memory-indexer-run.py: no secret reaches a command line.

A fake systemctl describes a Gateway unit whose EnvironmentFile holds third-party keys
and whose config refers to two of them; a fake node records the argv and environment it
was exec'd with. On V the old runner showed every Gateway key in `ps` (2026-10-13).
"""
import getpass
import importlib.util
import json
import os
import stat
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, "..", "scripts", "v-memory-indexer-run.py")
spec = importlib.util.spec_from_file_location("runner", RUNNER)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

SECRETS = {
    "GOOGLE_API_KEY": "fake-google-0001",
    "UNIVERSAL_MEMORY_KEY": "fake-umem-0002",
    "SLACK_BOT_TOKEN": "fake-slack-0003",
    "TENCENTCLOUD_SECRET_KEY": "fake-tencent-0004",
    "SUPABASE_SERVICE_ROLE_KEY": "fake-supabase-0005",
    "META_ACCESS_TOKEN": "fake-meta-0006",
}
CONFIG = {
    "memory": {"search": {"remote": {"apiKey": "${GOOGLE_API_KEY}"}}},
    "mcp": {"servers": {"universal-memory": {"headers": {"Authorization": "Bearer ${UNIVERSAL_MEMORY_KEY}"}}}},
    "channels": {"slack": {"botToken": {"source": "env", "provider": "default", "id": "SLACK_BOT_TOKEN"}}},
    "notes": "literal $${META_ACCESS_TOKEN} is escaped, not a reference",
}


def write(path, text, mode=0o644):
    with open(path, "w") as f:
        f.write(text)
    os.chmod(path, mode)


def fixture():
    d = tempfile.mkdtemp()
    home = os.path.join(d, "home")
    os.makedirs(home)
    config = os.path.join(home, "openclaw.json")
    write(config, json.dumps(CONFIG, indent=2))
    envfile = os.path.join(d, "gateway.env")
    write(envfile, "".join(f"{k}={v}\n" for k, v in SECRETS.items()), 0o600)
    record = os.path.join(d, "exec.json")
    # The fake node records what it was started with, then exits.
    node = os.path.join(d, "node")
    write(node, f"#!{sys.executable}\nimport json, os, sys\njson.dump({{'argv': sys.argv, 'env': dict(os.environ), 'cwd': os.getcwd()}}, open({record!r}, 'w'))\n", 0o755)
    bin_dir = os.path.join(d, "bin")
    os.makedirs(bin_dir)
    props = {
        "Environment": f"HOME={home} OPENCLAW_CONFIG_PATH={config} OPENCLAW_GATEWAY_PORT=18789 OPENCLAW_SERVICE_KIND=gateway NODE_OPTIONS=--max-old-space-size=1 V_RELEASE_VERSION=test",
        "EnvironmentFiles": f"{envfile} (ignore_errors=no)\n{d}/missing.env (ignore_errors=yes)",
        "ExecStart": f"{{ path={node} ; argv[]={node} {d}/dist/index.js gateway --port 18789 ; ignore_errors=no }}",
        "User": getpass.getuser(),
    }
    write(os.path.join(bin_dir, "systemctl"), f"#!{sys.executable}\nimport sys\nprops = {props!r}\nprint(props[sys.argv[sys.argv.index('-p') + 1]])\n", 0o755)
    return d, bin_dir, record


def run(args, extra_env=None):
    d, bin_dir, record = fixture()
    env = {"PATH": f"{bin_dir}:/usr/bin:/bin", **(extra_env or {})}
    p = subprocess.run([sys.executable, RUNNER, *args], env=env, capture_output=True, text=True, timeout=30)
    assert p.returncode == 0, p.stderr
    if extra_env and extra_env.get("DRY_RUN") == "1":
        return p.stdout, None
    with open(record) as f:
        return p.stdout, json.load(f)


def assert_no_secret_on_command_line(argv):
    for arg in argv:
        assert not any(v in arg for v in SECRETS.values()), f"secret value on the command line: {arg[:20]}..."
        assert not any(arg.startswith(k + "=") for k in SECRETS), f"secret name on the command line: {arg[:20]}..."


def test_config_env_names():
    names = runner.config_env_names(json.dumps(CONFIG, indent=2))
    assert names == {"GOOGLE_API_KEY", "UNIVERSAL_MEMORY_KEY", "SLACK_BOT_TOKEN"}, names
    # id before source, compact JSON
    assert runner.config_env_names('{"id":"A_KEY","provider":"default","source":"env"}') == {"A_KEY"}
    # a file SecretRef is not an environment variable
    assert runner.config_env_names('{"source":"file","provider":"f","id":"/x"}') == set()


def test_indexer_gets_only_what_its_config_uses():
    _, rec = run(["makaron"])
    assert_no_secret_on_command_line(rec["argv"])
    assert rec["argv"][1].endswith("v-memory-indexer.mjs") and rec["argv"][2:] == ["makaron"], rec["argv"]
    env = rec["env"]
    for name in ("GOOGLE_API_KEY", "UNIVERSAL_MEMORY_KEY", "SLACK_BOT_TOKEN"):
        assert env.get(name) == SECRETS[name], name
    for name in ("TENCENTCLOUD_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "META_ACCESS_TOKEN"):
        assert name not in env, f"{name} handed to the indexer"
    for name in ("OPENCLAW_GATEWAY_PORT", "OPENCLAW_SERVICE_KIND", "NODE_OPTIONS"):
        assert name not in env, f"{name} would make the indexer pose as the Gateway"
    assert env["V_RELEASE_VERSION"] == "test" and env["OPENCLAW_DIST"].endswith("/dist")
    assert env["USER"] == env["LOGNAME"] == getpass.getuser()
    assert os.path.realpath(rec["cwd"]) == os.path.realpath(env["HOME"])


def test_cli_keeps_the_full_environment_off_the_command_line():
    _, rec = run(["--cli", "memory", "index", "--agent", "makaron"])
    assert_no_secret_on_command_line(rec["argv"])
    assert rec["argv"][1].endswith("/dist/index.js") and rec["argv"][2:] == ["memory", "index", "--agent", "makaron"]
    for name, value in SECRETS.items():
        assert rec["env"].get(name) == value, name
    assert "OPENCLAW_GATEWAY_PORT" not in rec["env"]


def test_dry_run_prints_names_not_values():
    out, _ = run(["makaron"], {"DRY_RUN": "1"})
    assert "GOOGLE_API_KEY" in out and "TENCENTCLOUD_SECRET_KEY" not in out
    assert not any(v in out for v in SECRETS.values()), "dry run printed a secret value"


def test_no_env_dash_i_or_runuser_left():
    with open(RUNNER) as f:
        source = f.read()
    assert '"runuser"' not in source and '"-i"' not in source


def test_cmdline_secret_scan_reports_names_only():
    spec = importlib.util.spec_from_file_location("scan", os.path.join(HERE, "..", "scripts", "v-cmdline-secret-scan.py"))
    scan = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scan)
    proc = tempfile.mkdtemp()
    procs = {
        "101": ["runuser", "-u", "openclaw", "--", "env", "-i", "HOME=/home/openclaw", f"META_ACCESS_TOKEN={SECRETS['META_ACCESS_TOKEN']}", "node", "x.mjs"],
        "102": ["curl", "-H", f"Authorization: Bearer {SECRETS['SUPABASE_SERVICE_ROLE_KEY']}", "https://example.invalid"],
        "103": ["node", "/opt/v-sentinel/v-memory-indexer.mjs", "makaron"],
        "104": ["postgres", "-c", "config_file=/etc/postgresql/16/main/postgresql.conf"],
    }
    for pid, argv in procs.items():
        os.makedirs(os.path.join(proc, pid))
        with open(os.path.join(proc, pid, "cmdline"), "wb") as f:
            f.write(b"\0".join(a.encode() for a in argv) + b"\0")
        with open(os.path.join(proc, pid, "cgroup"), "w") as f:
            f.write(f"0::/system.slice/unit-{pid}.service\n")
    secrets = {k: {v} for k, v in SECRETS.items()}
    found = {pid: names for pid, _, _, _, names in scan.scan(proc, secrets)}
    assert found == {"101": ["META_ACCESS_TOKEN"], "102": ["SUPABASE_SERVICE_ROLE_KEY"]}, found


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("ok", t.__name__)
