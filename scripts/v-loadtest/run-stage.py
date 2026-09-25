#!/usr/bin/env python3
"""Send one load-test stage through the real Feishu path and collect results.

Each target group is its own Agent session, so N groups == N concurrent
sessions. Timestamps come from Feishu's server (create_time / update_time in
ms); the local clock is never used as the baseline.
"""
import json, subprocess, sys, time, concurrent.futures as cf, pathlib, random

HERE = pathlib.Path(__file__).parent
LARK = "/opt/homebrew/bin/lark-cli"
sys.path.insert(0, str(HERE))
from tasks import SHORT, LONG

def lark(args, timeout=120):
    r = subprocess.run([LARK] + args, capture_output=True, text=True, timeout=timeout)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"ok": False, "raw": (r.stdout or r.stderr)[:300]}

def send(chat_id, text, tag):
    t0 = time.time()
    d = lark(["im", "+messages-send", "--as", "user", "--chat-id", chat_id,
              "--text", text, "--format", "json"])
    data = d.get("data") or {}
    msg = data.get("message") or data
    return {"chat_id": chat_id, "tag": tag, "ok": bool(d.get("ok")),
            "message_id": msg.get("message_id"), "sent_local": t0,
            "err": None if d.get("ok") else str(d)[:200]}

def poll(chat_id, after_ms):
    """Return V's reply to our message: first-visible and finalized timestamps."""
    d = lark(["api", "GET", "/open-apis/im/v1/messages", "--as", "user", "--params",
              json.dumps({"container_id_type": "chat", "container_id": chat_id,
                          "sort_type": "ByCreateTimeDesc", "page_size": 6}),
              "--format", "json"])
    items = (d.get("data") or {}).get("items") or []
    best = None
    for m in items:
        ct = int(m.get("create_time") or 0)
        if ct < after_ms:                     # older than our prompt
            continue
        if (m.get("sender") or {}).get("id", "").endswith("2b8d9766"):
            continue                          # our own prompt
        if best is None or ct < best[0]:
            best = (ct, int(m.get("update_time") or ct), m.get("msg_type"),
                    (m.get("body") or {}).get("content", "")[:400])
    return best

def main():
    stage = sys.argv[1]
    n = int(sys.argv[2])
    groups = json.load(open(HERE / "groups.json"))
    used = set()
    picked_file = HERE / "used-groups.json"
    if picked_file.exists():
        used = set(json.load(open(picked_file)))
    pool = [g for g in groups if g["chat_id"] not in used]
    random.seed(hash(stage) & 0xffff)
    picked = pool[:n]
    # Mix: roughly half short (1-3 min), half long (3-5 min).
    plan = []
    for i, g in enumerate(picked):
        tpl = (SHORT + LONG)[i % (len(SHORT) + len(LONG))]
        kind = "short" if tpl in SHORT else "long"
        plan.append({"chat_id": g["chat_id"], "name": g["name"],
                     "tag": tpl[0], "kind": kind, "text": tpl[1]})
    t_fire = time.time()
    with cf.ThreadPoolExecutor(min(n, 32)) as ex:
        sent = list(ex.map(lambda p: send(p["chat_id"], p["text"], p["tag"]), plan))
    for p, s in zip(plan, sent):
        p.update(s)
    out = {"stage": stage, "n": n, "fired_at": t_fire, "fire_span_s": time.time() - t_fire,
           "plan": plan}
    json.dump(out, open(HERE / f"stage-{stage}.json", "w"), ensure_ascii=False, indent=1)
    json.dump(sorted(used | {p["chat_id"] for p in plan}), open(picked_file, "w"))
    ok = sum(1 for p in plan if p["ok"])
    print(f"stage={stage} n={n} sent_ok={ok}/{n} fire_span={out['fire_span_s']:.1f}s")
    for p in plan:
        if not p["ok"]:
            print("  SEND FAIL", p["name"], p["err"])

if __name__ == "__main__":
    main()
