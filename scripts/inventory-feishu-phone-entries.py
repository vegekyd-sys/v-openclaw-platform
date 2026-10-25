# Read metadata only; never reads messages or copies a database.
import argparse,json,os,re,sqlite3
from pathlib import Path
args=argparse.ArgumentParser()
for name in ['database','phones','account','app-id','output']:args.add_argument('--'+name,required=True)
a=args.parse_args()
os.umask(0o077)
root=Path(a.output);root.mkdir(mode=0o700,exist_ok=False)
c=sqlite3.connect(Path(a.database).resolve().as_uri()+'?mode=ro',uri=True,timeout=3)
rows={}; known_users={}; unknown_users=set()
def add(chat,source,alias=None):
 if not isinstance(chat,str) or not re.fullmatch(r'oc_[A-Za-z0-9]+',chat):return False
 r=rows.setdefault(chat,{'chat':chat,'source':source,'legacyPhoneIds':[]})
 if alias and alias not in r['legacyPhoneIds']:r['legacyPhoneIds'].append(alias)
 return True
for native,target,user,peer in c.execute("select native_channel_id,delivery_target,native_direct_user_id,peer_id from conversations where channel='feishu' and account_id=? and kind='direct'",(a.account,)):
 chat=native or (target.removeprefix('chat:') if target else None)
 if add(chat,'session_conversation_dm'):
  if user:known_users[user]=chat
  if peer and peer.startswith('ou_'):known_users[peer]=chat
 elif user or peer:unknown_users.add(user or peer)
for origin in c.execute("select json_extract(entry_json,'$.delivery.origin') from session_nodes where session_key like 'agent:makaron:feishu:direct:%'"):
 d=json.loads(origin[0] or '{}')
 if d.get('accountId') not in [a.account]:continue
 if add(d.get('nativeChannelId'),'session_origin_dm') and d.get('nativeDirectUserId'):known_users[d['nativeDirectUserId']]=d['nativeChannelId']
c.close()
phones=json.load(open(a.phones))
for p in phones:
 if p.get('accountId') not in [a.account,a.app_id]:continue
 chat=p.get('nativeChatId')
 if p.get('kind')=='group':
  m=re.fullmatch(r'agent:makaron:feishu:group:(oc_[A-Za-z0-9]+)',p.get('sessionKey',''));chat=m[1] if m else None
 add(chat,'legacy_phone_mapping',p.get('id'))
result={'chats':list(rows.values()),'unresolvedDirectUsers':sorted(unknown_users-set(known_users))}
(root/'inventory.private.json').write_text(json.dumps(result))
print(json.dumps({'knownChats':len(rows),'legacyPhoneRecords':len(phones),'unresolvedDirectUsers':len(result['unresolvedDirectUsers']),'inventory':str(root/'inventory.private.json')}))
