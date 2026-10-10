# Blind pairwise comparison of two QC answers about the same image (judge does not know which came
# from the compressed image). Pairs: orig-orig, oc-oc (natural variance) and orig-oc (cross).
import json,os,sys,subprocess,random,re,concurrent.futures as cf
D=sys.argv[1]; V2=sys.argv[2] if len(sys.argv)>2 else 'oc'; CONC=int(sys.argv[3]) if len(sys.argv)>3 else 4; random.seed(11)
meta=json.load(open(f'{D}/meta.json'))
def ans(h,v,t):
  p=f'{D}/ans/{h}.{v}.{t}.json'
  return json.load(open(p)).get('text','') if os.path.exists(p) else ''
P=("下面是两个质检员看【同一张图】后写的报告 A 和 B（你看不到图）。请只比较两份报告在【事实判断】上的实质分歧，忽略措辞、详略、顺序。\n"
   "按类别列出分歧：text（抄写的文字内容不同）、subject（人物/物体外观判断冲突）、layout（排版/裁切/重叠判断冲突）、quality（对是否模糊/发糊/压缩痕迹的判断冲突）、issues（最该修的问题指向不同的东西）。\n"
   "只算互相矛盾或一方明确看到而另一方明确说没有的情况；一方多写了细节而另一方没提，不算矛盾，但记入 only_a/only_b。\n"
   "最后输出严格 JSON：{\"conflicts\":[{\"cat\":...,\"a\":...,\"b\":...}],\"only_a\":[...],\"only_b\":[...],\"quality_a\":\"有|无|未说\",\"quality_b\":\"有|无|未说\",\"severity\":0-3}，severity：0=无实质分歧，1=小分歧，2=明显分歧，3=结论相反。")
def judge(job):
  h,(va,ta),(vb,tb)=job
  out=f'{D}/judge/{h}.{va}{ta}-{vb}{tb}.json'
  if os.path.exists(out): return json.load(open(out))
  A,B=ans(h,va,ta),ans(h,vb,tb)
  if not A or not B: return None
  swap=random.random()<0.5
  if swap: A,B=B,A
  body={"model":"deepseek-flash","stream":False,"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":P+"\n\n=== 报告 A ===\n"+A+"\n\n=== 报告 B ===\n"+B}]}]}
  rp=out+'.req'; json.dump(body,open(rp,'w'))
  r=subprocess.run(['curl','-sS','--max-time','600','-H','@'+D+'/auth.hdr','-H','Content-Type: application/json','--data-binary','@'+rp,'https://api.deepseek.com/v1/responses'],capture_output=True,text=True); os.remove(rp)
  try:
    o=json.loads(r.stdout); txt=''.join(c.get('text','') for it in o.get('output',[]) if it.get('type')=='message' for c in it.get('content',[]))
    j=json.loads(re.search(r'\{.*\}',txt,re.S).group(0))
  except Exception as e: j={'error':str(e),'raw':r.stdout[:300]}
  if swap and 'error' not in j:
    j['only_a'],j['only_b']=j.get('only_b'),j.get('only_a'); j['quality_a'],j['quality_b']=j.get('quality_b'),j.get('quality_a')
    for c in j.get('conflicts',[]): c['a'],c['b']=c.get('b'),c.get('a')
  j.update(h=h,pair=f'{va}{ta}-{vb}{tb}',kind=('same-'+va) if va==vb else ('cross-'+vb))
  json.dump(j,open(out,'w'),ensure_ascii=False); return j
os.makedirs(f'{D}/judge',mode=0o700,exist_ok=True)
jobs=[]
for m in meta:
  pairs=[(('orig',0),('orig',1))] if V2=='oc' else []
  pairs+=[((V2,0),(V2,1)),(('orig',0),(V2,0)),(('orig',1),(V2,1)),(('orig',0),(V2,1)),(('orig',1),(V2,0))]
  for pa,pb in pairs:
    jobs.append((m['h'],pa,pb))
with cf.ThreadPoolExecutor(CONC) as ex:
  for j in ex.map(judge,jobs):
    if j: print(j.get('h'),j.get('kind'),j.get('pair'),'sev',j.get('severity'),'conf',len(j.get('conflicts',[])),j.get('quality_a'),j.get('quality_b'),j.get('error','')[:60],flush=True)
