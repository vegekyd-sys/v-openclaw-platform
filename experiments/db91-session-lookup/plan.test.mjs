import test from 'node:test';import assert from 'node:assert/strict';import {patchWorkspaceSessionLookup} from './plan.mjs';
const source=`function resolveWorkerPlacementSessionTarget(params) {
	const target = params.sessionRuntime.resolveGatewaySessionStoreTargetWithStore({
		cfg: params.config,
		key: params.sessionKey,
		agentId: params.agentId,
		clone: false
	});
	const entry = params.sessionRuntime.resolveCanonicalSessionEntryFromStoreKeys(target.store, target.storeKeys);
	const worktree = params.sessionRuntime.managedWorktrees.findLiveByOwner("session", target.canonicalKey);
	const expected = params.expectedTarget;
	const targetChangedError = () => expected ? new WorkerDispatchTargetChangedError(params.errorMessage) : new Error(params.errorMessage);
	if (expected && (target.storePath !== expected.storePath || target.canonicalKey !== expected.canonicalKey || target.agentId !== expected.agentId)) throw targetChangedError();
	if (!entry || entry.sessionId !== params.sessionId || !entry.worktree?.id) throw targetChangedError();
	if (!worktree || worktree.id !== entry.worktree.id || worktree.ownerId !== target.canonicalKey) throw targetChangedError();
	return {config: params.config, target, entry, worktree};
}`;
function fixture(){
 const key='agent:a:explicit:one',entry={sessionId:'s',worktree:{id:'w'},customFutureField:{preserved:true}};
 const target={storePath:'/a',canonicalKey:key,agentId:'a',storeKeys:[key],store:{[key]:entry}};
 const worktree={id:'w',ownerId:key,path:'/workspace'};let seen;
 const params={config:{},sessionKey:key,sessionId:'s',agentId:'a',errorMessage:'changed',sessionRuntime:{
  resolveGatewaySessionStoreTargetWithStore(options){seen=options;assert.equal(options.exactRead,true);return target;},
  resolveCanonicalSessionEntryFromStoreKeys(store,keys){assert.deepEqual(keys,[key]);return store[key];},
  managedWorktrees:{findLiveByOwner(type,owner){assert.equal(type,'session');assert.equal(owner,key);return worktree;}},
 }};
 const run=new Function('WorkerDispatchTargetChangedError',patchWorkspaceSessionLookup(source)+';return resolveWorkerPlacementSessionTarget;')(class extends Error{});
 return {run,params,target,entry,worktree,seen:()=>seen};
}
test('only enables exact native lookup, preserving all other code',()=>{assert.equal(patchWorkspaceSessionLookup(source).replace(',\n\t\texactRead: true',''),source);assert.throws(()=>patchWorkspaceSessionLookup(source+source));});
test('full selected entry and native identities are preserved',()=>{const f=fixture(),result=f.run(f.params);assert.equal(result.entry,f.entry);assert.equal(result.worktree,f.worktree);assert.equal(f.seen().clone,false);assert.equal(f.seen().key,f.params.sessionKey);assert(result.entry.customFutureField.preserved);});
for(const [name,mutate] of [
 ['session mismatch',f=>f.entry.sessionId='other'],
 ['missing worktree',f=>delete f.entry.worktree],
 ['worktree identity mismatch',f=>f.worktree.id='other'],
 ['worktree owner mismatch',f=>f.worktree.ownerId='other'],
 ['lifecycle target mismatch',f=>f.params.expectedTarget={...f.target,storePath:'/other'}],
])test(name+' still fails closed',()=>{const f=fixture();mutate(f);assert.throws(()=>f.run(f.params),/changed/);});
