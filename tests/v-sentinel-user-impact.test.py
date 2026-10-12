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
import os
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


if __name__ == "__main__":
    unittest.main()
