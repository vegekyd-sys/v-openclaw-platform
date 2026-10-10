import os,json,urllib.request,urllib.error,gzip,time,sys
KEY=os.environ['DEEPSEEK_API_KEY']; URL='https://api.deepseek.com/v1/responses'
def post(body,extra_headers=None,raw=None,timeout=180):
    data=raw if raw is not None else json.dumps(body).encode()
    h={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}
    if extra_headers:h.update(extra_headers)
    t=time.time()
    try:
        r=urllib.request.urlopen(urllib.request.Request(URL,data=data,headers=h),timeout=timeout)
        return r.status,json.loads(r.read()),time.time()-t,len(data)
    except urllib.error.HTTPError as e:
        return e.code,e.read()[:400].decode('utf-8','ignore'),time.time()-t,len(data)
def short(o):
    if isinstance(o,dict):
        out=[x for x in o.get('output',[]) if x.get('type')=='message']
        txt=out[0]['content'][0].get('text','') if out else ''
        return {'id':o.get('id'),'store':o.get('store'),'prev':o.get('previous_response_id'),'usage':o.get('usage'),'text':txt[:120]}
    return o
mode=sys.argv[1]
if mode=='state':
    s,o,dt,_=post({'model':'deepseek-flash','input':'记住暗号：蓝色长颈鹿42。只回复"好"。','store':True})
    print('A',s,short(o),round(dt,1))
    rid=o['id'] if isinstance(o,dict) else None
    s,o,dt,_=post({'model':'deepseek-flash','input':'我刚才说的暗号是什么？只回复暗号本身，不知道就回复"不知道"。','previous_response_id':rid,'store':True})
    print('B prev',s,short(o),round(dt,1))
    # GET stored response
    try:
        r=urllib.request.urlopen(urllib.request.Request(URL+'/'+str(rid),headers={'Authorization':'Bearer '+KEY}),timeout=60); print('GET',r.status,str(r.read()[:200]))
    except urllib.error.HTTPError as e: print('GET',e.code,e.read()[:200])
    s,o,dt,_=post({'model':'deepseek-flash','input':[{'type':'message','role':'user','content':[{'type':'input_text','text':'hi, reply ok'}]}],'conversation':'conv_test'})
    print('conversation param',s,short(o))
    raw=gzip.compress(json.dumps({'model':'deepseek-flash','input':'reply ok'}).encode())
    s,o,dt,_=post(None,{'Content-Encoding':'gzip'},raw)
    print('gzip',s,short(o))
    s,o,dt,_=post(None,{'Content-Encoding':'zstd'},raw)
    print('zstd-mislabel',s,short(o))
elif mode=='size':
    for mb in [float(x) for x in sys.argv[2:]]:
        n=int(mb*1024*1024)
        raw=b'{"model":"deepseek-flash","input":"'+b'a'*(n-40)
        s,o,dt,L=post(None,raw=raw,timeout=600)
        print(f'{mb}MiB bytes={L} status={s} t={dt:.1f}s body={str(o)[:160]}',flush=True)
elif mode=='image':
    import base64
    for path in sys.argv[2:]:
        b=open(path,'rb').read(); mime='image/png' if path.endswith('.png') else 'image/jpeg'
        body={'model':'deepseek-flash','input':[{'type':'message','role':'user','content':[{'type':'input_text','text':'图里有什么形状、什么颜色？图中两行英文字分别是什么？简短回答。'},{'type':'input_image','image_url':f'data:{mime};base64,'+base64.b64encode(b).decode(),'detail':'high'}]}]}
        s,o,dt,L=post(body)
        print(path,len(b),'reqbytes',L,s,short(o),round(dt,1),flush=True)
