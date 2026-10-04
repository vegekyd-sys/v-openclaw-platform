import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installCandidateOpenAIAuth } from "./gpt-live-call-live-auth.mjs";

const fields = ["type", "provider", "access", "expires", "accountId"];
const authEnvironment = () => Object.fromEntries(["VLAB_SHARED_STATE_DIR", "OPENCLAW_STATE_DIR", "GPT_LIVE_CALL_ACCESS_FIXTURE"].map((key) => [key, process.env[key]]));
const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const validProfile = () => ({
  type: "oauth",
  provider: "openai",
  // Entirely synthetic JWT. The helper checks shape/expiry, never verifies or uses it online.
  access: `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`,
  expires: Date.now() + 3_600_000,
  accountId: "synthetic-test-account",
});

function python(source, payload) {
  return execFileSync("python3", ["-c", source], { input: JSON.stringify(payload), encoding: "utf8" });
}

function createDatabase(file, { agentId, profiles = {} }) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  python(`import json,sqlite3,sys
data=json.load(sys.stdin)
db=sqlite3.connect(data['file'])
db.executescript('''
create table schema_meta(agent_id text);
create table auth_profile_store(store_key text primary key,store_json text,updated_at integer);
create table auth_profile_state(state_key text primary key,state_json text,updated_at integer);
''')
db.execute('insert into schema_meta values(?)',(data['agentId'],))
db.execute('insert into auth_profile_store values(?,?,?)',('primary',json.dumps({'version':1,'profiles':data['profiles']}),1))
db.execute('insert into auth_profile_state values(?,?,?)',('primary',json.dumps({'version':1,'usageStats':{'sentinel':'preserve-shared'}}),1))
db.commit();db.close()`, { file, agentId, profiles });
}

function readDatabase(file) {
  return JSON.parse(python(`import json,sqlite3,sys
data=json.load(sys.stdin)
db=sqlite3.connect('file:'+data['file']+'?mode=ro',uri=True)
result={'agentIds':[row[0] for row in db.execute('select agent_id from schema_meta')],
'store':json.loads(db.execute("select store_json from auth_profile_store where store_key='primary'").fetchone()[0]),
'state':json.loads(db.execute("select state_json from auth_profile_state where state_key='primary'").fetchone()[0])}
db.close();print(json.dumps(result))`, { file }));
}

function fixture(t, sharedProfile = validProfile()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gpt-live-auth-test-"));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const shared = path.join(root, "shared");
  const state = path.join(root, "private");
  const sharedDb = path.join(shared, "agents/makaron/agent/openclaw-agent.sqlite");
  const templateDb = path.join(state, "agents/openclaw/agent/openclaw-agent.sqlite");
  const privateDb = path.join(state, "agents/makaron/agent/openclaw-agent.sqlite");
  createDatabase(sharedDb, { agentId: "makaron", profiles: {
    "openai:vlab-gpt-subscription": sharedProfile,
    "unrelated-profile": { type: "api_key", provider: "synthetic-provider", key: "fake-unrelated-key" },
  } });
  createDatabase(templateDb, { agentId: "openclaw" });
  return { root, shared, state, sharedDb, templateDb, privateDb };
}

function install(f, accessFixture, absolute = false) {
  const values = {
    VLAB_SHARED_STATE_DIR: f.shared,
    OPENCLAW_STATE_DIR: f.state,
    GPT_LIVE_CALL_ACCESS_FIXTURE: accessFixture ? absolute ? accessFixture : path.relative(process.cwd(), accessFixture) : undefined,
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    installCandidateOpenAIAuth();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("shared OAuth profiles copy only access fields into a private DB and leave shared bytes unchanged", (t) => {
  const accessOnly = validProfile();
  const sharedProfile = { ...accessOnly,
    refresh: "fake-refresh", refresh_token: "fake-refresh-snake", refreshToken: "fake-refresh-camel",
    id_token: "fake-identity-snake", idToken: "fake-identity-camel", unrelatedMetadata: "do-not-copy",
  };
  const f = fixture(t, sharedProfile);
  const before = digest(f.sharedDb);
  const templateBefore = digest(f.templateDb);
  const sharedBefore = readDatabase(f.sharedDb);
  const environmentBefore = authEnvironment();
  install(f);
  assert.deepEqual(authEnvironment(), environmentBefore);
  const result = readDatabase(f.privateDb);
  assert.deepEqual(result.agentIds, ["makaron"]);
  assert.deepEqual(Object.keys(result.store.profiles), ["openai:vlab-gpt-subscription"]);
  const copied = result.store.profiles["openai:vlab-gpt-subscription"];
  assert.deepEqual(Object.keys(copied).sort(), fields.toSorted());
  assert.deepEqual(copied, accessOnly);
  assert.deepEqual(result.state.order, { openai: ["openai:vlab-gpt-subscription"] });
  assert.deepEqual(result.state.lastGood, { openai: "openai:vlab-gpt-subscription" });
  assert.equal(digest(f.sharedDb), before);
  assert.deepEqual(readDatabase(f.sharedDb), sharedBefore);
  assert.equal(digest(f.templateDb), templateBefore);
});

test("access fixtures reject token aliases and every other field before writing a private profile", (t) => {
  const f = fixture(t);
  const sharedBefore = digest(f.sharedDb);
  const templateBefore = digest(f.templateDb);
  const file = path.join(f.root, "access-fixture.json");
  const environmentBefore = authEnvironment();
  for (const key of ["refresh", "refresh_token", "refreshToken", "id_token", "idToken", "extraMetadata"]) {
    fs.writeFileSync(file, JSON.stringify({ ...validProfile(), [key]: "fake-forbidden-value" }), { mode: 0o600 });
    assert.throws(() => install(f, file), /access-only allowlist/u, `${key} was accepted`);
    assert.deepEqual(authEnvironment(), environmentBefore);
    assert.equal(fs.existsSync(f.privateDb), false, `${key} wrote a private profile`);
    assert.equal(digest(f.sharedDb), sharedBefore);
    assert.equal(digest(f.templateDb), templateBefore);
  }
});

test("a valid synthetic access-only fixture initializes the private profile without reading shared credentials", (t) => {
  const f = fixture(t);
  const profile = validProfile();
  const file = path.join(f.root, "access-fixture.json");
  fs.writeFileSync(file, JSON.stringify(profile), { mode: 0o600 });
  // Remove the shared DB to prove this branch does not read shared credentials.
  fs.rmSync(f.sharedDb);
  const environmentBefore = authEnvironment();
  install(f, file);
  assert.deepEqual(authEnvironment(), environmentBefore);
  const result = readDatabase(f.privateDb);
  assert.deepEqual(result.agentIds, ["makaron"]);
  assert.deepEqual(result.store.profiles, { "openai:gpt-live-call-private": profile });
  assert.deepEqual(result.state.order, { openai: ["openai:gpt-live-call-private"] });
  assert.equal(fs.existsSync(f.sharedDb), false);
});

test('an absolute private server fixture works without carrying credentials in Candidate inputs', t=>{
  const f=fixture(t),profile=validProfile(),file=path.join(f.root,'server-access.json');
  fs.writeFileSync(file,JSON.stringify(profile),{mode:0o600});fs.rmSync(f.sharedDb);
  install(f,file,true);assert.deepEqual(readDatabase(f.privateDb).store.profiles,{'openai:gpt-live-call-private':profile});
});

test('public or symlink access fixtures are rejected before private auth is written',t=>{
  const f=fixture(t),file=path.join(f.root,'server-access.json'),link=path.join(f.root,'link.json');
  fs.writeFileSync(file,JSON.stringify(validProfile()),{mode:0o644});
  assert.throws(()=>install(f,file,true),/private regular file/);assert.equal(fs.existsSync(f.privateDb),false);
  fs.chmodSync(file,0o600);fs.symlinkSync(file,link);
  assert.throws(()=>install(f,link,true),/private regular file/);assert.equal(fs.existsSync(f.privateDb),false);
});
