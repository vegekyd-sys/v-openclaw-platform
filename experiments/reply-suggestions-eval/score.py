import json,sys,collections,statistics as st
V=sys.argv[2].split(',') if len(sys.argv)>2 else ['A0_naive_flash','A1_sep_flash','A2_sep_flash_think','B_main_full']
d=[r for r in json.load(open(sys.argv[1])) if 'error' not in r]
print(sys.argv[1], 'n=',len(d))
best=collections.Counter(r.get('best') for r in d)
for v in V:
    items=[];ov=[];flags=collections.Counter();shown=0
    for r in d:
        g=r['groups'].get(v)
        if not r['sugs'][v]: continue
        shown+=1
        if not g: continue
        for it in g.get('items',[]):
            s=it.get('score');
            if isinstance(s,(int,float)): items.append(s)
            if it.get('flag') and it.get('flag')!='无': flags[it['flag']]+=1
        if isinstance(g.get('overall'),(int,float)): ov.append(g['overall'])
    n=len(items)
    print(f"{v:20s} 出建议 {shown}/{len(d)} | 条数 {n} | 2分占比 {sum(1 for s in items if s==2)/max(1,n):.0%} | 0分占比 {sum(1 for s in items if s==0)/max(1,n):.0%} | 均分 {st.mean(items) if items else 0:.2f} | 组均分 {st.mean(ov) if ov else 0:.2f} | 最佳 {best.get(v,0)} | 扣分原因 {dict(flags)}")
