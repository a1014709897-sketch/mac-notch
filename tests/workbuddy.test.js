"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createWorkbuddyReader } = require('../src/main/workbuddy');
const { TaskState } = require('../src/main/state');
const { NotificationQueue } = require('../src/main/notifications');
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-test-'));
  t.after(() => fs.rmSync(home, { recursive:true, force:true }));
  const dir = path.join(home, '.workbuddy', 'projects', 'project');fs.mkdirSync(dir, {recursive:true});
  const file = path.join(dir, 'session.jsonl');fs.writeFileSync(file, '');
  return { home, file, read:createWorkbuddyReader({home}), append:row=>fs.appendFileSync(file, JSON.stringify(row)+'\n') };
}
const prompt = id => ({type:'message', role:'user', id, content:'<system-reminder>context</system-reminder><user_query>Do the task</user_query>'});
const completed = {type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Done'}]};
test('WorkBuddy observes a real turn, completion and foreground suppression without reviving history', async t => {
  const f=fixture(t), state=new TaskState(), queue=new NotificationQueue();
  f.append(prompt('old')); f.append(completed);state.update(await f.read(),100);assert.equal(state.completed().length,0);
  f.append({type:'custom-title',customTitle:'A title'});f.append(prompt('new'));state.update(await f.read(),200);
  assert.equal(state.snapshot().find(r=>r.provider==='workbuddy').state,'running');
  f.append(completed);state.update(await f.read(),300);assert.equal(state.completed().length,1);
  queue.observe([...state.sessions.values()],300,'workbuddy');assert.equal(queue.pending.length,0);assert.equal(queue.current,null);
  queue.observe([...state.sessions.values()],400,'codex');assert.equal(queue.pending.length,0);assert.equal(queue.current,null);
  state.update([{provider:'workbuddy',id:'session',turn:'unobserved',state:'ended'}],500);
  assert.equal(state.sessions.get('workbuddy:session').turn,'new');
});
test('questions correlate by call ID, system messages do not answer, interruption is not success', async t => {
  const f=fixture(t);f.append(prompt('turn'));
  for(const callId of ['a','b'])f.append({type:'function_call',name:'AskUserQuestion',callId,arguments:JSON.stringify({questions:[{question:`Question ${callId}`}]})});
  let [row]=await f.read();assert.equal(row.state,'waiting');assert.deepEqual(row.waitingIds,['a','b']);
  f.append({type:'message',role:'user',content:'<system-reminder>context</system-reminder>'});
  f.append({type:'function_call_result',callId:'a',status:'completed'});
  [row]=await f.read();assert.deepEqual(row.waitingIds,['b']);
  f.append({type:'function_call_result',callId:'b',status:'completed'});
  [row]=await f.read();assert.equal(row.state,'running');
  f.append({...completed,status:'incomplete'});[row]=await f.read();assert.equal(row.state,'idle');
});
test('partial writes are retried, both homes work and duplicate sessions select the newest file', async t => {
  const f=fixture(t);const line=JSON.stringify(prompt('partial'));
  fs.appendFileSync(f.file,line.slice(0,30));assert.equal((await f.read())[0].state,'idle');
  fs.appendFileSync(f.file,line.slice(30)+'\n');assert.equal((await f.read())[0].state,'running');
  const newer=path.join(f.home,'.workbuddy-ai','projects','project');fs.mkdirSync(newer,{recursive:true});
  const target=path.join(newer,'session.jsonl');fs.writeFileSync(target,JSON.stringify(prompt('new-home'))+'\n');
  fs.utimesSync(target,new Date(),new Date(Date.now()+1000));
  const rows=await f.read();assert.equal(rows.length,1);assert.equal(rows[0].turn,'new-home');
  fs.rmSync(f.file);fs.rmSync(target);assert.deepEqual(await f.read(),[]);
});
test('usage counts tool-call responses once, includes reasoning, and leaves unknown model cost unpriced', () => {
  const {parserState,consume,summarize}=require('../src/main/usage');const s=parserState(), now=Date.now();
  const row={type:'function_call',timestamp:new Date(now).toISOString(),providerData:{messageId:'r1',usage:{input_tokens:100,output_tokens:20,reasoningTokens:5}}};
  consume(s,row,'workbuddy');consume(s,row,'workbuddy');
  const summary=summarize([s],['workbuddy'],now);
  assert.equal(summary.today.workbuddy,125);assert.equal(summary.today.tokens,125);assert.equal(summary.today.unpricedTokens,125);
  assert.equal(summary.periods.month.total.workbuddy,125);assert.equal(summary.periods.week.total.workbuddy,125);
});
test('quota maps included windows, refuses unknown/encrypted data instead of zero', () => {
  const {projectWorkbuddyQuota}=require('../src/main/workbuddy-quota');
  assert.throws(()=>projectWorkbuddyQuota({status:'notConfigured',actionRequired:'appSessionEncrypted',windows:[]}),/加密/);
  assert.throws(()=>projectWorkbuddyQuota({status:'unavailable',windows:[]}),/暂未获取/);
  const result=projectWorkbuddyQuota({status:'ok',windows:[{label:'Month',usedPercent:30},{additional:true,remainingPercent:2}]});
  assert.equal(result.windows.length,1);assert.equal(result.windows[0].remaining,70);
});
test('WorkBuddy batches keep independent progress and only observed completions count', () => {
  const s=new TaskState();const row=(id,state)=>({provider:'workbuddy',id,state,turn:'t'});
  s.update([row('a','running'),row('b','running')],100);s.snapshot();
  s.update([row('a','ended'),row('b','running')],200);
  assert.deepEqual(s.snapshot().find(r=>r.provider==='workbuddy').progress,{done:1,total:2});
  s.update([row('a','ended'),row('b','waiting')],300);
  assert.equal(s.snapshot().find(r=>r.provider==='workbuddy').state,'waiting');
});

test('WorkBuddy credit windows retain their real remaining percentage', () => {
 const {projectWorkbuddyQuota}=require('../src/main/workbuddy-quota');
 assert.equal(projectWorkbuddyQuota({status:'ok',windows:[{metric:'credits',usedPercent:27.5}]}).windows[0].remaining,72.5);
});
