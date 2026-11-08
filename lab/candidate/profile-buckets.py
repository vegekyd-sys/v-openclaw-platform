#!/usr/bin/env python3
"""Bucket a Gateway main-thread CPU profile (.cpuprofile or .cpuprofile.gz) by call stack.

  python3 profile-buckets.py <profile> [--turns N] [--other 20]

Each sample goes to the first bucket (in order) whose keys appear anywhere in its stack, so narrow
buckets come before broad ones. Derived from docs/evidence/harness-compare-20261031/v-staged-20261101/
hc-bucket.py, whose single "event broadcast" bucket matched the whole agent event handler
(handleEvent); the snapshot is split out here.
"""
import collections, gzip, json, sys

args = sys.argv[1:]
path = args[0]
turns = int(args[args.index("--turns") + 1]) if "--turns" in args else None
n_other = int(args[args.index("--other") + 1]) if "--other" in args else 20
raw = gzip.open(path).read() if path.endswith(".gz") else open(path, "rb").read()
p = json.loads(raw)
N = {n["id"]: n for n in p["nodes"]}
par = {}
for n in p["nodes"]:
    for c in n.get("children", []):
        par[c] = n["id"]

B = [
    ("session_status", ("buildStatusReplyParts",)),
    ("快照: buildSessionEventSnapshot", ("buildSessionEventSnapshot",)),
    ("快照: 转录更新广播", ("handleTranscriptUpdateBroadcast",)),
    ("快照: 会话行/快照", ("buildGatewaySessionSnapshot", "loadGatewaySessionRow", "loadGatewaySessionSnapshot", "loadGatewaySessionLifecycleSnapshot")),
    ("会话条目整读", ("loadGatewaySessionEntryReadOnly", "loadSessionEntryReadOnly")),
    ("子 agent 运行索引", ("buildSingleRowSubagentRunIndex", "getSubagentRunsSnapshot", "loadSubagentRegistryFromSqlite")),
    ("Codex 回合开始的子 agent 监控", ("registerNativeSubagentMonitor",)),
    ("钩子 relay", ("processNativeHookRelayInvocation", "runNativeHookRelay", "NativeHook", "nativeHook")),
    ("agent 事件处理其他", ("handleEvent",)),
    ("Codex 回合收尾", ("finalizeCodexAttempt",)),
    ("Codex 回合其他", ("runCodexAppServerAttempt",)),
    ("写事务", ("runOpenClawAgentWriteTransaction",)),
    ("转录读/投影", ("readSessionMessage", "readSessionMessageCount", "projectSessionMessagePayload", "readTranscript")),
    ("workboard/lifecycle", ("listLifecycleCandidates", "listLifecycleMatchLinks", "readCardLifecycleMatchLink")),
    ("脱敏", ("redactRegisteredSecretValues",)),
    ("JSON 解析(其他来源)", ("parseSqliteSessionEntryRecord", "safeParseJson")),
]
s = collections.Counter()
other = collections.Counter()
for i, d in zip(p["samples"], p["timeDeltas"]):
    f = N[i]["callFrame"]["functionName"]
    if f == "(idle)":
        s["idle"] += d / 1000
        continue
    if f == "(garbage collector)":
        s["GC"] += d / 1000
        continue
    x, stack = i, []
    while x is not None:
        stack.append(N[x]["callFrame"]["functionName"])
        x = par.get(x)
    for name, keys in B:
        if any(any(k in g for k in keys) for g in stack):
            s[name] += d / 1000
            break
    else:
        s["其他"] += d / 1000
        top = [g for g in reversed(stack) if g and g not in ("(root)", "processTicksAndRejections", "runMicrotasks", "run", "processTimers", "listOnTimeout", "(program)")][:3]
        other[">".join(top)] += d / 1000
busy = sum(v for k, v in s.items() if k != "idle")
print(f"busy {busy:.0f} ms, idle {s['idle']:.0f} ms" + (f", per turn {busy / turns:.0f} ms (turns {turns})" if turns else ""))
for k, v in s.most_common():
    if k == "idle":
        continue
    print(f"{v:8.0f} {100 * v / busy:4.0f}%" + (f" {v / turns:6.0f}/turn" if turns else "") + f"  {k}")
print("-- 其他 top")
for k, v in other.most_common(n_other):
    print(f"{v:8.0f}  {k}")
