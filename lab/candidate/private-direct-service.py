"""Prepare an isolated Voice service on VLab; credentials stay on that host."""
import json,os,pathlib,pwd,re,subprocess,sys,time
root=pathlib.Path(sys.argv[1]); origin=sys.argv[2]
assert str(root).startswith('/srv/vlab-production-mirror/labs/voice-private-direct-')
if origin=='--run':
    env=json.loads((root/'private/environment.json').read_text())
    node='/opt/vlab/node-v22.23.1-linux-x64/bin/node'
    os.execve(node,[node,str(root/'voice/lab/gpt-live-h5/server.mjs')],env)
assert re.fullmatch(r'https://[a-z0-9-]+\.trycloudflare\.com',origin)
def process_env(unit):
    pid=subprocess.check_output(['systemctl','show',unit,'-p','MainPID','--value'],text=True).strip()
    return dict(x.split('=',1) for x in pathlib.Path('/proc/'+pid+'/environ').read_text().split('\0') if '=' in x)
shared=process_env('openclaw-vlab-production-mirror-v8.service')
voice=process_env('vlab-voice-feishu-phone-b7950421-3807-42ab-9352-163e10305ab9.service')
config=json.loads(pathlib.Path(shared['OPENCLAW_CONFIG_PATH']).read_text())
app=config['channels']['feishu'];assert app['appId']=='cli_aae2c999c7789bd9'
secret=re.sub(r'\$\{([^}]+)\}',lambda m:shared.get(m[1],''),app['appSecret']);assert secret
private=root/'private';private.mkdir(mode=0o700,exist_ok=True)
owner=pwd.getpwnam('lab-db91-parity')
def save(name,data):
    path=private/name;path.write_text(json.dumps(data,ensure_ascii=False));path.chmod(0o600);os.chown(path,owner.pw_uid,owner.pw_gid)
save('login.json',{'appId':app['appId'],'appSecret':secret,'actors':[],'accountId':'default','conversations':True,'allowUnidentified':True,'cardConfirmation':True,'privateConversationsFile':str(root/'private/conversations.private.json')})
save('phones.json',[])
save('candidate-release.json',{'version':'private-direct.candidate.20261027','title':'私聊底部菜单候选','items':['菜单默认显示输入框；从菜单直接进入共用电话页。','本轮验证入口与身份，未进行真实音频验收。']})
env={**shared}
for key in ['VOLCENGINE_REALTIME_API_KEY','DOUBAO_SPEECH_API_KEY','XAI_API_KEY','VOLCENGINE_ASR_API_KEY','OPENAI_API_KEY','VOICE_NATIVE_PLAYBACK_POLICY']:
    if voice.get(key):env[key]=voice[key]
env.update({'OPENCLAW_CONFIG_PATH':shared['OPENCLAW_CONFIG_PATH'],'OPENCLAW_STATE_DIR':str(private/'state'),
    'GPT_LIVE_H5_PORT':'29572','GPT_LIVE_H5_BASE_PATH':'/voice','GPT_LIVE_H5_PUBLIC_ORIGIN':origin,
    'GPT_LIVE_H5_ACCESS_TOKEN':os.urandom(32).hex(),'VOICE_FEISHU_LOGIN_FILE':str(private/'login.json'),
    'VOICE_ENTRIES_FILE':str(private/'phones.json'),'VOICE_IOS_PUBLIC_ENTRY':'1','VOICE_PUBLIC_TOOLS':'0',
    'VOICE_IOS_BINDINGS_FILE':str(private/'ios-bindings.json'),'VOICE_CALL_REPORTS_DIR':str(private/'reports'),
    'RTC_H5_TRANSCRIPT_DIR':str(private/'transcripts'),'RTC_H5_AVATAR_LOG_DIR':str(private/'avatar-events'),
    'VOICE_RELEASE_SOCKET':str(private/'release.sock'),'VOICE_CANDIDATE_RELEASE_FILE':str(private/'candidate-release.json'),'VOICE_PHONE_INPUT_POLICY':'native',
    'VOICE_DEFAULT_MODEL':'seeduplex'})
for key in ['VOICE_DEVICES_FILE','VOICE_PERSONAL_REPLY_ACCOUNT_ID','VOICE_FEISHU_ACCOUNTS_FILE']:
    env.pop(key,None)
save('environment.json',env)
print(json.dumps({'prepared':True,'origin':origin,'productionChanged':False,'groupsChanged':False}))
