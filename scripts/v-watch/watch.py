#!/usr/bin/env python3
"""Turn V production samples into actionable events.

One stdout line per thing worth acting on. Silence means nothing crossed a
threshold -- never a raw log relay. Every rule is de-duplicated so a standing
condition reports once, not once per cycle.
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, "sample.sh")
FTM_LOG = os.path.join(HERE, "ftm.jsonl")
INTERVAL = int(os.environ.get("VWATCH_INTERVAL", "60"))
WINDOW = INTERVAL + 30                      # overlap so calls spanning a cycle are not lost

TTFT_WARN_MS   = int(os.environ.get("VWATCH_TTFT_MS", "20000"))
WORKER_RSS_GB  = float(os.environ.get("VWATCH_WORKER_RSS_GB", "3.5"))
DISK_WARN_MB   = int(os.environ.get("VWATCH_DISK_MB", "25600"))
MEM_WARN_MB    = int(os.environ.get("VWATCH_MEM_MB", "4096"))
EGRESS_WARN_MBPS = float(os.environ.get("VWATCH_EGRESS_MBPS", "30"))  # cap is 50
STALL_WARN = 8          # stalled requests per window. Was 3; on 2026-09-23 it fired on
                        # 61 windows of 1-7 stalls. Stall count does not predict user harm:
                        # every 8+ burst that day (IO, CPU, DingTalk) hit only nightshift runs
                        # and caused zero user cutoffs. User harm is now watched directly by
                        # the CUTOFF rule, so this one is a capacity early warning only.
                        # Matches the on-host sentinel's threshold.
FAIL_RATE_WARN = 3.0    # rolling-hour user-facing failure %; daily noise sits under 1
FAIL_BURST = 5          # failures in one window that count as a burst regardless of rate
POOL_MAX = 15           # maxWorkers in production's worker-pool config
STARTUP_GRACE_S = 300   # Gateway start -> ready pool measured at ~2 min, twice
# A port that answers 403/404 is alive and routing; only no-answer or an
# upstream failure is a fault. browser_broker's 2026-09-12 outage was a 502.
HEALTH_BAD = {"000", "502", "503", "504"}
# One multiplexed connection instead of a handshake per cycle.
SSH_MUX = ["-o", "ControlMaster=auto",
           "-o", "ControlPath=" + os.path.expanduser("~/.ssh/cm/%r@%h:%p"),
           "-o", "ControlPersist=10m"]

state = {
    "units": {},          # unit -> (active, sub, nrestarts)
    "health": {},         # name -> code
    "seen": {},           # callId|stage -> ts (dedupe across overlapping windows)
    "calls": {},          # callId -> {stage: at}
    "reported": set(),    # generic one-shot keys
    "disk_step": None,
    "first": True,
}

def emit(sev, msg):
    print(f"[{time.strftime('%H:%M:%S')}] {sev} {msg}", flush=True)

def sample():
    with open(SAMPLE) as f:
        return subprocess.run(
            ["ssh", *SSH_MUX, "-o", "BatchMode=yes", "-o", "ConnectTimeout=20",
             "v", "bash", "-s", str(WINDOW)],
            stdin=f, capture_output=True, text=True, timeout=90,
        ).stdout

def gc(now):
    for d, ttl in ((state["seen"], 900), (state["calls"], 900)):
        for k in [k for k, v in d.items()
                  if (v if isinstance(v, (int, float)) else v.get("_t", 0)) < now - ttl]:
            d.pop(k, None)

def handle(out):
    first = state["first"]
    now = time.time()
    workers, health_now = [], {}
    slow, fails, retries, internal_fails = [], [], [], []
    calls_seen = set()            # aggregated per cycle: a standing fault
                                    # must cost one line, not one line per call

    for line in out.splitlines():
        p = line.split(" ", 1)
        if len(p) < 2:
            continue
        kind, rest = p[0], p[1]

        if kind == "unit":
            name, active, sub, nr = (rest.split() + ["", "", ""])[:4]
            prev = state["units"].get(name)
            state["units"][name] = (active, sub, nr)
            if prev and not first:
                if prev[2] != nr:
                    emit("RESTART", f"{name} NRestarts {prev[2]} -> {nr} (service restarted)")
                if prev[0] != active or prev[1] != sub:
                    emit("UNIT", f"{name} {prev[0]}/{prev[1]} -> {active}/{sub}")
            elif active != "active":
                emit("UNIT", f"{name} is {active}/{sub}")

        elif kind == "health":
            name, port, code = rest.split()
            health_now[name] = code
            prev = state["health"].get(name)
            state["health"][name] = code
            if code in HEALTH_BAD and prev != code:
                emit("HEALTH", f"{name} (:{port}) -> HTTP {code}")
            elif prev in HEALTH_BAD and code not in HEALTH_BAD:
                emit("RECOVER", f"{name} (:{port}) back to HTTP {code}")

        elif kind == "worker":
            pid, rss_kb, age_s = rest.split()
            workers.append((pid, int(rss_kb) / 1048576, int(age_s)))

        elif kind == "gateway_proc":
            pid, rss_kb, age_s = rest.split()
            gb = int(rss_kb) / 1048576
            if gb > 8.0 and "gw_rss" not in state["reported"]:
                state["reported"].add("gw_rss")
                emit("MEM", f"gateway pid {pid} RSS {gb:.1f}G (heap cap 12G)")

        elif kind == "disk_avail_mb":
            mb = int(rest)
            if mb < DISK_WARN_MB:
                step = mb // 1024                       # re-report only on each new GiB lost
                if state["disk_step"] is None or step < state["disk_step"]:
                    state["disk_step"] = step
                    emit("DISK", f"/ has {mb/1024:.1f}G free (below {DISK_WARN_MB/1024:.0f}G)")

        elif kind == "mem_avail_mb":
            mb = int(rest)
            if mb < MEM_WARN_MB and "mem" not in state["reported"]:
                state["reported"].add("mem")
                emit("MEM", f"host available memory {mb/1024:.1f}G")
            elif mb >= MEM_WARN_MB:
                state["reported"].discard("mem")

        elif kind == "egress_public_mbps":
            mb = float(rest); eg = state.setdefault("egress", {"hi": 0, "reported": False})
            eg["hi"] = eg["hi"] + 1 if mb >= EGRESS_WARN_MBPS else 0
            if eg["hi"] >= 3 and not eg["reported"]:
                eg["reported"] = True
                emit("EGRESS", f"public egress {mb:.2f} Mbps for 3 samples -- above {EGRESS_WARN_MBPS:.0f} "
                               f"of the 50 Mbps cap; model request bodies may start queueing")
            elif mb < EGRESS_WARN_MBPS * 0.6 and eg["reported"]:
                eg["reported"] = False; emit("RECOVER", f"public egress back to {mb:.2f} Mbps")

        elif kind == "provider_cwnd1":
            c1, tot = (int(x) for x in rest.split())
            cw = state.setdefault("cwnd", {"hi": 0, "reported": False})
            cw["hi"] = cw["hi"] + 1 if tot >= 3 and c1 / tot >= 0.5 else 0
            if cw["hi"] >= 3 and not cw["reported"]:
                cw["reported"] = True
                emit("EGRESS", f"{c1}/{tot} provider sockets at cwnd:1 for 3 samples -- egress policer dropping")
            elif tot and c1 / tot < 0.2 and cw["reported"]:
                cw["reported"] = False; emit("RECOVER", f"provider sockets healthy ({c1}/{tot} at cwnd:1)")

        elif kind == "oomcount":
            n = int(rest.split()[-1])
            if n > 0:
                emit("OOM", f"{n} kernel OOM kills in the last {WINDOW}s")

        elif kind == "cutoff":
            parts = rest.split()
            ids = [x for x in (parts[1].split(",") if len(parts) > 1 else []) if x and x != "-"]
            cs = state.setdefault("cutoff", {"reported": {}})
            # The sample window (90s) is wider than the cycle (30s), so one run
            # shows up in several consecutive samples. Report each run once;
            # on 2026-09-24 the same run fired twice a minute apart.
            fresh = [r for r in ids if r not in cs["reported"]]
            for r in fresh:
                cs["reported"][r] = now
            for r in [r for r, t in cs["reported"].items() if now - t > 900]:
                del cs["reported"][r]
            # One is worth saying: it means a person watched an answer stop
            # mid-sentence. Unlike CALLFAIL this needs no rate -- the measured
            # rate is about five a day and every one was real.
            if fresh:
                emit("CUTOFF", f"{len(fresh)} reply(ies) began streaming and then failed "
                               f"(run={','.join(r[:8] for r in fresh)}) -- a user saw an answer start and stop. "
                               f"This is not the agent choosing not to reply; that never starts streaming.")

        elif kind == "poolsize":
            parts = rest.split()
            n = int(parts[0])
            gw_up = int(parts[1]) if len(parts) > 1 else -1
            # A Gateway restart completes within a second, so a 30s sample
            # almost never sees the unit in a deactivating state: on
            # 2026-09-25 nine restarts between 03:09 and 04:14 produced one
            # UNIT event. Uptime going backwards is the reliable signal.
            prev_up = state.get("gw_up_last")
            if gw_up >= 0:
                if prev_up is not None and gw_up + 5 < prev_up:
                    emit("RESTART", f"openclaw-gateway restarted about {gw_up}s ago "
                                    f"(was up {prev_up // 60} min). NRestarts does not count "
                                    f"manual restarts, so this is the only trace.")
                state["gw_up_last"] = gw_up
            # An empty pool during the first minutes after a start is normal:
            # the pool takes about two minutes to build. Do not call it an outage.
            if n == 0 and 0 <= gw_up < STARTUP_GRACE_S:
                state["last_poolsize"] = n
                continue
            ps = state.setdefault("pool", {"empty": 0, "reported": False})
            state["last_poolsize"] = n
            ps["empty"] = ps["empty"] + 1 if n == 0 else 0
            # One sample is enough to act on: the pool never comes back on its
            # own. close() sets this.closing = true and nothing ever clears it,
            # and submit()'s self-heal branch tests `started` rather than
            # `closing`, so every later request throws. Only a Gateway restart
            # rebuilds the pool.
            if ps["empty"] >= 1 and not ps["reported"]:
                ps["reported"] = True
                emit("OUTAGE", "worker pool is EMPTY (0 worker processes) -- the Gateway looks healthy "
                               "(active, health 200, NRestarts=0) but can serve nobody. "
                               "A config hot reload closed the pool without rebuilding it on 2026-09-20; "
                               "restarting openclaw-gateway is what rebuilds it")
            elif n > 0 and ps["reported"]:
                ps["reported"] = False
                emit("RECOVER", f"worker pool rebuilt ({n} workers)")

        elif kind == "stall":
            ack, noprog, reqto = (int(x) for x in rest.split()[-3:])
            total = ack + noprog + reqto
            st = state.setdefault("stall", {"hot": 0, "reported": False})
            # Baseline measured 2026-09-20 over three separate hours of real
            # production traffic: all three counters were 0. They only appear
            # when the Worker pool pins at maxWorkers and requests queue behind
            # long agent runs, which is exactly when a user's message goes
            # unanswered. Two consecutive hot windows to skip a single burst.
            st["hot"] = st["hot"] + 1 if total >= STALL_WARN else 0
            if st["hot"] >= 2 and not st["reported"]:
                st["reported"] = True
                pool = state.get("last_poolsize")
                cap = f" pool at {pool}/{POOL_MAX}" if pool is not None else ""
                emit("SATURATED",
                     f"{total} stalled request(s) in {WINDOW}s "
                     f"(stream-ack {ack}, no-progress {noprog}, request-timeout {reqto}){cap} "
                     f"-- users are waiting on replies that may never arrive. "
                     f"Normally this counter is 0. Check what is holding the Workers "
                     f"(a large fan-out batch will do it) before touching the Gateway.")
            elif total == 0 and st["reported"]:
                st["reported"] = False
                st["hot"] = 0
                emit("RECOVER", "stalled-request counters back to zero")

        elif kind == "poolclosing":
            n = int(rest.split()[-1])
            cs = state.setdefault("closing", {"reported": False})
            if n > 0 and not cs["reported"]:
                cs["reported"] = True
                emit("OUTAGE", f"{n} request(s) rejected with 'worker pool is closing' in {WINDOW}s "
                               f"-- users get 'Agent couldn't generate a response'")
            elif n == 0 and cs["reported"]:
                cs["reported"] = False
                emit("RECOVER", "no more requests rejected by a closing pool")

        elif kind == "errcount":
            f = rest.split()                      # "gateway N src=count ..."
            n = int(f[1]); srcs = " ".join(f[2:])
            es = state.setdefault("err", {"active": False, "last": 0.0, "total": 0, "quiet": 0})
            if n > 0:
                es["total"] += n; es["quiet"] = 0
                if not es["active"] or now - es["last"] > 600:
                    es["active"] = True; es["last"] = now
                    emit("ERR", f"{n} gateway error-signature lines in {WINDOW}s "
                                f"({es['total']} this episode) sources: {srcs or '?'}")
            elif es["active"]:
                es["quiet"] += 1
                if es["quiet"] >= 10:
                    emit("RECOVER", f"no gateway error signatures for {10*INTERVAL}s ({es['total']} total this episode)")
                    es.update(active=False, last=0.0, total=0, quiet=0)

        elif kind == "ftm":
            try:
                ev = json.loads(rest)
            except json.JSONDecodeError:
                continue
            cid, stage, at = ev.get("callId"), ev.get("stage"), ev.get("at")
            if not (cid and stage and at):
                continue
            key = f"{cid}|{stage}"
            if key in state["seen"]:
                continue
            state["seen"][key] = now
            with open(FTM_LOG, "a") as fh:      # dedup'd, so no repeats on window overlap
                fh.write(rest + "\n")
            c = state["calls"].setdefault(cid, {"_t": now})
            if stage == "model-call-enter" and "model-call-enter" in c:
                retries.append(cid.split(":model:")[0][:28])
                c = state["calls"][cid] = {"_t": now}     # new attempt, drop stale stages
            c[stage] = at
            tag = cid.split(":model:")[0][:28]

            if stage == "model-call-enter":
                calls_seen.add(cid)
            if stage == "model-call-ended" and ev.get("failed"):
                internal = cid.startswith(("announce", "workboard", "nightshift")) or                            "internal-session-effects" in cid or "skill-workshop" in cid
                (internal_fails if internal else fails).append(
                    (ev.get("provider"), ev.get("model"), tag))
            if stage == "first-decoded-event" and "model-call-enter" in c:
                ttft = at - c["model-call-enter"]
                if ttft > TTFT_WARN_MS and ttft > 0:
                    hs = c.get("provider-accepted", at) - c["model-call-enter"]
                    slow.append((ttft, hs, ev.get("provider"), ev.get("model"), tag))

    streak = state.setdefault("rss_streak", {})
    live = set()
    for pid, gb, age in workers:
        live.add(pid)
        streak[pid] = streak.get(pid, 0) + 1 if gb > WORKER_RSS_GB else 0
        k = f"w{pid}"
        # Three samples still caught 3-5 minute runs whose RSS settled right
        # after (3 benign alerts on 2026-09-18/19); six minutes sustained is
        # what a worker that failed to settle or recycle looks like.
        if streak[pid] >= 6 and k not in state["reported"]:
            state["reported"].add(k)
            emit("WORKER", f"worker pid {pid} RSS above {WORKER_RSS_GB:.1f}G for 6 samples "
                           f"(now {gb:.1f}G, age {age//60}m) -- sustained, not a mid-turn peak; "
                           f"recycler needs 180s idle, check vlab.workers.status active/idleMs")
    for pid in [p for p in streak if p not in live]:
        streak.pop(pid, None); state["reported"].discard(f"w{pid}")

    # Feed the rolling hour from EVERY cycle, not only the ones that alert.
    # Failures during the 600s alert-suppression window used to be dropped from
    # the denominator, which quietly biased the rate upward.
    if calls_seen or fails:
        hist = state.setdefault("call_hist", [])
        hist.append((now, len(calls_seen), len(fails)))
        cutoff = now - 3600
        while hist and hist[0][0] < cutoff:
            hist.pop(0)

    if retries:
        emit("RETRY", f"{len(retries)} model call(s) re-entered after a failed attempt "
                      f"(e.g. run={retries[0]})")
    # Same rule as SLOW: first occurrence, then a 10-minute heartbeat with the
    # cumulative count, then one line when failures stop.
    fs_ = state.setdefault("fail", {"active": False, "last": 0.0, "total": 0, "quiet": 0})
    if fails:
        fs_["total"] += len(fails); fs_["quiet"] = 0
    elif fs_["active"]:
        fs_["quiet"] += 1
        if fs_["quiet"] >= 10:
            emit("RECOVER", f"no model call failures for {10*INTERVAL}s ({fs_['total']} total this episode)")
            fs_.update(active=False, last=0.0, total=0, quiet=0)
    hist = state.get("call_hist", [])
    h_calls = sum(c for _, c, _ in hist)
    h_fails = sum(f for _, _, f in hist)
    h_rate = (h_fails / h_calls * 100) if h_calls else 0.0
    # A single failed call is not news. Measured on 2026-09-21, isolated
    # failures land at 0.15-0.96% of the hour and users never notice; the
    # DeepSeek outage on 2026-09-20 ran deepseek's success rate down to 48%.
    # Two orders of magnitude separate noise from an incident, so alert on the
    # rate or on a genuine burst -- never on one call.
    worth_saying = (len(fails) >= FAIL_BURST
                    or (h_calls >= 200 and h_rate >= FAIL_RATE_WARN))
    if fails and worth_saying and (not fs_["active"] or now - fs_["last"] > 600):
        fs_["active"] = True; fs_["last"] = now
        by = {}
        for prov, model, _ in fails:
            by[f"{prov}/{model}"] = by.get(f"{prov}/{model}", 0) + 1
        brief = ", ".join(f"{k} x{v}" for k, v in sorted(by.items(), key=lambda kv: -kv[1]))
        rate = (f"; last hour {h_fails}/{h_calls} = {h_rate:.2f}%"
                if h_calls >= 200 else f"; last hour {h_fails}/{h_calls} (too few to rate)")
        extra = f" [+{len(internal_fails)} internal/background]" if internal_fails else ""
        emit("CALLFAIL", f"{len(fails)} user-facing call(s) failed in {WINDOW}s{rate}{extra}. "
                         f"{brief} (e.g. run={fails[0][2]})")
    # A standing slow condition is one fact, not one line per minute. Report
    # when it first appears, when the worst case crosses a higher band, as a
    # heartbeat every 10 min while it persists, and once when it clears.
    st = state.setdefault("slow", {"band": -1, "last": 0.0, "quiet": 0})
    BANDS = (20, 60, 120, 240)
    if slow:
        slow.sort(reverse=True)
        worst = slow[0]
        band = max(i for i, b in enumerate(BANDS) if worst[0] / 1000 >= b)
        hs_share = sum(s_[1] for s_ in slow) / max(sum(s_[0] for s_ in slow), 1)
        st["quiet"] = 0
        if band > st["band"] or now - st["last"] > 600:
            tag = "SLOW" if st["band"] < 0 else ("WORSE" if band > st["band"] else "SLOW-still")
            emit(tag, f"{len(slow)} call(s) over {TTFT_WARN_MS/1000:.0f}s TTFT in {WINDOW}s; "
                      f"worst {worst[0]/1000:.1f}s (band >={BANDS[band]}s), "
                      f"{hs_share*100:.0f}% upstream handshake ({worst[2]}/{worst[3]}, run={worst[4]})")
            st["band"] = max(st["band"], band); st["last"] = now
    elif st["band"] >= 0:
        st["quiet"] += 1
        if st["quiet"] >= 10:                     # three clean cycles = it cleared
            emit("RECOVER", f"no TTFT over {TTFT_WARN_MS/1000:.0f}s for {10*INTERVAL}s")
            st.update(band=-1, last=0.0, quiet=0)

    if first:
        tot = sum(g for _, g, _ in workers)
        emit("BASELINE", f"{len(state['units'])} units up, {len(workers)} workers "
                         f"({tot:.1f}G total), health={health_now}")
        state["first"] = False
    gc(now)

while True:
    try:
        handle(sample())
    except subprocess.TimeoutExpired:
        alive = subprocess.run(
            ["ssh", *SSH_MUX, "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
             "v", "cat /proc/loadavg"],
            capture_output=True, text=True,
        )
        if alive.returncode == 0:
            emit("PROBE", f"sample timed out but V answers (load {alive.stdout.split()[0]}) "
                          f"-- slow SSH handshake from here, V itself is fine")
        else:
            emit("PROBE", "sample timed out AND V does not answer -- host unreachable")
    except Exception as e:                       # a bad cycle must not kill the watch
        emit("PROBE", f"sampler error: {type(e).__name__}: {e}")
    time.sleep(INTERVAL)
