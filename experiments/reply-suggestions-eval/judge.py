import json, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filt import filt
S=os.path.dirname(os.path.abspath(__file__))
d=[r for n in ('gen_out.json','gen_out2.json','gen_out3.json') if os.path.exists(f'{S}/{n}') for r in json.load(open(f'{S}/{n}'))]; smp={x['id']:x for x in json.load(open(f'{S}/samples.json'))}
V=sys.argv[1].split(',')
def clip(s,n): s=s or ""; return s if len(s)<=n else s[:n*2//3]+"\n…\n"+s[-n//3:]
def ctx(x):
    out=[f"[场景] 飞书{'群聊' if x['chat']=='group' else '私聊'}"]
    for p in x['prev'][-3:]:
        out+=["[更早·用户] "+clip(p['user'],1200),"[更早·V] "+clip(p['reply'],1800)]
    out.append("[本轮·用户] "+clip(x['user'],2000))
    if x['tools']: out.append("[本轮·V 调用的工具]\n"+"\n".join(x['tools'][:25]))
    out.append("[本轮·V 的回复]\n"+clip(x['reply'],5000))
    return "\n\n".join(out)
JUDGE="""你在评估「回复建议」的质量。场景：AI 助手 V 在飞书里刚回复完用户，回复下方会出现 2–3 个按钮，用户点一下，按钮上的文字就以用户的名义发给 V。
产品负责人的要求：「简洁但是有见解，可以真实的帮助用户」。不要「好的/继续/谢谢」这类空话，也不要「能详细说说吗」这类泛泛的话；应该是基于上下文、真正推动任务的下一步，例如指出一个没考虑到的风险、一个值得追问的点、或一个具体的选择项。每条要短，适合做按钮。

下面是对话上下文，以及几组匿名的候选建议（组名随机）。请你站在这位用户的位置，逐条打分：
- 2 分：具体、有见解，切中当前最该推进的事；用户很可能会直接点它。
- 1 分：相关且具体，但平淡、价值一般，或用户大概不会点。
- 0 分：空话、泛泛、和上下文对不上、重复 V 已经说过/做过的事、编造用户不知道的信息、措辞不像用户会说的、或在不该时建议不可逆操作。
再给每组一个整体分 1–5（考虑三条合起来是否互补、是否覆盖最关键的下一步）。没有建议的组记为空，不打分。

只输出 JSON：{"groups": {"组名": {"items": [{"text":"…","score":0|1|2,"flag":"空话|泛泛|对不上|重复|编造|口吻|不可逆|无"}], "overall": 1-5}}, "best": "组名", "note": "一句话说明最关键的区别"}"""
def job(x):
    groups={}
    for v in V:
        r=[r for r in d if r['id']==x['id'] and r['variant']==v][0]
        f,_=filt([] if r['out'].get('skip') else r['out'].get('suggestions'))
        groups[v]=f
    names=['甲','乙','丙','丁']; random.Random(x['id']).shuffle(names)
    mapping=dict(zip(V,names))
    body=ctx(x)+"\n\n=== 候选建议 ===\n"+"\n".join(f"组{mapping[v]}: "+(json.dumps(groups[v],ensure_ascii=False) if groups[v] else "（空）") for v in V)
    prompt=JUDGE+"\n\n"+body
    return {"id":x['id'],"prompt":prompt,"mapping":mapping,"sugs":groups}
xs=[x for x in smp.values() if x['expect']=='show' and (len(sys.argv)<4 or sys.argv[3] in x['harness'])]
res=[job(x) for x in xs]
json.dump(res,open(f'{S}/'+sys.argv[2],'w'),ensure_ascii=False)
print(len(res),'prompts')
