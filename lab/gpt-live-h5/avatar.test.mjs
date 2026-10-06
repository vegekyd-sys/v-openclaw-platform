import test from 'node:test';
import assert from 'node:assert/strict';
import { createAvatarTasks, taskActivity, AVATAR_FILES } from './avatar-state.mjs';
import { createAvatarRenderer } from './avatar.mjs';

test('task identities come from executing tools, never from conversational text', () => {
  assert.equal(taskActivity('memory_search'), 'memory');
  assert.equal(taskActivity('web_fetch'), 'web');
  assert.equal(taskActivity('feishu_calendar'), 'calendar');
  assert.equal(taskActivity('openclaw_agent_consult', {query:'查日历'}), 'background');
  assert.equal(taskActivity('read', {path:'calendar.txt'}), 'background');
  assert.equal(taskActivity('openclaw_tool',{tool:'web_search',arguments:'{"query":"private"}'}), 'web');
  assert.equal(taskActivity('openclaw_tool',{tool:'exec',arguments:JSON.stringify({command:"'lark-cli' 'calendar' '+agenda' '--as' 'user'"})}), 'calendar');
  assert.equal(taskActivity('exec',{command:'echo lark-cli calendar +agenda'}), 'background');
  assert.equal(taskActivity('exec',{command:'lark-cli calendar +agenda; echo other'}), 'background');
});
test('latest still-running task wins; completion restores another task and ultimately idle', () => {
  const tasks = createAvatarTasks();
  tasks.consume({type:'tool.call',callId:'memory',name:'memory_search'});
  tasks.consume({type:'tool.call',callId:'web',name:'web_search'});
  assert.equal(tasks.pose,'web');
  tasks.consume({type:'tool.call',callId:'memory',name:'memory_search'}); // replay cannot reorder
  assert.equal(tasks.pose,'web');
  tasks.consume({type:'tool.error',callId:'web'});
  assert.equal(tasks.pose,'memory');
  tasks.consume({type:'tool.result',callId:'unrelated'});
  assert.equal(tasks.size,1);
  tasks.consume({type:'tool.result',callId:'memory'});
  assert.equal(tasks.pose,'idle');
});
test('control tools and invalid events cannot create or replace work; close drops old work', () => {
  const tasks=createAvatarTasks();
  for(const name of ['end_call','openclaw_end_call','cancel_task','current_time'])tasks.consume({type:'tool.call',name,callId:name});
  tasks.consume({type:'tool.call',name:'web_search'});
  assert.equal(tasks.size,0);
  tasks.consume({type:'tool.call',callId:'background',activity:'calendar',query:'private'});
  assert.equal(tasks.pose,'calendar');
  tasks.clear();
  tasks.consume({type:'tool.result',callId:'background'});
  assert.equal(tasks.pose,'idle');
});
function rendererFixture() {
  const jobs=[];const image={src:'idle',getAttribute(){return this.src;}};
  const previous={hidden:true};const poses=[];
  const renderer=createAvatarRenderer({image,previous,load:file=>new Promise(resolve=>jobs.push({file,resolve})),onPose:p=>poses.push(p)});
  return {renderer,image,previous,jobs,poses};
}
test('slow image downloads cannot resurrect a completed task or a closed page',async()=>{
  const f=rendererFixture();const first=f.renderer.show('memory'),second=f.renderer.show('idle');
  f.jobs[1].resolve('idle');await second;
  f.jobs[0].resolve('memory');await first;
  assert.equal(f.image.src,'idle');assert.deepEqual(f.poses,['idle']);
  const third=f.renderer.show('calendar');f.renderer.dispose();f.jobs[2].resolve('calendar');await third;
  assert.equal(f.image.src,'idle');
});
test('failed assets keep last good portrait and allow a retry; reduced motion skips fading',async()=>{
  const f=rendererFixture();const fail=f.renderer.show('web');f.jobs[0].resolve(null);await fail;
  assert.equal(f.image.src,'idle');const retry=f.renderer.show('web');f.jobs[1].resolve('web');await retry;
  assert.equal(f.image.src,'web');
  let animations=0;
  const image={src:'idle',getAttribute(){return this.src;}};
  const previous={hidden:true,animate(){animations++;}};
  const renderer=createAvatarRenderer({image,previous,load:async file=>file,reducedMotion:()=>true});
  await renderer.show('memory');assert.equal(animations,0);assert.equal(previous.hidden,true);
  assert.equal(AVATAR_FILES.length,5);
});
