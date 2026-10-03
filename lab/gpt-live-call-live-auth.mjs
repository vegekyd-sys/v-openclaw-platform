import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

/** Configure OAuth, then copy only a valid access token after the private DB initializes. */
export const CANDIDATE_OPENAI_ACCESS_FIELDS = ['type', 'provider', 'access', 'expires', 'accountId'];
export function configureCandidateOpenAIAuth(config){
  const profileId=process.env.GPT_LIVE_CALL_ACCESS_FIXTURE?'openai:gpt-live-call-private':'openai:vlab-gpt-subscription';
  config.auth={...(config.auth??{}),profiles:{[profileId]:{provider:'openai',mode:'oauth'}},order:{openai:[profileId]}};
}

export function installCandidateOpenAIAuth(){
  const shared=process.env.VLAB_SHARED_STATE_DIR;
  const state=process.env.OPENCLAW_STATE_DIR;
  assert(shared&&state,'candidate state paths required');
  const accessFixture=process.env.GPT_LIVE_CALL_ACCESS_FIXTURE;
  const profileId=accessFixture?'openai:gpt-live-call-private':'openai:vlab-gpt-subscription';
  const python=`import base64,json,os,shutil,sqlite3,sys,time
shared,state,profile_id,access_fixture=sys.argv[1:]
src_path=os.path.join(shared,'agents/makaron/agent/openclaw-agent.sqlite')
dst_path=os.path.join(state,'agents/makaron/agent/openclaw-agent.sqlite')
template_path=os.path.join(state,'agents/openclaw/agent/openclaw-agent.sqlite')
src=None
if access_fixture:
 with open(access_fixture) as f: profile=json.load(f)
 assert all(key in ${JSON.stringify(CANDIDATE_OPENAI_ACCESS_FIELDS)} for key in profile),'access fixture contains fields outside the access-only allowlist'
else:
 src=sqlite3.connect('file:'+src_path+'?mode=ro',uri=True)
 raw=src.execute("select store_json from auth_profile_store where store_key='primary'").fetchone()
 assert raw,'shared VLab auth profile store is empty'
 profile=json.loads(raw[0])['profiles'][profile_id].copy()
assert profile.get('type')=='oauth' and profile.get('provider')=='openai'
access=profile.get('access','')
parts=access.split('.')
assert len(parts)==3,'OAuth access token is not a JWT'
claims=json.loads(base64.urlsafe_b64decode(parts[1]+'==='))
assert claims.get('exp',0)>time.time()+600,'shared VLab OAuth access expired'
profile={key:profile[key] for key in ${JSON.stringify(CANDIDATE_OPENAI_ACCESS_FIELDS)} if key in profile}
if not os.path.exists(dst_path):
 assert os.path.exists(template_path),'candidate database template missing'
 os.makedirs(os.path.dirname(dst_path),exist_ok=True)
 shutil.copyfile(template_path,dst_path)
dst=sqlite3.connect(dst_path)
dst.execute("update schema_meta set agent_id='makaron' where agent_id='openclaw'")
for table in ('auth_profile_store','auth_profile_state'):
 assert dst.execute("select 1 from sqlite_master where type='table' and name=?",(table,)).fetchone(),table+' missing'
now=int(time.time()*1000)
store={'version':1,'profiles':{profile_id:profile}}
state_row={'version':1,'order':{'openai':[profile_id]},'lastGood':{'openai':profile_id},'usageStats':{}}
dst.execute('insert or replace into auth_profile_store(store_key,store_json,updated_at) values(?,?,?)',('primary',json.dumps(store),now))
dst.execute('insert or replace into auth_profile_state(state_key,state_json,updated_at) values(?,?,?)',('primary',json.dumps(state_row),now))
dst.commit();dst.close()
if src:src.close()
print('candidate_openai_access_copied_no_refresh')`;
  const output=execFileSync('python3',['-c',python,shared,state,profileId,accessFixture?process.cwd()+'/'+accessFixture:''],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  assert.equal(output,'candidate_openai_access_copied_no_refresh');
}
