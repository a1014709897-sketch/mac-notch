"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const settings = {providers:{claude:true,codex:true}, menuBar:{claude:true,codex:true}, idleQuota:false,startAtLogin:false,notifications:true};
  const controls = Object.fromEntries(["close-settings","workbuddy-login","workbuddy-cancel","workbuddy-login-status","workbuddy","menu-workbuddy","assistance-notifications","swap-gestures","gesture-description","gesture-feedback","check-update","download-update","open-update","notifications","claude","codex","idle-quota","menu-claude","menu-codex","login","settings","notice","version","quit"].map(id=>[id,{checked:false,textContent:""}]));
  const requests = [];
  let onState, logins=0;
  const context = vm.createContext({document:{getElementById:id=>controls[id],querySelectorAll:()=>[]}, macNotch:{
    get:async()=>({settings:structuredClone(settings),version:"test"}),
    workbuddyLogin:async()=>{logins++;return {ok:true};},workbuddyCancel:async()=>true,
    onState:callback=>{onState=callback;},onNotice:()=>{},quit:()=>{},closeSettings:()=>{},
    save:patch=>new Promise((resolve,reject)=>requests.push({patch:JSON.parse(JSON.stringify(patch)),resolve,reject})),
  }});
  vm.runInContext(fs.readFileSync(require.resolve("../src/renderer/panel.js"),"utf8"),context);
  return {controls,requests,settings,get logins(){return logins;},
    change(id,value){controls[id].checked=value;controls[id].onchange();},
    broadcast(){onState({settings:structuredClone(settings),version:"test"});},
    succeed(i){const request=requests[i];for(const [key,value]of Object.entries(request.patch))settings[key]=typeof value==="object"?{...settings[key],...value}:value;request.resolve({ok:true,settings:structuredClone(settings)});},
  };
}
test("switches save immediately without form submission; broadcasts preserve a pending choice", async()=>{
  const h=harness();await tick();h.change("claude",false);await tick();
  assert.deepEqual(h.requests[0].patch,{providers:{claude:false},setupComplete:true});
  h.broadcast();assert.equal(h.controls.claude.checked,false);
  h.succeed(0);await tick();assert.equal(h.settings.providers.claude,false);
  assert.equal(h.controls.codex.checked,true);
});
test("rapid changes are serialized, keep the last choice, and do not overwrite other switches",async()=>{
  const h=harness();await tick();
  h.change("claude",false);h.change("menu-codex",false);h.change("claude",true);await tick();
  assert.equal(h.requests.length,1);h.succeed(0);await tick();
  assert.equal(h.controls.claude.checked,true);assert.equal(h.requests.length,2);
  h.succeed(1);await tick();h.succeed(2);await tick();
  assert.equal(h.settings.providers.claude,true);assert.equal(h.settings.menuBar.codex,false);
  h.broadcast();assert.equal(h.controls["menu-codex"].checked,false);
});
test("failed save restores the confirmed value and a later change can still succeed",async()=>{
  const h=harness();await tick();h.change("codex",false);await tick();
  h.requests[0].resolve({ok:false,error:"磁盘不可写",settings:structuredClone(h.settings)});await tick();
  assert.equal(h.controls.codex.checked,true);assert.match(h.controls.notice.textContent,/磁盘不可写/);
  h.change("codex",false);await tick();h.succeed(1);await tick();
  assert.equal(h.controls.codex.checked,false);assert.equal(h.controls.notice.textContent,"");
});
test("IPC rejection does not block the queue or leave an unsaved switch enabled",async()=>{
  const h=harness();await tick();h.change("idle-quota",true);h.change("login",true);await tick();
  h.requests[0].reject(new Error("连接中断"));await tick();
  assert.equal(h.controls["idle-quota"].checked,false);assert.equal(h.requests.length,2);
  h.succeed(1);await tick();assert.equal(h.settings.startAtLogin,true);
});

test("notification toggle defaults on, saves immediately and restores on failure", async()=>{
  const h=harness();await tick();assert.equal(h.controls.notifications.checked,true);
  h.change("notifications",false);await tick();
  assert.deepEqual(h.requests[0].patch,{notifications:false,setupComplete:true});
  h.succeed(0);await tick();h.broadcast();assert.equal(h.controls.notifications.checked,false);
  h.change("notifications",true);await tick();
  h.requests[1].resolve({ok:false,error:"不可写",settings:structuredClone(h.settings)});await tick();
  assert.equal(h.controls.notifications.checked,false);
});

test('WorkBuddy login follows successful enable only; third-tool rejection never opens it',async()=>{
 const h=harness();await tick();h.change('workbuddy',true);await tick();
 h.requests[0].resolve({ok:false,error:'最多两个工具',settings:structuredClone(h.settings)});await tick();assert.equal(h.logins,0);
 h.change('codex',false);await tick();h.succeed(1);await tick();
 h.change('workbuddy',true);await tick();h.succeed(2);await tick();assert.equal(h.logins,1);
 h.broadcast();await tick();assert.equal(h.logins,1);
});
