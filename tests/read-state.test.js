'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createTaskReadState}=require('../src/vendor/token-monitor/src/electron/notch/taskReadState');
test('only matching read transitions clear completed tasks; focus alone clears nothing',t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'task-read-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 fs.mkdirSync(path.join(home,'.codex'));
 const file=path.join(home,'.codex/.codex-global-state.json');
 const write=ids=>fs.writeFileSync(file,JSON.stringify({'electron-thread-read-state-v1':{unreadByIdentity:{account:{'local:host':ids}}}}));
 const read=createTaskReadState(home,id=>id);
 const tasks=[{provider:'codex',id:'a'},{provider:'codex',id:'b'}];
 write(['a','b']); assert.deepEqual(read(tasks,'codex'),[]);
 assert.deepEqual(read(tasks,'codex'),[]);
 write(['b']); assert.deepEqual(read(tasks,'codex'),[tasks[0]]);
 assert.deepEqual(read(tasks,'codex'),[]);
 fs.writeFileSync(file,'{');assert.deepEqual(read(tasks,'codex'),[]);
});
test('Claude focus must advance for the specific session after completion',t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'task-focus-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const root=path.join(home,'Library/Application Support/Claude/claude-code-sessions/account/org');fs.mkdirSync(root,{recursive:true});
 const write=(id,at)=>fs.writeFileSync(path.join(root,`local_${id}.json`),JSON.stringify({cliSessionId:id,lastFocusedAt:at}));
 const read=createTaskReadState(home);
 const tasks=[{provider:'claude',id:'a',completedAt:200},{provider:'claude',id:'b',completedAt:200}];
 write('a',100);write('b',100); assert.deepEqual(read(tasks,'claude'),[]);
 write('a',300);assert.deepEqual(read(tasks,'claude'),[tasks[0]]);
 assert.deepEqual(read(tasks,'claude'),[]);
});
