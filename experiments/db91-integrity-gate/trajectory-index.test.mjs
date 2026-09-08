import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {trajectoryIndexSql,trajectoryIndexName,trajectoryBudgetSql} from './trajectory-index.mjs';
test('budget index preserves Unicode, null runs and ongoing mutations without table-body reads',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE trajectory_runtime_events(session_id TEXT NOT NULL, seq INTEGER NOT NULL, run_id TEXT, event_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id,seq)) STRICT');
  const insert=db.prepare('INSERT INTO trajectory_runtime_events VALUES(?,?,?,?,?)');
  insert.run('a',0,null,'中文🙂',1);insert.run('a',1,null,'ascii',2);insert.run('b',0,'run','x'.repeat(100000),3);
  const original=()=>db.prepare(trajectoryBudgetSql.replace(' GROUP BY',' NOT INDEXED GROUP BY')).all();
  const expected=original();db.exec(trajectoryIndexSql);
  assert.deepEqual(db.prepare(trajectoryBudgetSql).all(),expected);
  const plan=db.prepare('EXPLAIN QUERY PLAN '+trajectoryBudgetSql).all();
  assert(plan.some(row=>row.detail.includes(trajectoryIndexName)));
  assert(!plan.some(row=>row.detail.includes('TEMP B-TREE')));
  const bytecode=db.prepare('EXPLAIN '+trajectoryBudgetSql).all();
  const tableRoot=db.prepare("SELECT rootpage FROM sqlite_master WHERE name='trajectory_runtime_events'").get().rootpage;
  const tableCursor=bytecode.find(row=>row.opcode==='OpenRead'&&row.p2===tableRoot)?.p1;
  assert(!bytecode.some(row=>row.opcode==='Column'&&row.p1===tableCursor),'covering expression index must not read table columns');
  db.exec("UPDATE trajectory_runtime_events SET event_json='新值',created_at=4 WHERE session_id='a' AND seq=0;DELETE FROM trajectory_runtime_events WHERE session_id='b'");
  insert.run('a',2,'new','追加',5);
  assert.deepEqual(db.prepare(trajectoryBudgetSql).all(),original());
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});
