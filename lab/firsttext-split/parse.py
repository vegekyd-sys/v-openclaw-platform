import json,sys,re
from datetime import datetime,timezone,timedelta
rows=[]
for line in open('ft.log'):
    i=line.find('{"v":1')
    if i<0: continue
    try: d=json.loads(line[i:])
    except Exception: continue
    d['_pid']=re.search(r'node\[(\d+)\]',line).group(1)
    rows.append(d)
json.dump(rows,open('ft.json','w'))
print(len(rows))
import collections
print(collections.Counter((r.get('agentRuntime'),r.get('model')) for r in rows).most_common(10))
print(collections.Counter(r['_pid'] for r in rows))
keys=collections.Counter(k for r in rows for k in r)
print(keys)
