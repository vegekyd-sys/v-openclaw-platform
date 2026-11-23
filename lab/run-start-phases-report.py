#!/usr/bin/env python3
"""Per-step p50/p90 of dispatch -> run start, from V Gateway journal lines.

Joins [run-start-phases.1] (lab/run-start-phases.mjs) with [firsttext-e2e.1] by runId:
  dispatch->head   [firsttext-e2e.1].dispatcherAtMs -> getReplyFromConfig entry (channel dispatch, before-dispatch
                   hooks, plugin load, reply resolver load)
  <step>           each step of the head line (ms since the previous mark; ">name" is the gap before a phase)
  run-start->e2e   head's run start -> [firsttext-e2e.1].runStartAtMs (should be ~0)

  journalctl -u openclaw-gateway --since ... -o cat | grep -a -E 'run-start-phases.1|firsttext-e2e.1' > lines.txt
  python3 lab/run-start-phases-report.py lines.txt [--model vds-deepseek-flash] [--exclude-busy]
"""
import argparse, collections, json, re, sys

ap = argparse.ArgumentParser()
ap.add_argument("path")
ap.add_argument("--model", default="vds-deepseek-flash", help="[firsttext-e2e.1].model to keep; '' keeps all")
ap.add_argument("--exclude-busy", action="store_true", help="drop messages sent while the same session was still answering")
args = ap.parse_args()

heads, e2e = {}, []
ANSI = re.compile(r"\x1b\[[0-9;]*m")
for line in open(args.path, errors="replace"):
    line = ANSI.sub("", line)
    line = line[: line.rfind("}") + 1]
    for tag, sink in (("[run-start-phases.1] ", "h"), ("[firsttext-e2e.1] ", "e")):
        i = line.find(tag)
        if i < 0:
            continue
        try:
            rec = json.loads(line[i + len(tag):])
        except ValueError:
            continue
        if sink == "h" and rec.get("runId"):
            heads[rec["runId"]] = rec
        elif sink == "e":
            e2e.append(rec)

e2e.sort(key=lambda r: r.get("sentAtMs") or 0)
last_end = {}
rows = []
for r in e2e:
    busy = (last_end.get(r.get("sessionKey")) or 0) > (r.get("sentAtMs") or 0)
    last_end[r.get("sessionKey")] = r.get("endAtMs") or 0
    if args.model and r.get("model") != args.model:
        continue
    if args.exclude_busy and busy:
        continue
    h = heads.get(r.get("runId"))
    if not h or not r.get("dispatcherAtMs") or not r.get("runStartAtMs"):
        continue
    steps = collections.OrderedDict()
    steps["dispatch->head"] = h["startedAtMs"] - r["dispatcherAtMs"]
    for name, ms in h["steps"]:
        steps[name] = steps.get(name, 0) + ms
    steps["run-start->e2e"] = r["runStartAtMs"] - (h["startedAtMs"] + h["totalMs"])
    steps["TOTAL dispatch->run"] = r["runStartAtMs"] - r["dispatcherAtMs"]
    steps["lagOver50Ms"] = h.get("lagOver50Ms", 0)
    rows.append(steps)

def q(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))] if xs else float("nan")

print(f"joined {len(rows)} of {len(e2e)} [firsttext-e2e.1] lines ({len(heads)} head lines)")
if not rows:
    sys.exit(0)
order = []
for s in rows:
    for k in s:
        if k not in order:
            order.append(k)
total_p50 = q([s["TOTAL dispatch->run"] for s in rows], 0.5)
print(f"{'step':40s} {'n':>5s} {'p50':>7s} {'p90':>7s} {'mean':>7s} {'share':>6s}")
for k in order:
    xs = [s[k] for s in rows if k in s]
    mean = sum(xs) / len(xs)
    share = sum(xs) / sum(s["TOTAL dispatch->run"] for s in rows if k in s) if not k.startswith(("TOTAL", "lag")) else float("nan")
    print(f"{k:40s} {len(xs):5d} {q(xs, .5):7.0f} {q(xs, .9):7.0f} {mean:7.0f} {share:6.1%}")
