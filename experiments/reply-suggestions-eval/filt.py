import re
EMPTY=re.compile(r'^(好的?|继续|谢谢|收到|明白了?|OK|ok|嗯+|可以|行|辛苦了?)[，。！!~]*$')
GENERIC=re.compile(r'详细(说|讲|介绍)|具体(说说|讲讲)|展开(说|讲)|还有(吗|别的|其他)|举个例子|再解释|总结一下|有什么建议|能说说|多说一点|怎么看')
def width(s):  # CJK=1, ASCII≈0.5
    return sum(1 if ord(c)>0x2e80 else 0.5 for c in s)
def bigrams(s):
    s=re.sub(r'\s','',s); return {s[i:i+2] for i in range(len(s)-1)}
def jacc(a,b):
    A,B=bigrams(a),bigrams(b)
    return len(A&B)/max(1,len(A|B))
def filt(sugs, maxw=20, minkeep=2):
    out=[]; dropped=[]
    for s in sugs or []:
        if not isinstance(s,str): continue
        s=s.strip().rstrip('。.')
        why=None
        if not s: why='empty'
        elif EMPTY.match(s): why='空话'
        elif GENERIC.search(s): why='泛泛'
        elif width(s)>maxw: why='过长'
        elif any(jacc(s,o)>=0.5 for o in out): why='重复'
        if why: dropped.append((s,why))
        else: out.append(s)
    out=out[:3]
    return (out if len(out)>=minkeep else []), dropped
