import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {cardImageLinks, patchFeishuCardImages} from './patch-feishu-card-images.mjs';
const local = new URL('./release-files/desktop-handback-progress/monitor.account-WFdlCDhR.js', import.meta.url);
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const candidates = runtime ? fs.readdirSync(path.join(runtime,'npm/projects')).filter(n=>n.startsWith('openclaw-feishu-')).flatMap(n=>{
 const dir=path.join(runtime,'npm/projects',n,'node_modules/@openclaw/feishu/dist');
 return fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/^monitor.account-.*\.js$/.test(f)).map(f=>path.join(dir,f)):[];
}) : [];
if(runtime)assert.equal(candidates.length,1,'one runtime Feishu monitor');
const before=fs.readFileSync(candidates[0]??local,'utf8');
const after=patchFeishuCardImages(before);
console.log('BASELINE',candidates[0]??local.pathname);

function fixture(source,{closed=false,fail=false,sent=''}={}) {
 const calls=[];let visible=sent;
 const deps={performance,setTimeout,clearTimeout,process,cardImageLinks,
  VFEISHU_CARD_PRECREATE_ENABLED:true,STREAMING_UPDATE_THROTTLE_MS:160,
  resolveApiBase:()=> 'https://test.invalid',resolveAllowedHostnames:()=>[],getToken:async()=> 'fixture',getFeishuUserAgent:()=> 'fixture',
  shouldPushStreamingUpdate:()=>true,truncateSummary:s=>s.slice(0,50),
  ocCardPhaseStart:()=>()=>{},ocCardPhaseAwait:(_log,_card,_phase,fn)=>fn(),
  FeishuStreamingFinalizationError:class extends Error{constructor(cause,result){super(String(cause));this.result=result;}},
  assertSuccessfulCardKitResponse:async r=>{if(r.code)throw Error(r.message);},
  fetchWithSsrFGuard:async({url,init})=>{
   const body=JSON.parse(init.body),content=body.element?JSON.parse(body.element).content:body.content;
   calls.push({url,body,content});let code=0,message='';
   if(fail){code=500;message='provider unavailable';}
   else if(url.endsWith('/content/content')&&closed){code=300309;message='streaming mode is closed';}
   else if(content && /!\[[^\]]*\]\(https?:\/\//.test(content)){code=200570;message='invalid image keys';}
   if(!code&&content!==undefined)visible=content;
   if(!code&&body.settings)closed=!JSON.parse(body.settings).config.streaming_mode;
   return {response:{code,message},release:async()=>{}};
  },
 };
 const start=source.indexOf('var FeishuStreamingSession = class {'),end=source.indexOf('\n};',start)+4;
 const Class=vm.runInNewContext(source.slice(start,end)+';FeishuStreamingSession',deps);
 const session=new Class({},{});session.state={cardId:'card_fixture',messageId:'message_fixture',sequence:10,currentText:sent,sentText:sent};
 return {session,calls,visible:()=>visible};
}
const image='结果：![预览](https://example.test/a(1).jpg)';
test('baseline reproduces invalid image rejection and closed stream retry failure',async()=>{
 const a=fixture(before);await a.session.update(image);assert.equal(a.visible(),'');
 await assert.rejects(a.session.closeWithResult(image),/invalid image keys/);
 const retry=fixture(before,{closed:true});await assert.rejects(retry.session.closeWithResult('完整结果'),/streaming mode is closed/);
});
test('remote images become links; native keys, code, escapes and URLs are preserved',()=>{
 assert.equal(cardImageLinks('![](https://example.test/a.png)'), '[图片](https://example.test/a.png)');
 const url='https://example.test/a(b).png?x=1&y=2';
 assert.equal(cardImageLinks(`![a [b]](${url} "title")`),`[a [b]](${url} "title")`);
 for(const s of ['![原生](img_v3_valid)','`![代码](https://x)`','```md\n![code](https://x)\n```','~~~md\n![code](https://x)\n~~~','\\![escaped](https://x)','![incomplete]('])assert.equal(cardImageLinks(s),s);
 assert.equal(cardImageLinks(image),image.slice(0,3)+image.slice(4));
});
test('partial then final writes same visible text and receipt',async()=>{
 const f=fixture(after);await f.session.update(image);const r=await f.session.closeWithResult(image+' 完成');
 assert.equal(r.visibleReplySent,true);assert.equal(r.content,cardImageLinks(image+' 完成'));assert.equal(f.visible(),r.content);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/content/content')).length,0);
 assert.deepEqual(f.calls.map(c=>c.body.sequence),[11,12,13]);
});
test('restart recovery of already closed card replaces final body successfully',async()=>{
 const f=fixture(after,{closed:true,sent:'处理中'});const r=await f.session.closeWithResult(image);
 assert.equal(r.visibleReplySent,true);assert.equal(r.content,cardImageLinks(image));assert.equal(f.visible(),r.content);
});
test('provider rejection remains an error and never acknowledges rejected final',async()=>{
 const f=fixture(after,{fail:true,sent:'旧进度'});
 await assert.rejects(f.session.closeWithResult(image),e=>{assert.equal(e.result.content,'旧进度');assert.notEqual(e.result.content,cardImageLinks(image));return true;});
});
test('patch refuses drift and double application',()=>{
 assert.throws(()=>patchFeishuCardImages(after),/already patched/);
 assert.throws(()=>patchFeishuCardImages(before.replace('async update(text)','async update(content)')),/anchor drift/);
});

test('release files are the builder output from V bytes', async () => {
 const { build } = await import('./build-feishu-card-images.mjs');
 const { createHash } = await import('node:crypto');
 for (const f of build({ write: false })) {
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(`../${f.source}`, import.meta.url))).digest('hex'), f.after, f.source);
 }
});

test('a task card rejected every time stops after 20 failures in a process; a restart tries again', async (t) => {
 const os = await import('node:os');
 const { TaskPresentationManager } = await import('./release-files/feishu-card-images/v-feishu-task-presentation.mjs');
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'v-card-retry-'));
 t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
 const entry = { sessionId: 's1', delivery: { kind: 'external', context: { channel: 'feishu', accountId: 'work', to: 'chat:oc_test' } } };
 let now = 1000, finishes = 0, reject = true;
 const manager = (warn) => {
  const m = new TaskPresentationManager({ directory, getEntry: () => entry });
  m.now = () => now; m.logger = { warn };
  m.registerAccount('work', { authorize: async () => {}, open: async (r, save) => { r.anchorId ??= 'anchor'; await save({ anchorId: r.anchorId });
   return { start: async () => {}, partial: async () => {}, tool: async () => {}, cleanup: async () => {},
    finish: async () => { finishes++; if (reject) throw Error('card contains invalid image keys'); } }; } });
  t.after(() => m.close());
  return m;
 };
 const warnings = [];
 const a = manager((w) => warnings.push(w));
 const h = await a.open({ agentId: 'test', sessionKey: 'agent:test:feishu:group:oc_test', source: 'voice-native', taskId: 'task-1', runId: 'run-1', text: '任务' }, { trusted: true });
 await h.flush();
 await h.finish({ text: '![a](https://x.test/a.png)' });
 for (let i = 0; i < 40; i++) { now += 61000; await a.retryPending(); await h.flush(); }
 assert.equal(finishes, 20);
 assert.equal(h.record.delivered, false);
 assert.equal(warnings.filter((w) => w.includes('giving up')).length, 1);
 reject = false; now += 61000;
 const b = manager(() => {});
 await b.recover(); await b.retryPending();
 const recovered = [...b.tasks.values()][0]; await recovered.flush();
 assert.equal(recovered.record.delivered, true);
});

test('retry cap patch refuses drift and double application', async () => {
 const { patchTaskPresentationRetryCap } = await import('./patch-feishu-card-images.mjs');
 const original = fs.readFileSync(new URL('./release-files/desktop-handback-progress/v-feishu-task-presentation.mjs', import.meta.url), 'utf8');
 assert.throws(() => patchTaskPresentationRetryCap(patchTaskPresentationRetryCap(original)), /already patched/);
 assert.throws(() => patchTaskPresentationRetryCap(original.replace('this.record.deliveryAttempts=(this.record.deliveryAttempts??0)+1;', '')), /anchor drift/);
});
