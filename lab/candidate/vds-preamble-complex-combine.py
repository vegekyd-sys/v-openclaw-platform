# Combine vds-preamble-complex-e2e.mjs candidate receipts: re-score two checker misses, per-mode and
# per-task tables, paired (same task, same rep) end-to-end time ratio v2/base with a bootstrap CI.
import json,re,random,sys
def load(f):
    o=json.load(open(f)); s=o['outcome']['stdout']; e=json.loads(s[:s.rindex('\n}')+2]); e['_cand']=o['id']; return e
def norm(s): return re.sub(r'[¥￥\s]','',re.sub(r'(\d),(?=\d{3})',r'\1',s or ''))
def hasnum(t,n): return re.search(r'(^|[^0-9.])'+re.escape(str(n))+r'(?:\.0+)?(?![0-9]|\.[0-9])',norm(t)) is not None
T=[]
# usage: python3 vds-preamble-complex-combine.py <candidate receipt JSON>... (the first long-mode receipt is
# the run whose expo check rejected 88,120.00; pass it with --long1 <file> to re-score it from the text)
args=sys.argv[1:]
long1=None
if '--long1' in args:
    i=args.index('--long1'); long1=args[i+1]; del args[i:i+2]; args.append(long1)
for f in args:
    e=load(f)
    for t in e['turns']:
        if t['task']=='paste': continue
        t['src']=f; t['rescored']=None
        if t['task']=='logs' and t['correct'] is False:
            h=t['expect']['hour']
            if re.search(r'(^|[^0-9])0?%d(\s*(点|时|:|：|Z\b|\s*UTC)|\s*-\s*%d)'%(h,h+1),t['finalText'] or '') and t['checkParts']['count'] and t['checkParts']['pct']:
                t['correct']=True; t['rescored']='logs hour written as NNZ'
        if t['task']=='expo' and t['correct'] is False and f==long1:
            x=t['expect']; ft=t['finalText'] or ''
            if hasnum(ft,x['diff']) and hasnum(ft,x['total']) and '橙果' in ft and re.search(r'(未|没有?|不)超|结余|剩余|还剩|超支\W{0,4}否',ft):
                t['correct']=True; t['rescored']='expo money written as 88,120.00 (answer verified from text; decision.md no longer available)'
        T.append(t)
def q(v,p):
    v=sorted(x for x in v if isinstance(x,(int,float))); return v[min(len(v)-1,int((len(v)-1)*p+0.5))] if v else None
def mean(v):
    v=[x for x in v if isinstance(x,(int,float))]; return sum(v)/len(v) if v else None
def row(R):
    s=lambda k:[t[k] for t in R]
    rounds=[(t['preToolMsgs'] or 0, max(1,(t['requests'] or 1)-1)) for t in R]
    zh=lambda txts: sum(1 for x in txts if not re.search(r'[一-鿿]',x))
    pre=[x for t in R for x in (t['preToolTexts'] or [])]
    return dict(n=len(R),ok=sum(1 for t in R if t['correct']),p50=q(s('sentToEndMs'),.5)/1000,p90=q(s('sentToEndMs'),.9)/1000,
      first50=q(s('sentToFirstCardTextMs'),.5)/1000,first90=q(s('sentToFirstCardTextMs'),.9)/1000,
      tools=mean(s('tools')),req=mean(s('requests')),out=mean(s('outputTokens')),reas=mean(s('reasoningTokens')),
      pre=mean(s('preToolMsgs')),narr=sum(a for a,b in rounds)/sum(b for a,b in rounds),firstPre=f"{sum(1 for t in R if t['preambleBeforeTool'])}/{sum(1 for t in R if t['preambleBeforeTool'] is not None)}",
      nonfinal=mean(s('nonFinalChars')),final=mean(s('finalChars')),card=mean(s('cardFinalChars')),en=f"{zh(pre)}/{len(pre)}",inmax=q(s('inputTokensMax'),.5))
fmt=lambda d:' '.join(f"{k}={round(v,2) if isinstance(v,float) else v}" for k,v in d.items())
for mode in ['new','long','all']:
    M=[t for t in T if mode=='all' or t['mode']==mode]
    print('=====',mode)
    for arm in ['base','v2']: print(' ',arm,fmt(row([t for t in M if t['arm']==arm])))
    # paired
    bt=[];vt=[]
    for t in M:
        if t['arm']!='base': continue
        v=[x for x in M if x['arm']=='v2' and x['task']==t['task'] and x['rep']==t['rep'] and x['mode']==t['mode']]
        bt.append(t['sentToEndMs']); vt.append(v[0]['sentToEndMs'])
    n=len(bt); d=sorted(b-a for a,b in zip(bt,vt)); random.seed(7); bs=[]
    for _ in range(10000):
        idx=[random.randrange(n) for _ in range(n)]; bs.append(sum(vt[i] for i in idx)/sum(bt[i] for i in idx))
    bs.sort(); print('  paired n',n,'v2 slower in',sum(1 for x in d if x>0),'median diff s',d[n//2]/1000,'sum ratio',round(sum(vt)/sum(bt),3),'95%CI',round(bs[250],3),round(bs[9750],3))
print('===== by task (both modes)  task arm n ok p50 p90 tools req out pre narr card')
for task in ['sales','calc','logs','expo','report','chain','config']:
    for mode in ['new','long']:
        for arm in ['base','v2']:
            r=row([t for t in T if t['task']==task and t['mode']==mode and t['arm']==arm])
            print(task,mode,arm,r['n'],r['ok'],round(r['p50'],1),round(r['p90'],1),round(r['tools'],1),round(r['req'],1),round(r['out']),round(r['pre'],1),round(r['narr'],2),round(r['card']))
print('rescored:',[(t['src'],t['arm'],t['task'],t['rep'],t['rescored']) for t in T if t['rescored']])
print('still wrong:',[(t['src'],t['arm'],t['task'],t['rep']) for t in T if not t['correct']])
print('===== paired per task: sum ratio v2/base, v2 slower count')
for task in ['sales','calc','logs','expo','report','chain','config']:
    for mode in ['new','long']:
        B=[t for t in T if t['task']==task and t['mode']==mode and t['arm']=='base']
        pr=[(b,[v for v in T if v['task']==task and v['mode']==mode and v['arm']=='v2' and v['rep']==b['rep']][0]) for b in B]
        print(task,mode,round(sum(v['sentToEndMs'] for b,v in pr)/sum(b['sentToEndMs'] for b,v in pr),2),sum(1 for b,v in pr if v['sentToEndMs']>b['sentToEndMs']),'/',len(pr),
          'diffs s',[round((v['sentToEndMs']-b['sentToEndMs'])/1000,1) for b,v in pr])
