#!/usr/bin/env python3
"""Offline tests for scripts/v-codex-orphan-cleanup.py against a fake /proc and a temp database."""
import importlib.util
import json
import os
import sqlite3
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("cleanup", os.path.join(HERE, "..", "scripts", "v-codex-orphan-cleanup.py"))
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)

BOOT = "2566c41c-a141-4688-8203-52bfdc274972"


def fake_proc(root, procs):
    os.makedirs(os.path.join(root, "sys/kernel/random"))
    with open(os.path.join(root, "sys/kernel/random/boot_id"), "w") as f:
        f.write(BOOT + "\n")
    for pid, ticks, comm in procs:
        os.makedirs(os.path.join(root, str(pid)))
        rest = " ".join(["S", "1", str(pid), str(pid), "0", "-1", "4194560"] + ["0"] * 12 + [str(ticks), "0"])
        with open(os.path.join(root, str(pid), "stat"), "w") as f:
            f.write(f"{pid} ({comm}) {rest}\n")


def row(parent, pticks, child, cticks, boot=BOOT):
    return json.dumps({"parent": {"pid": parent, "pgid": parent, "startedAt": f"{boot}:{pticks}"},
                       "child": {"pid": child, "pgid": child, "startedAt": f"{boot}:{cticks}", "commandFingerprint": "x"}})


def setup(rows):
    d = tempfile.mkdtemp()
    db = os.path.join(d, "openclaw.sqlite")
    con = sqlite3.connect(db)
    con.execute("create table plugin_state_entries (plugin_id text, namespace text, entry_key text, value_json text)")
    for i, (plugin, ns, value) in enumerate(rows):
        con.execute("insert into plugin_state_entries values (?,?,?,?)", (plugin, ns, f"k{i}", value))
    con.commit(); con.close()
    return d, db


def remaining(db):
    con = sqlite3.connect(db)
    out = [json.loads(v) if v.startswith("{") else v for (v,) in con.execute("select value_json from plugin_state_entries order by rowid")]
    con.close()
    return out


def test_removes_only_rows_whose_processes_are_all_gone():
    d, db = setup([
        ("codex", "app-server-processes", row(100, 5000, 101, 5001)),   # both dead: remove
        ("codex", "app-server-processes", row(200, 6000, 201, 6001)),   # parent alive: keep
        ("codex", "app-server-processes", row(300, 7000, 301, 7001)),   # parent dead, child alive: keep (real orphan)
        ("codex", "other-namespace", row(100, 5000, 101, 5001)),        # other namespace: untouched
        ("browser", "app-server-processes", row(100, 5000, 101, 5001)), # other plugin: untouched
    ])
    proc = os.path.join(d, "proc")
    fake_proc(proc, [(200, 6000, "node"), (301, 7001, "codex app (server)")])
    out = cleanup.main(["--db", db, "--proc", proc])
    assert out["checked"] == 3 and out["stale"] == 1 and out["removed"] == 1, out
    assert out["keptAliveParent"] == 1 and out["keptAliveChild"] == 1, out
    assert out["stalePids"] == [[100, 101]], out
    left = remaining(db)
    assert len(left) == 4 and all(r["parent"]["pid"] != 100 for r in left[:2]), left


def test_reused_pid_with_other_start_time_counts_as_gone():
    # pid 100 exists again but is a different process (different starttime / boot)
    d, db = setup([("codex", "app-server-processes", row(100, 5000, 101, 5001)),
                   ("codex", "app-server-processes", row(400, 9000, 401, 9001, boot="old-boot"))])
    proc = os.path.join(d, "proc")
    fake_proc(proc, [(100, 77777, "node"), (101, 88888, "codex"), (400, 9000, "node"), (401, 9001, "codex")])
    out = cleanup.main(["--db", db, "--proc", proc])
    assert out["removed"] == 2, out
    assert remaining(db) == []


def test_dry_run_and_missing_db_never_fail():
    d, db = setup([("codex", "app-server-processes", row(100, 5000, 101, 5001))])
    proc = os.path.join(d, "proc")
    fake_proc(proc, [])
    out = cleanup.main(["--db", db, "--proc", proc, "--dry-run"])
    assert out["stale"] == 1 and out["removed"] == 0, out
    assert len(remaining(db)) == 1
    out = cleanup.main(["--db", os.path.join(d, "missing.sqlite"), "--proc", proc])
    assert out.get("skipped") == "no state database" and "error" not in out, out
    out = cleanup.main(["--db", db, "--proc", os.path.join(d, "no-proc")])
    assert "error" in out, out  # reported on stdout, not raised


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print("ok", name)
