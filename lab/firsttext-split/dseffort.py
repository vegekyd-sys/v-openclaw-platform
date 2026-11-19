import json,os,time,urllib.request,sys
KEY=os.environ["DEEPSEEK_API_KEY"]
PROMPTS=["群里有人问：我们下周三的展会物料还差哪些？已知：海报已印、易拉宝在路上、样品还没寄、名片已到。请用两三句话回复。",
         "把这句话改得更口语、更像微信聊天：'关于贵司提出的合作方案，我方经研究后认为具备一定可行性，建议进一步沟通细节。'",
         "一个视频 30 秒，分 5 段，每段时长要比上一段多 1 秒，第一段多长？只给答案和一句解释。"]
def run(prompt,variant):
    body={"model":"deepseek-flash","input":[{"role":"user","content":prompt}],"stream":True}
    if variant.startswith("effort:"): body["reasoning"]={"effort":variant.split(":")[1]}
    elif variant=="thinking:disabled": body["thinking"]={"type":"disabled"}
    req=urllib.request.Request("https://api.deepseek.com/v1/responses",data=json.dumps(body).encode(),headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
    t0=time.time(); tr=None; tt=None; usage=None; err=None
    try:
        with urllib.request.urlopen(req,timeout=120) as r:
            th=time.time()-t0
            for raw in r:
                line=raw.decode().strip()
                if not line.startswith("data:"): continue
                d=json.loads(line[5:]) if line[5:].strip() not in ("","[DONE]") else {}
                ty=d.get("type","")
                if "reasoning" in ty and "delta" in ty and tr is None: tr=time.time()-t0
                if ty=="response.output_text.delta" and tt is None: tt=time.time()-t0
                if ty=="response.completed": usage=(d.get("response") or {}).get("usage")
    except Exception as e:
        err=str(e)[:200]; th=None
        try: err+=" "+e.read().decode()[:300]
        except Exception: pass
    rt=((usage or {}).get("output_tokens_details") or {}).get("reasoning_tokens")
    return dict(variant=variant,hdr=th,firstReason=tr,firstText=tt,reasoning=rt,out=(usage or {}).get("output_tokens"),err=err)
for v in ["effort:high","effort:medium","effort:low","effort:none","thinking:disabled"]:
    for i,p in enumerate(PROMPTS):
        print(json.dumps(dict(prompt=i,**run(p,v))),flush=True)
