#!/usr/bin/env python3
"""ops/v-session-archive keeps V's unarchived sessions under the Workboard sweep window.

2026-11-18: makaron had 22,869 unarchived sessions (20,507 Night Shift
sub-agent rows) against a 10,000-session Workboard sweep. The job archives
finished, settled sub-agent sessions through sessions.patchMany and must never
touch a session a card can still use.
"""
import importlib.util
import json
import os
import sqlite3
import tempfile
import time
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", *rel))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


arc = load("v_session_archive", ("ops", "v-session-archive", "archive.py"))
sen = load("v_sentinel", ("scripts", "v-sentinel", "sentinel.py"))

DAY = 86400 * 1000
NOW = int(time.time() * 1000)


def make_state(sessions, cards):
    """sessions: (key, sid, status, updated_ms, last_activity_ms, archived_ms); cards: (session_key, exec_key, status, archived_ms)."""
    root = tempfile.mkdtemp()
    os.makedirs(os.path.join(root, "agents", "makaron", "agent"))
    os.makedirs(os.path.join(root, "plugins", "workboard"))
    a = sqlite3.connect(os.path.join(root, "agents", "makaron", "agent", "openclaw-agent.sqlite"))
    a.execute("CREATE TABLE session_nodes (session_key TEXT PRIMARY KEY, current_session_id TEXT, status TEXT,"
              " updated_at INTEGER, last_activity_at INTEGER, archived_at INTEGER)")
    a.executemany("INSERT INTO session_nodes VALUES (?,?,?,?,?,?)", sessions)
    a.commit(); a.close()
    w = sqlite3.connect(os.path.join(root, "plugins", "workboard", "workboard.sqlite"))
    w.execute("CREATE TABLE workboard_cards (id INTEGER PRIMARY KEY, session_key TEXT, execution_session_key TEXT,"
              " status TEXT, archived_at INTEGER)")
    w.executemany("INSERT INTO workboard_cards (session_key, execution_session_key, status, archived_at) VALUES (?,?,?,?)", cards)
    w.commit(); w.close()
    return root


def wb(n):
    return "agent:makaron:subagent:workboard-default-%04d" % n


OLD = NOW - 10 * DAY
SESSIONS = [
    (wb(1), "s1", "done", OLD, OLD, None),            # card done -> archive
    (wb(2), "s2", "timeout", OLD, None, None),         # card archived -> archive
    (wb(3), "s3", "done", OLD, OLD, None),             # card blocked -> keep (retry reuses session)
    (wb(4), "s4", "running", OLD, OLD, None),          # still running -> keep
    (wb(5), "s5", "done", NOW - DAY, NOW - DAY, None), # too recent -> keep
    (wb(6), "s6", "done", OLD, NOW - DAY, None),       # recent activity -> keep
    (wb(7), "s7", "done", OLD, OLD, OLD),              # already archived -> not selected
    (wb(8), "s8", "done", OLD, OLD, None),             # one done card + one ready card -> keep
    (wb(9), "s9", "done", OLD, OLD, None),             # no card -> keep
    ("agent:makaron:feishu:group:oc_x", "g", "done", OLD, OLD, None),  # not a sub-agent -> never
]
CARDS = [
    ("subagent:workboard-default-0001", None, "done", None),
    (None, wb(2), "blocked", OLD),
    (wb(3), None, "blocked", None),
    (wb(4), None, "running", None),
    (wb(5), None, "done", None),
    (wb(6), None, "done", None),
    (wb(8), None, "done", None),
    (wb(8), None, "ready", None),
]


class Selection(unittest.TestCase):
    def test_only_finished_settled_old_subagent_sessions(self):
        root = make_state(SESSIONS, CARDS)
        blockers = arc.card_blockers(os.path.join(root, "plugins", "workboard", "workboard.sqlite"))
        picked, skipped, unarchived, old = arc.select(
            os.path.join(root, "agents", "makaron", "agent", "openclaw-agent.sqlite"), blockers, NOW - 7 * DAY, 0)
        self.assertEqual([k for k, _ in picked], [wb(1), wb(2)])
        self.assertEqual(dict(picked)[wb(2)], "s2", "expectedSessionId comes from current_session_id")
        self.assertEqual(skipped, {"status": 1, "card_open": 2, "no_card": 1})
        self.assertEqual(unarchived, 9)
        self.assertEqual(old, 6)

    def test_dry_run_writes_nothing(self):
        root = make_state(SESSIONS, CARDS)
        with mock.patch.object(arc, "call") as call, mock.patch("builtins.print"):
            self.assertEqual(arc.main(["--state-root", root, "--state-dir", os.path.join(root, "st")]), 0)
        call.assert_not_called()
        self.assertFalse(os.path.exists(os.path.join(root, "st")))


class Apply(unittest.TestCase):
    def run_apply(self, outcomes_fn, extra=()):
        root = make_state([(wb(100 + i), "s%d" % i, "done", OLD - i, OLD, None) for i in range(7)],
                          [(wb(100 + i), None, "done", None) for i in range(7)])
        calls = []

        def fake_call(cli, method, params, timeout_ms):
            calls.append((method, params))
            return outcomes_fn(len(calls), params)

        with mock.patch.object(arc, "call", side_effect=fake_call), \
                mock.patch.object(arc, "gateway_cli", return_value=("node", "index.js")), \
                mock.patch.object(arc.time, "sleep"), mock.patch("builtins.print"):
            rc = arc.main(["--apply", "--state-root", root, "--state-dir", os.path.join(root, "st"),
                           "--batch", "3", *extra])
        with open(os.path.join(root, "st", "last-run.json")) as f:
            return rc, calls, json.load(f)

    def test_batches_through_patch_many_oldest_first(self):
        ok = lambda n, p: ({"outcomes": [{"ok": True, "key": t["key"]} for t in p["targets"]]}, 0.5, "")
        rc, calls, summary = self.run_apply(ok)
        self.assertEqual(rc, 0)
        self.assertEqual([len(p["targets"]) for _, p in calls], [3, 3, 1])
        self.assertTrue(all(m == "sessions.patchMany" and p["patch"] == {"archived": True} for m, p in calls))
        self.assertEqual(calls[0][1]["targets"][0], {"key": wb(106), "agentId": "makaron", "expectedSessionId": "s6"})
        self.assertEqual((summary["archived"], summary["failed"], summary["stopped"]), (7, 0, None))

    def test_per_target_errors_are_counted_not_fatal(self):
        def some_fail(n, p):
            return ({"outcomes": [{"ok": False, "key": t["key"], "error": {"message": "Session %s is still active; retry the archive." % t["key"]}}
                                  if i == 0 else {"ok": True, "key": t["key"]} for i, t in enumerate(p["targets"])]}, 0.5, "")
        rc, calls, summary = self.run_apply(some_fail)
        self.assertEqual((summary["archived"], summary["failed"]), (4, 3))
        self.assertEqual(summary["errors"], {"Session <key> is still active; retry the archive.": 3})

    def test_stops_on_failed_call(self):
        rc, calls, summary = self.run_apply(lambda n, p: (None, 10.0, "gateway closed"))
        self.assertEqual(len(calls), 1)
        self.assertEqual(rc, 1)
        self.assertIn("gateway closed", summary["stopped"])

    def test_stops_when_gateway_gets_slow(self):
        slow = lambda n, p: ({"outcomes": [{"ok": True, "key": t["key"]} for t in p["targets"]]}, 20.0, "")
        rc, calls, summary = self.run_apply(slow)
        self.assertEqual(len(calls), 1)
        self.assertEqual(summary["stopped"], "slow call 20.0s")

    def test_max_per_run_caps_the_backlog(self):
        ok = lambda n, p: ({"outcomes": [{"ok": True, "key": t["key"]} for t in p["targets"]]}, 0.5, "")
        rc, calls, summary = self.run_apply(ok, ("--max-per-run", "4"))
        self.assertEqual(summary["archived"], 4)


class SentinelRule(unittest.TestCase):
    def test_counts_unarchived_rows_read_only(self):
        root = make_state(SESSIONS, CARDS)
        with mock.patch.object(sen, "SESSION_STORES_ROOT", os.path.join(root, "agents")):
            self.assertEqual(sen.count_unarchived_sessions(), [("makaron", 9)])

    def test_fires_above_8000_and_recovers(self):
        state = {}
        base = {"pool": 5, "active": "active", "nrestarts": "0", "gw_up_s": 9000, "closing": 0, "stall": 0,
                "complete": 3, "cutoff_ids": [], "cutoff_cause": "", "compact_fail": 0, "cutoff": 0, "received": 4,
                "worker_fail": 0, "worker_invalid": 0, "cfg_missing": {"main": [], "worker": []},
                "crash_lines": [], "disk_mb": 90000, "mem_mb": 9000, "saturated": [], "freezes": [],
                "dispatch_fail": [], "waits": [], "ingress_stalled": 0, "budget_exhausted": 0}

        def tick(now, counts):
            sent = []
            st = {"cfg_validated_at": now, "cfg_valid": {"main": (True, ""), "worker": (True, "")}}
            st.update(state)
            with mock.patch.object(sen, "sample", return_value=dict(base, journal_cursor="c")), \
                    mock.patch.object(sen, "load_state", return_value=st), \
                    mock.patch.object(sen, "save_state", side_effect=lambda s: state.update(s)), \
                    mock.patch.object(sen, "feishu", side_effect=lambda t: sent.append(t) or True), \
                    mock.patch.object(sen, "measure_session_budgets", return_value=[]), \
                    mock.patch.object(sen, "count_unarchived_sessions", return_value=counts), \
                    mock.patch.object(sen.time, "time", return_value=now), mock.patch("builtins.print"):
                sen.main()
            return sent

        t0 = 1794960000
        self.assertEqual(tick(t0, [("makaron", 6800)]), [])
        sent = tick(t0 + 700, [("makaron", 8100)])
        self.assertTrue(any("未归档会话超过 8000" in m and "makaron 8100" in m for m in sent))
        self.assertEqual(tick(t0 + 1400, [("makaron", 8200)]), [], "latched")
        self.assertTrue(any("回到 8000 以下" in m for m in tick(t0 + 2100, [("makaron", 6900)])))


if __name__ == "__main__":
    unittest.main()
