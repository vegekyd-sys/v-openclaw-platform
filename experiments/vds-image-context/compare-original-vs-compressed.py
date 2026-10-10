# Ask deepseek-flash the same QC question about each image, original PNG (Codex native view_image)
# vs OpenClaw view_image output, shaped exactly like a Codex function_call_output.
import json,os,sys,base64,subprocess,time,concurrent.futures as cf
D=sys.argv[1]; TRIALS=int(sys.argv[2]); RATE=sys.argv[3]; CONC=int(sys.argv[4]); VARIANTS=(sys.argv[5] if len(sys.argv)>5 else 'orig,oc').split(',')
meta=json.load(open(f'{D}/meta.json'))
Q=("你在做视频/设计成片质检。我已经用 view_image 打开了这张图，请仔细看后用中文回答：\n"
   "1) 逐字抄写图中所有可见文字（看不清的字写[?]，没有文字写“无”）；\n"
   "2) 画面主体：人物数量与外观（发型、服装、配饰、表情）或主要物体；\n"
   "3) 排版与构图：主要元素位置、有无重叠/遮挡/裁切/对齐问题；\n"
   "4) 画质：有没有模糊、文字发糊、锯齿、色带、压缩痕迹，先答“有/无”再说位置；\n"
   "5) 你认为最需要修的 3 个问题。")
TOOLS=[{"type":"function","name":"view_image","description":"View a local image from the filesystem.","parameters":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}}]
os.makedirs(f'{D}/req',mode=0o700,exist_ok=True); os.makedirs(f'{D}/ans',mode=0o700,exist_ok=True)
def body(m,variant):
  f=m['file'] if variant=='orig' else m[variant]['file']; mime='image/png' if f.endswith('.png') else 'image/jpeg'
  b64=base64.b64encode(open(f'{D}/{f}','rb').read()).decode()
  path=json.loads(m['arg'])['path']
  return {"model":"deepseek-flash","stream":False,"tools":TOOLS,"input":[
    {"type":"message","role":"user","content":[{"type":"input_text","text":Q}]},
    {"type":"reasoning","summary":[],"content":[{"type":"reasoning_text","text":"先用 view_image 打开这张图再逐项检查。"}]},
    {"type":"function_call","call_id":"call_1","name":"view_image","arguments":json.dumps({"path":path})},
    {"type":"function_call_output","call_id":"call_1","output":[{"type":"input_image","image_url":f"data:{mime};base64,{b64}","detail":"high"}]}]}
def run(job):
  m,variant,trial=job; key=f"{m['h']}.{variant}.{trial}"; out=f'{D}/ans/{key}.json'
  if os.path.exists(out): return json.load(open(out))
  rp=f'{D}/req/{key}.json'; json.dump(body(m,variant),open(rp,'w'))
  t=time.time()
  r=subprocess.run(['curl','-sS','--limit-rate',RATE,'--max-time','600','-o','-','-w','\n%{http_code} %{size_upload} %{time_starttransfer} %{time_total}',
     '-H','@'+D+'/auth.hdr','-H','Content-Type: application/json','--data-binary','@'+rp,'https://api.deepseek.com/v1/responses'],capture_output=True,text=True)
  os.remove(rp)
  txt,_,stat=r.stdout.rpartition('\n'); code,up,ttfb,tot=(stat.split()+['0']*4)[:4]
  rec=dict(h=m['h'],variant=variant,trial=trial,code=int(code or 0),upload=int(float(up)),ttfb=float(ttfb),total=float(tot))
  try:
    o=json.loads(txt); rec['usage']=o.get('usage')
    rec['text']=''.join(c.get('text','') for it in o.get('output',[]) if it.get('type')=='message' for c in it.get('content',[]))
  except Exception: rec['err']=(txt or r.stderr)[:300]
  json.dump(rec,open(out,'w'),ensure_ascii=False); return rec
jobs=[(m,v,t) for t in range(TRIALS) for m in meta for v in VARIANTS]
with cf.ThreadPoolExecutor(CONC) as ex:
  for rec in ex.map(run,jobs):
    u=rec.get('usage') or {}
    print(rec['h'],rec['variant'],rec['trial'],rec['code'],f"up={rec['upload']/1e6:.2f}MB",f"in_tok={u.get('input_tokens')}",f"ttfb={rec['ttfb']:.1f}s",f"total={rec['total']:.1f}s",len(rec.get('text','')),rec.get('err','')[:80],flush=True)
