#!/usr/bin/env python3
"""The sentinel must say so while people cannot get an answer.

2026-10-12 16:50-17:24 V answered nobody for half an hour and the Heartbeat
group heard nothing until the restart: the Worker pool had free slots, nothing
crashed, and stalled requests are only counted once the Gateway thread comes
back. From 13:59 the same day five chats had every message fail before the
agent for eight hours, also unreported. The lines below are shaped like the
real ones from that day.
"""
import calendar
import importlib.util
import json
import os
import re
import time
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location(
    "v_sentinel",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "v-sentinel", "sentinel.py"),
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

T0 = calendar.timegm((2026, 10, 12, 9, 7, 0, 0, 0, 0))  # 17:07:00 +08:00


def stamp(t):
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(t + 8 * 3600)) + ".685+08:00"


def liveness(t, degraded=64, elu="1"):
    return ("%s [diagnostic] liveness warning: reasons=event_loop_delay,event_loop_utilization,cpu "
            "interval=4s degradedFor=%ds eventLoopDelayP99Ms=2791.3 eventLoopDelayMaxMs=2791.3 "
            "eventLoopUtilization=%s cpuCoreRatio=2.708 active=22 waiting=0 queued=4 work=[]"
            % (stamp(t), degraded, elu))


def late(t, ms):
    return ("%s [diagnostic] liveness heartbeat delayed: overdue=%dms elapsed=%dms; "
            "deferring recovery decisions" % (stamp(t), ms, ms + 30000))


def dispatch_fail(t, chat):
    return ("%s [diagnostic] message dispatch completed: channel=feishu sessionId=unknown "
            "sessionKey=agent:makaron:feishu:group:%s source=replyResolver outcome=error duration=106ms "
            'error="Error: restart recovery claim changed before agent adoption"' % (stamp(t), chat))


def e2e(mid, sent_s, first_visible_s=None, dispatch_s=1):
    sent = int(sent_s * 1000)
    d = '"inboundMessageId":"%s","sentAtMs":%d,"dispatcherAtMs":%d' % (mid, sent, sent + dispatch_s * 1000)
    if first_visible_s is not None:
        d += ',"firstStatusPushAtMs":%d' % (sent + first_visible_s * 1000)
    return ('2026-10-12T17:10:47.326+08:00 [feishu] [firsttext-e2e.1] {"v":1,"sessionKey":'
            '"agent:makaron:feishu:group:oc_8e44fe52","chatId":"oc_8e44fe52",%s,"endAtMs":%d}' % (d, sent + 900000))


class Scanners(unittest.TestCase):
    def test_line_time_reads_the_gateway_stamp(self):
        self.assertEqual(mod.line_time(liveness(T0)), T0)
        self.assertIsNone(mod.line_time("[vlab-worker:1] no stamp here"))

    def test_saturation_needs_a_full_minute_pinned(self):
        j = "\n".join([liveness(T0), liveness(T0 + 60, degraded=45), liveness(T0 + 120, elu="0.6"),
                       late(T0 + 10, 2041), late(T0 + 20, 65212)])
        saturated, freezes = mod.scan_main_thread(j)
        self.assertEqual(saturated, [(T0, 64)])
        self.assertEqual(freezes, [(T0 + 20, 65212)], "only heartbeats at least 20 s late")

    def test_dispatch_failures_carry_the_conversation(self):
        out = mod.scan_dispatch_failures(dispatch_fail(T0, "oc_39d9f852"))
        self.assertEqual(out[0][1], "agent:makaron:feishu:group:oc_39d9f852")
        self.assertIn("restart recovery claim changed", out[0][2])

    def test_user_wait_is_first_thing_shown(self):
        out = mod.scan_user_waits("\n".join([e2e("m1", T0, 1091), e2e("m2", T0, None, dispatch_s=16)]))
        self.assertEqual(out[0][2], 1091)
        self.assertIsNone(out[1][2], "a silent turn has no first-visible time")
        self.assertEqual(out[1][3], 16)


def quiet_sample(**over):
    s = {"pool": 5, "active": "active", "nrestarts": "0", "gw_up_s": 9000, "closing": 0, "stall": 0,
         "complete": 3, "cutoff_ids": [], "cutoff_cause": "", "compact_fail": 0, "cutoff": 0, "received": 4,
         "worker_fail": 0, "worker_invalid": 0, "cfg_missing": {"main": [], "worker": []},
         "crash_lines": [], "journal_cursor": "c", "disk_mb": 90000, "mem_mb": 9000,
         "saturated": [], "freezes": [], "dispatch_fail": [], "waits": []}
    s.update(over)
    return s


class Rules(unittest.TestCase):
    def tick(self, state, now, sample):
        sent = []
        st = {"cfg_validated_at": now, "cfg_valid": {"main": (True, ""), "worker": (True, "")}}
        st.update(state)
        with mock.patch.object(mod, "sample", return_value=sample), \
                mock.patch.object(mod, "load_state", return_value=st), \
                mock.patch.object(mod, "save_state", side_effect=lambda s: state.update(s)), \
                mock.patch.object(mod, "feishu", side_effect=lambda text: sent.append(text) or True), \
                mock.patch.object(mod.time, "time", return_value=now), \
                mock.patch("builtins.print"):
            mod.main()
        return sent

    def test_sustained_saturation_alerts_before_anyone_restarts(self):
        state = {}
        # 17:07, 17:10, 17:12 on the day: the third warning is the alert.
        self.assertEqual(self.tick(state, T0 + 30, quiet_sample(saturated=[(T0, 65)])), [])
        self.assertEqual(self.tick(state, T0 + 190, quiet_sample(saturated=[(T0 + 180, 64)])), [])
        sent = self.tick(state, T0 + 320, quiet_sample(saturated=[(T0 + 300, 191)]))
        self.assertEqual(len(sent), 1)
        self.assertIn("主线程持续满负荷", sent[0])
        self.assertEqual(self.tick(state, T0 + 440, quiet_sample(saturated=[(T0 + 420, 70)])), [], "said once")
        sent = self.tick(state, T0 + 1400, quiet_sample())
        self.assertTrue(any("不再持续满负荷" in m for m in sent))

    def test_a_freeze_is_reported_at_once(self):
        sent = self.tick({}, T0 + 30, quiet_sample(freezes=[(T0 + 20, 65212)]))
        self.assertEqual(len(sent), 1)
        self.assertIn("卡住了 65 秒", sent[0])

    def test_conversations_failing_before_the_agent_are_named(self):
        state = {}
        fails = [(T0 + i * 60, "agent:makaron:feishu:group:oc_39d9f852", "Error: restart recovery claim changed")
                 for i in range(3)]
        sent = self.tick(state, T0 + 200, quiet_sample(dispatch_fail=fails))
        self.assertEqual(len(sent), 1)
        self.assertIn("group:oc_39d9f852", sent[0])
        self.assertIn("收不到任何回复", sent[0])
        more = [(T0 + 300, "agent:makaron:feishu:group:oc_39d9f852", "Error: restart recovery claim changed"),
                (T0 + 360, "agent:makaron:feishu:group:oc_39d9f852", "Error: restart recovery claim changed")]
        self.assertEqual(self.tick(state, T0 + 400, quiet_sample(dispatch_fail=more)), [], "not again within the hour")

    def test_one_failed_message_is_not_a_pattern(self):
        one = [(T0, "agent:makaron:feishu:direct:ou_1", "IngressAdoptionLostError")]
        self.assertEqual(self.tick({}, T0 + 60, quiet_sample(dispatch_fail=one)), [])

    def test_people_waiting_minutes_for_a_first_reaction(self):
        state = {}
        waits = [("m%d" % i, "agent:makaron:feishu:group:oc_%d" % i, 300 + i, 1) for i in range(3)]
        sent = self.tick(state, T0 + 60, quiet_sample(waits=waits))
        self.assertEqual(len(sent), 1)
        self.assertIn("用户在等", sent[0])

    def test_ordinary_slow_turns_stay_quiet(self):
        waits = [("m1", "k1", 130, 1), ("m2", "k2", 40, 2), ("m3", "k3", None, 1)]
        self.assertEqual(self.tick({}, T0 + 60, quiet_sample(waits=waits)), [])


ROOM = "agent:makaron:feishu:group:oc_a2a0room"


def a2a_e2e(sid, start_s, end_s, first_visible_s=None, busy=False, origin=True, run_id=True, msg_id=None):
    """The Feishu bridge's record of an inter-session turn (design §3.6 item 11):
    origin inter_session, the attempt number, the preset v-a2a- runId, the
    synthetic message id v-a2a-req-<sendId>-<n> (§2.c) and the attempt's own
    start as both send and receive time. Written only when the dispatch did not
    throw (M:5131-5140)."""
    start, end = int(start_s * 1000), int(end_s * 1000)
    d = {"v": 1, "sessionKey": ROOM, "chatId": "oc_a2a0room",
         "inboundMessageId": msg_id or "v-a2a-req-%s-0" % sid,
         "sentAtMs": start, "receivedAtMs": start, "dispatcherAtMs": start + 15, "endAtMs": end,
         "queuedFinal": not busy, "finalCount": 0 if busy else 1}
    if origin:
        d.update(origin="inter_session", attempt=0)
    if run_id and not busy:
        d["runId"] = "v-a2a-req-%s-0" % sid
    if first_visible_s is not None:
        d["firstStatusPushAtMs"] = start + first_visible_s * 1000
    return "%s [feishu] [firsttext-e2e.1] %s" % (stamp(end_s), json.dumps(d))


def failed(t, message_id, key=ROOM, error="Error: restart recovery claim changed before agent adoption"):
    """A dispatch that threw, as the core logs it: the dispatch line, then (same
    catch block, ms later) the processed line naming the message by MessageSid.
    Shaped like V's journal on 2026-10-20."""
    chat = key.rsplit(":", 1)[-1]
    return "\n".join([
        "%s [diagnostic] message dispatch completed: channel=feishu sessionId=unknown sessionKey=%s "
        'source=replyResolver outcome=error duration=91000ms error="%s"' % (stamp(t), key, error),
        "%s [diagnostic] message processed: channel=feishu chatId=chat:%s messageId=%s "
        "sessionId=7da00997-3bc2-40bf-a9ff-1cd153c43ff0 sessionKey=%s outcome=error duration=91003ms "
        'error="%s"' % (stamp(t), chat, message_id, key, error),
    ])


RELAY_SID = "v-a2a:req:s_mgk3x1a2f9c1:0"


class InterSession(unittest.TestCase):
    """sessions_send turns V starts in a room (docs/inter-session/design.md §6.6,
    WP11): nobody typed them, so they must not read as people waiting, as a
    conversation failing before the agent or as a stuck ingress claim. A room
    turn that breaks mid-answer is still a cut-off (v-sentinel-cutoff.test.py)."""

    def test_inter_session_turns_are_nobodys_wait(self):
        j = "\n".join([
            a2a_e2e("s_1", T0, T0 + 400, first_visible_s=300),          # waited in the room's queue
            a2a_e2e("s_2", T0, T0 + 1, busy=True),                     # BUSY attempt, nothing shown
            a2a_e2e("s_3", T0, T0 + 400, first_visible_s=300, origin=False),  # bridge without origin
            a2a_e2e("s_4", T0, T0 + 400, first_visible_s=300, run_id=False, msg_id="om_x"),  # origin only
            e2e("om_person", T0, 1091),
        ])
        waits = mod.scan_user_waits(j)
        self.assertEqual([w[0] for w in waits], ["om_person"])
        self.assertEqual(mod.count_inter_session_turns(j), 4)

    def test_a_relay_turns_own_failure_is_known_by_its_message_id(self):
        # The relay turn's dispatch threw: no [firsttext-e2e.1] record, only the
        # two core lines. The processed line names it by its MessageSid.
        j = "\n".join([
            failed(T0 + 29, RELAY_SID),
            failed(T0 + 29, "v-a2a-wake-b_mgk3x1a2f9c1-1", key="agent:makaron:feishu:direct:ou_tianyi"),
            failed(T0 + 200, "om_x100b625a1602cca0ded07f4bc483f44"),            # a person, same room
        ])
        people, relay = mod.split_dispatch_failures(j)
        self.assertEqual([(t - T0, k) for t, k, _ in people], [(200, ROOM)])
        self.assertEqual([(t - T0, k) for t, k, _ in relay],
                         [(29, ROOM), (29, "agent:makaron:feishu:direct:ou_tianyi")])
        self.assertEqual(mod.scan_dispatch_failures(j), people)
        # a dispatch line that itself names the relay's ids is left out on its own
        marked = failed(T0 + 300, "om_y", error="Error: run v-a2a-req-s_9-1 failed")
        self.assertEqual(mod.scan_dispatch_failures(marked), [])

    def test_a_person_failing_during_a_long_relay_turn_still_counts(self):
        # The relay turn ran T0-60 .. T0+600 in the room and finished normally; a
        # person's message there failed in the middle (the steer lane runs it
        # beside the turn). Nothing about the relay turn makes it the turn's own.
        j = "\n".join([
            failed(T0 + 100, "om_person_1"),
            failed(T0 + 160, "om_person_2"),
            a2a_e2e("s_1", T0 - 60, T0 + 600),
        ])
        people, relay = mod.split_dispatch_failures(j)
        self.assertEqual([t - T0 for t, _, _ in people], [100, 160])
        self.assertEqual(relay, [])
        sent = Rules.tick(self, {}, T0 + 620, quiet_sample(dispatch_fail=people))
        self.assertEqual(len(sent), 1)
        self.assertIn("oc_a2a0room", sent[0])

    def test_pairing_is_per_session_ordered_and_close_in_time(self):
        other = "agent:makaron:feishu:group:oc_other"
        dispatch_only = lambda t, key: failed(t, "x", key=key).split("\n")[0]
        processed_only = lambda t, mid, key: failed(t, mid, key=key).split("\n")[1]
        j = "\n".join([
            dispatch_only(T0, ROOM),                  # person, then relay, same room, same second
            processed_only(T0, "om_a", ROOM),
            dispatch_only(T0, ROOM),
            dispatch_only(T0, other),                 # interleaved with another session's pair
            processed_only(T0, RELAY_SID, ROOM),
            processed_only(T0, "om_b", other),
            dispatch_only(T0 + 50, ROOM),             # a processed line far later is not its pair
            processed_only(T0 + 60, RELAY_SID, ROOM),
            processed_only(T0 + 70, RELAY_SID, other),  # processed with nothing to pair (no dispatch line)
        ])
        people, relay = mod.split_dispatch_failures(j)
        self.assertEqual([(t - T0, k) for t, k, _ in people], [(0, ROOM), (0, other), (50, ROOM)])
        self.assertEqual([(t - T0, k) for t, k, _ in relay], [(0, ROOM)])

    def sample_of(self, journal):
        with mock.patch.object(mod, "sh", side_effect=lambda cmd, timeout=30: journal if "journalctl -u openclaw-gateway --since" in cmd else ""), \
                mock.patch.object(mod, "scan_crashes", return_value=([], "c")), \
                mock.patch.object(mod, "missing_plugin_paths", return_value=[]):
            return mod.sample()

    def test_a_busy_relay_evening_stays_quiet(self):
        # Three rooms each took over five minutes and two room turns failed in one
        # room: all relay traffic, so nothing a person is waiting on.
        lines = [a2a_e2e("s_%d" % i, T0 + i, T0 + 400 + i, first_visible_s=300) for i in range(3)]
        lines += [failed(T0 + 450, "v-a2a:req:s_8:0"), failed(T0 + 520, "v-a2a:req:s_9:2")]
        lines.append("%s [feishu] ingress: Channel ingress claim→adoption stalled for event "
                     "v-a2a-req-s_7-0 on lane chat:oc_a2a0room after 300002ms; applying retry policy "
                     "(handler-timeout)." % stamp(T0 + 540))
        s = self.sample_of("\n".join(lines))
        self.assertEqual((s["waits"], s["dispatch_fail"], s["ingress_stalled"]), ([], [], 0))
        self.assertEqual((s["a2a_turns"], len(s["a2a_dispatch_fail"])), (3, 2))
        keys = ("waits", "dispatch_fail", "a2a_dispatch_fail", "a2a_turns")
        sent = Rules.tick(self, {}, T0 + 600, quiet_sample(**{k: s[k] for k in keys}))
        self.assertEqual(sent, [])

    def test_the_same_journal_from_people_still_alerts(self):
        lines = [e2e("m%d" % i, T0 + i, 300) for i in range(3)]
        lines += [failed(T0 + 450, "om_1"), failed(T0 + 520, "om_2")]
        lines.append("%s [feishu] ingress: Channel ingress claim→adoption stalled for event 5e90 on lane "
                     "chat:oc_a2a0room after 300002ms; applying retry policy (handler-timeout)." % stamp(T0 + 540))
        s = self.sample_of("\n".join(lines))
        self.assertEqual((len(s["waits"]), len(s["dispatch_fail"]), s["ingress_stalled"]), (3, 2, 1))
        self.assertEqual((s["a2a_turns"], s["a2a_dispatch_fail"]), (0, []))
        keys = ("waits", "dispatch_fail", "a2a_dispatch_fail", "a2a_turns")
        sent = Rules.tick(self, {}, T0 + 600, quiet_sample(**{k: s[k] for k in keys}))
        self.assertEqual(len(sent), 2)
        self.assertTrue(any("用户在等" in m for m in sent))
        self.assertTrue(any("收不到任何回复" in m and "oc_a2a0room" in m for m in sent))

    def test_a_relay_failure_cut_by_the_window_edge_is_withdrawn(self):
        # The 180 s window ended between the relay turn's dispatch line and its
        # processed line, so it was kept as a person's. Windows overlap: the next
        # one has both lines and takes it back.
        dispatch_line, _ = failed(T0 + 10, RELAY_SID).split("\n")
        first = mod.split_dispatch_failures(dispatch_line)
        self.assertEqual((len(first[0]), first[1]), (1, []))
        state = {}
        self.assertEqual(Rules.tick(self, state, T0 + 60, quiet_sample(dispatch_fail=first[0])), [])
        second = mod.split_dispatch_failures("\n".join([failed(T0 + 10, RELAY_SID), failed(T0 + 130, "om_p")]))
        self.assertEqual(Rules.tick(self, state, T0 + 180, quiet_sample(dispatch_fail=second[0], a2a_dispatch_fail=second[1])),
                         [], "one failure of a person is not a pattern")
        self.assertEqual(list(state["dispatch_fail_events"]), ["%d|%s" % (T0 + 130, ROOM)])
        # control: a person's failure is never withdrawn
        state = {}
        Rules.tick(self, state, T0 + 60, quiet_sample(dispatch_fail=[(T0 + 10, ROOM, "Error: x")]))
        sent = Rules.tick(self, state, T0 + 180, quiet_sample(dispatch_fail=[(T0 + 130, ROOM, "Error: x")]))
        self.assertEqual(len(sent), 1)

    def test_a_person_failing_in_the_same_second_as_a_relay_turn_is_kept(self):
        # Same room, same second: both share the per-second event key; the
        # relay turn's withdrawal must not take the person's failure with it.
        people, relay = mod.split_dispatch_failures("\n".join([failed(T0 + 5, "om_p"), failed(T0 + 5, RELAY_SID)]))
        self.assertEqual((len(people), len(relay)), (1, 1))
        state = {}
        Rules.tick(self, state, T0 + 60, quiet_sample(dispatch_fail=people, a2a_dispatch_fail=relay))
        self.assertEqual(list(state["dispatch_fail_events"]), ["%d|%s" % (T0 + 5, ROOM)])

    def test_marks_match_the_relay_contracts_when_present(self):
        contracts = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "v-session-relay",
                                 "plugin", "core", "contracts.js")
        if not os.path.exists(contracts):
            self.skipTest("contracts.js (WP0) is not on this branch")
        src = open(contracts, encoding="utf-8").read()
        found = tuple(re.search(r'export const %s = "([^"]+)"' % n, src).group(1)
                      for n in ("V_A2A_PREFIX", "V_A2A_SID_PREFIX"))
        self.assertEqual(found, mod.A2A_MARKS)


if __name__ == "__main__":
    unittest.main()
