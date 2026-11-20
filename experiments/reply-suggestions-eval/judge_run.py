import json, sys, re, concurrent.futures as cf, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import call
jin = json.load(open(sys.argv[1]))
prov, model = sys.argv[2], sys.argv[3]


def run(r):
    err = None
    for _ in range(3):
        try:
            extra = {"max_completion_tokens": 6000} if prov == "azure-openai" else {"max_tokens": 6000}
            dt, d = call(prov, model, "你是严格、公正的评审。只输出 JSON。", r["prompt"], extra, timeout=300)
            txt = d["choices"][0]["message"]["content"]
            j = json.loads(re.search(r'\{.*\}', txt, re.S).group(0))
            inv = {}
            for v, n in r["mapping"].items():
                inv[n] = v
                inv["组" + n] = v
            return {"id": r["id"], "groups": {inv.get(k, k): g for k, g in j.get("groups", {}).items()},
                    "best": inv.get(j.get("best"), j.get("best")), "note": j.get("note"), "sugs": r["sugs"]}
        except Exception as e:
            err = str(e)
    return {"id": r["id"], "error": err, "sugs": r["sugs"]}


with cf.ThreadPoolExecutor(6) as ex:
    res = list(ex.map(run, jin))
json.dump(res, sys.stdout, ensure_ascii=False)
