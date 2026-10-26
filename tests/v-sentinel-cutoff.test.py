#!/usr/bin/env python3
"""scan_cutoffs must tell a reply that stopped from one that compacted and went on.

On 2026-10-08 the heartbeat group got "a reply stopped halfway" for runs that
had hit the context budget mid-turn, compacted, retried under the same runId
and delivered one complete answer. The lines below are shaped like the real
ones from that day.
"""
import importlib.util
import os
import unittest

spec = importlib.util.spec_from_file_location(
    "v_sentinel",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "v-sentinel", "sentinel.py"),
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

RUN = "7a60961c-ee57-45ae-bb86-3174e2dbd73c"
STREAMED = ('[vlab-worker:1] [firsttext-metrics] {"runId":"%s","callId":"%s:model:1",'
            '"stage":"first-nonempty-text","chars":33}')
MIDTURN_END = ("[vlab-worker:1] [feishu] embedded run agent end: runId=%s isError=true "
               "model=deepseek-flash provider=deepseek error=Context overflow: prompt too large "
               "for the model. Try /reset (or /new) to start a fresh session, or use a "
               "larger-context model. rawError=Context overflow: prompt too large for the model "
               "(mid-turn precheck).")
TOOL_CALL_END = ("[vlab-worker:0] [feishu] embedded run agent end: runId=%s isError=true "
                 "model=deepseek-flash provider=deepseek error=deepseek/deepseek-flash request "
                 "failed. rawError=Provider returned an incomplete or malformed tool call")
COMPACT_FAILED = ("[vlab-worker:0] Auto-compaction failed (Context overflow: "
                  "[V_COMPLETIONS_CONTEXT_BUDGET_EXHAUSTED] estimated input 996287 tokens "
                  "leaves 3712 of 1000000 for output; compact the context before retrying.).")


class ScanCutoffs(unittest.TestCase):
    def test_mid_turn_compaction_is_not_a_cutoff(self):
        j = "\n".join([STREAMED % (RUN, RUN), MIDTURN_END % RUN,
                       "[agent/embedded] context overflow detected (attempt 1/3); "
                       "attempting auto-compaction for deepseek/deepseek-flash"])
        hits, cause, compact_fail = mod.scan_cutoffs(j)
        self.assertEqual(hits, [])
        self.assertEqual(compact_fail, 0)

    def test_a_real_cutoff_is_still_reported(self):
        other = "bfea4088-e8be-44b3-85b7-4e178b63dd31"
        j = "\n".join([STREAMED % (other, other), TOOL_CALL_END % other])
        hits, cause, compact_fail = mod.scan_cutoffs(j)
        self.assertEqual(hits, [other])
        self.assertTrue(cause.startswith("Provider returned an incomplete"))

    def test_failed_compaction_is_counted(self):
        j = "\n".join([STREAMED % (RUN, RUN), MIDTURN_END % RUN, COMPACT_FAILED])
        hits, cause, compact_fail = mod.scan_cutoffs(j)
        self.assertEqual(hits, [])
        self.assertEqual(compact_fail, 1)

    def test_internal_runs_stay_excluded(self):
        run = "nightshift-abc"
        j = "\n".join([STREAMED % (run, run), TOOL_CALL_END % run])
        self.assertEqual(mod.scan_cutoffs(j)[0], [])

    def test_an_inter_session_room_turn_that_breaks_is_still_a_cutoff(self):
        # docs/inter-session/design.md WP11: relay turns are left out of the wait
        # and dispatch rules, but people in the room watched this answer stop.
        run = "v-a2a-req-s_mgk3x1a2f9c1-0"
        j = "\n".join([STREAMED % (run, run), TOOL_CALL_END % run])
        hits, cause, _ = mod.scan_cutoffs(j)
        self.assertEqual(hits, [run])
        self.assertTrue(cause.startswith("Provider returned an incomplete"))
        # and the lookback finds its streamed line like any other run's
        self.assertEqual(mod.scan_cutoffs(TOOL_CALL_END % run, lambda ids: STREAMED % (run, run))[0], [run])

    def test_long_turn_streamed_before_the_window_is_found_by_lookback(self):
        # 2026-10-08: streamed at 17:50, failed at 17:53 on an Agent DB lock wait.
        run = "7c307087-15f1-4764-a506-9309e4dbf5fd"
        window = ("[feishu] embedded run agent end: runId=%s isError=true model=deepseek-flash "
                  "provider=deepseek error=request failed. rawError=Agent DB process coordinator "
                  "wait exceeded 5000ms" % run)
        asked = []

        def lookback(ids):
            asked.append(ids)
            return STREAMED % (run, run)

        self.assertEqual(mod.scan_cutoffs(window)[0], [])
        self.assertEqual(mod.scan_cutoffs(window, lookback)[0], [run])
        self.assertEqual(asked, [[run]])

    def test_lookback_is_not_called_when_nothing_failed(self):
        def lookback(ids):
            raise AssertionError("lookback must not run without a failure")
        self.assertEqual(mod.scan_cutoffs(STREAMED % (RUN, RUN), lookback)[0], [])
        # a mid-turn compaction is not a failure either
        self.assertEqual(mod.scan_cutoffs(MIDTURN_END % RUN, lookback)[0], [])


if __name__ == "__main__":
    unittest.main()
