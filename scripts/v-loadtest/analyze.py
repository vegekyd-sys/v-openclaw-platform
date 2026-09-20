#!/usr/bin/env python3
"""Report one stage against Tianyi's two acceptance criteria:
   few threads -> fast; many threads -> queueing is fine, errors are not."""
import json, sys, pathlib, statistics as st
HERE = pathlib.Path(__file__).parent
ERR_MARKS = ("error", "失败", "抱歉", "无法", "出错", "timed out", "超时", "exceeded")

def q(v, p):
    v = sorted(v)
    return v[min(int(len(v) * p), len(v) - 1)] if v else float("nan")

def main():
    stage = sys.argv[1]
    d = json.load(open(HERE / ("stage-%s.json" % stage)))
    rows = d.get("results") or []
    ok, to = [], []
    for r in rows:
        (to if r.get("timeout") or not r.get("first_ms") else ok).append(r)
    ttft = [(r["first_ms"] - r["prompt_ms"]) / 1000 for r in ok if r.get("prompt_ms")]
    total = [(r["final_ms"] - r["prompt_ms"]) / 1000 for r in ok if r.get("prompt_ms")]
    errs = [r for r in ok if any(m in (r.get("body") or "").lower() for m in ERR_MARKS)]
    print("=" * 62)
    print("STAGE %s  n=%d  fire_span=%.1fs" % (stage, d["n"], d.get("fire_span_s", 0)))
    print("  完成 %d/%d   超时未完成 %d   回复疑似含错误 %d"
          % (len(ok), d["n"], len(to), len(errs)))
    if ttft:
        print("  首字(s)  min=%.1f p50=%.1f p90=%.1f max=%.1f" % (min(ttft), q(ttft, .5), q(ttft, .9), max(ttft)))
    if total:
        print("  完成(s)  min=%.1f p50=%.1f p90=%.1f max=%.1f" % (min(total), q(total, .5), q(total, .9), max(total)))
    for kind in ("short", "long"):
        sub = [(r["final_ms"] - r["prompt_ms"]) / 1000 for r in ok if r.get("kind") == kind and r.get("prompt_ms")]
        if sub:
            print("    %-5s n=%-3d 完成 p50=%.1fs max=%.1fs" % (kind, len(sub), q(sub, .5), max(sub)))
    for r in to:
        print("  TIMEOUT:", r.get("name"), r.get("tag"))
    for r in errs:
        print("  疑似错误:", r.get("name"), "|", (r.get("body") or "")[:120].replace("\n", " "))

if __name__ == "__main__":
    main()
