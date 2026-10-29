import json,re,sys
S=sys.argv[1]
d=json.load(open(f'{S}/raw.json'))
HUMAN=re.compile(r'^(\[message_id:[^\]]*\]\s*)?(?P<who>[^\n:：<\[]{1,40})[:：]\s', re.S)
def clean_user(t):
    t=re.sub(r'\[message_id:[^\]]*\]\s*','',t)
    t=re.sub(r'\s*\[System: The content may include mention tags.*','',t,flags=re.S)
    return t.strip()
def is_human(t):
    t=clean_user(t)
    if not t or t.startswith('<<<BEGIN_OPENCLAW') or t.startswith('Live voice') or t.startswith('[Inter-session') or t.startswith('用户在接管页') or t.startswith('[media attached'): return False
    return bool(HUMAN.match(t))
samples=[]
for s in d:
    turns=s['turns']
    idxs=[i for i,t in enumerate(turns) if is_human(t['user']) and t['reply'].strip()]
    for i in idxs[-3:]:
        t=turns[i]
        prev=[]
        for p in turns[max(0,i-4):i]:
            if p['reply'].strip() or clean_user(p['user']):
                prev.append({'user':clean_user(p['user'])[:1500],'reply':p['reply'][:2500]})
        samples.append({'id':f"{s['name']}#{i}",'session':s['name'],'chat':s['chat'],'harness':s['harness'],
            'prev':prev,'user':clean_user(t['user'])[:2000],'tools':t['tools'][:40],'toolResults':t['toolResults'][:12],'reply':t['reply'][:5000]})
json.dump(samples,open(f'{S}/samples_all.json','w'),ensure_ascii=False,indent=1)
print(len(samples))
for x in samples: print(x['id'],'|',x['user'][:50].replace('\n',' '),'|',x['reply'][:60].replace('\n',' '))
