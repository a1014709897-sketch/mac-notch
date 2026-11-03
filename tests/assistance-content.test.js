'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { TaskState } = require('../src/main/state');
const { NotificationQueue } = require('../src/main/notifications');

test('real question text flows from transcript to notification and partial replies update only remaining questions', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-question-content-'));
  const previous = process.env.CODEX_HOME; process.env.CODEX_HOME = root;
  t.after(() => { if (previous === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previous; fs.rmSync(root,{recursive:true,force:true}); });
  const now=Date.now(), date=new Date(now);
  const dir=path.join(root,'sessions',String(date.getFullYear()),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0'));
  fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'rollout-content.jsonl');
  const append=payload=>fs.appendFileSync(file,JSON.stringify({type:'response_item',payload})+'\n');
  const {readActivity}=require('../src/main/activity');
  const state=new TaskState(),queue=new NotificationQueue();
  const scan=async at=>{const rows=await readActivity(at,['codex']);state.update(rows,at);queue.observe([...state.sessions.values()],at);return queue.tick(at);};
  const reply=index=>append({type:'message',role:'user',content:[{type:'input_text',text:'<send_user_message_question_reply>'+JSON.stringify([{questionItemId:JSON.stringify(['request_user_input_async','ask',index]),answer:'private answer'}])+'</send_user_message_question_reply>'}]});
  append({type:'task_started',turn_id:'one'});await scan(now);
  append({type:'function_call',name:'request_user_input_async',call_id:'ask',arguments:JSON.stringify({questions:[{title:'请确认 **部署时间**？',options:['not part of preview']},{title:'需要保留备份吗？'}]})});
  assert.equal(await scan(now+100),null); // Not accepted yet.
  append({type:'function_call_output',call_id:'ask',output:'{"accepted":true}'});
  const first=await scan(now+200);
  assert.equal(first.description,'请确认 部署时间？；需要保留备份吗？');
  const key=first.key,expires=first.expiresAt;
  reply(0);const partial=await scan(now+300);
  assert.equal(partial.key,key);assert.equal(partial.expiresAt,expires);
  assert.equal(partial.description,'需要保留备份吗？');assert.equal(queue.pending.length,0);
  reply(1);assert.equal(await scan(now+400),null);
  append({type:'function_call',name:'request_user_input',call_id:'sync',arguments:JSON.stringify({questions:[{header:'Choice',question:'请选择本次发布的环境。',options:[{label:'private option'}]}]})});
  assert.equal((await scan(now+500)).description,'请选择本次发布的环境。');
  append({type:'function_call_output',call_id:'sync',output:'{"answers":{}}'});
  assert.equal(await scan(now+600),null);
  append({type:'task_started',turn_id:'two'});
  append({type:'function_call',name:'request_user_input',call_id:'missing',arguments:'{}'});
  assert.equal((await scan(now+700)).description,'请回到会话回答问题或确认下一步。');
});
