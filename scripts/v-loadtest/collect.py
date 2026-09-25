#!/usr/bin/env python3
"""Poll Feishu until every prompt in a stage has a finalized reply (or times out).

Baselines come from Feishu's own server timestamps: our prompt is located by
message_id inside the same listing as the reply, so no local clock is involved.
"""
import json, subprocess, sys, time, pathlib, concurrent.futures as cf
HERE = pathlib.Path(__file__).parent
LARK = "/opt/homebrew/bin/lark-cli"
ME_SUFFIX = "2b8d9766"

def lark(args, timeout=90):
    try:
        r = subprocess.run([LARK] + args, capture_output=True, text=True, timeout=timeout)
        return json.loads(r.stdout)
    except Exception:
        return {}

def probe(chat_id, message_id):
    """Return (prompt_ms, reply) for our prompt in this chat."""
    d = lark(["api", "GET", "/open-apis/im/v1/messages", "--as", "user", "--params",
              json.dumps({"container_id_type": "chat", "container_id": chat_id,
                          "sort_type": "ByCreateTimeDesc", "page_size": 10}), "--format", "json"])
    items = (d.get("data") or {}).get("items") or []
    prompt_ms = None
    for m in items:
        if m.get("message_id") == message_id:
            prompt_ms = int(m.get("create_time") or 0)
            break
    if prompt_ms is None:
        return None, None
    best = None
    for m in items:
        ct = int(m.get("create_time") or 0)
        if ct <= prompt_ms:
            continue
        if (m.get("sender") or {}).get("id", "").endswith(ME_SUFFIX):
            continue
        if best is None or ct < best["first_ms"]:
            best = {"first_ms": ct, "final_ms": int(m.get("update_time") or ct),
                    "msg_type": m.get("msg_type"),
                    "body": ((m.get("body") or {}).get("content") or "")[:600]}
    return prompt_ms, best

def main():
    stage = sys.argv[1]
    budget_s = int(sys.argv[2]) if len(sys.argv) > 2 else 900
    f = HERE / ("stage-%s.json" % stage)
    st = json.load(open(f))
    pending = {p["chat_id"]: p for p in st["plan"] if p.get("ok") and p.get("message_id")}
    done, quiet_for = {}, {}
    deadline = time.time() + budget_s
    while pending and time.time() < deadline:
        with cf.ThreadPoolExecutor(min(len(pending), 12)) as ex:
            res = dict(zip(pending, ex.map(lambda c: probe(c, pending[c]["message_id"]), list(pending))))
        for cid, (prompt_ms, reply) in res.items():
            if prompt_ms is None:
                continue
            pending[cid]["prompt_ms"] = prompt_ms
            if not reply:
                continue
            key = (reply["first_ms"], reply["final_ms"])
            if quiet_for.get(cid) == key:          # unchanged since last poll -> finalized
                done[cid] = {**pending[cid], **reply}
            else:
                quiet_for[cid] = key
        for cid in list(done):
            pending.pop(cid, None)
        if pending:
            time.sleep(25)
    for cid, p in pending.items():
        done[cid] = {**p, "first_ms": None, "final_ms": None, "timeout": True}
    st["results"] = list(done.values())
    json.dump(st, open(f, "w"), ensure_ascii=False, indent=1)
    print("stage=%s collected=%d timeout=%d" % (stage, len(done), sum(1 for r in done.values() if r.get("timeout"))))

if __name__ == "__main__":
    main()
