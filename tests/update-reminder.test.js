'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createUpdateReminder } = require('../src/main/update-reminder');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-reminder-'));
  t.after(() => fs.rmSync(directory, {recursive:true,force:true}));
  let time=100000, choice=1, allowed=true, status='idle', version='0.3.0', prompts=0, downloads=0, opened=0, errors=0;
  const options={file:path.join(directory,'reminders.json'),now:()=>time,canPrompt:()=>allowed,
    updater:{snapshot:()=>({status,version}), check:async()=>({status:'available',version}),download:async()=>{downloads++;return {status:'downloaded'};},open:async()=>{opened++;return true;}},
    prompt:async()=>{prompts++;return choice;},showSettings(){},showError:async()=>{errors++;}};
  return {options,create:()=>createUpdateReminder(options),get counts(){return {prompts,downloads,opened,errors};},set choice(v){choice=v;},set allowed(v){allowed=v;},set status(v){status=v;},set version(v){version=v;},advance:()=>time+=86400000};
}
test('later survives restart and suppresses the same version for 24 hours',async t=>{
  const f=fixture(t);await f.create().tick();await f.create().tick();assert.equal(f.counts.prompts,1);
  f.advance();await f.create().tick();assert.equal(f.counts.prompts,2);
});
test('skip persists for this version only and never downloads',async t=>{
  const f=fixture(t);f.choice=2;await f.create().tick();f.advance();await f.create().tick();
  assert.equal(f.counts.prompts,1);f.version='0.4.0';await f.create().tick();
  assert.equal(f.counts.prompts,2);assert.equal(f.counts.downloads,0);
});
test('accepted reminder downloads and opens only the verified result',async t=>{
  const f=fixture(t);f.choice=0;await f.create().tick();assert.deepEqual(f.counts,{prompts:1,downloads:1,opened:1,errors:0});
});
test('locked, busy, disposed and offline checks never prompt or download',async t=>{
  const f=fixture(t);f.allowed=false;await f.create().tick();f.allowed=true;f.status='downloading';await f.create().tick();
  f.status='idle';const r=f.create();r.dispose();await r.tick();
  f.options.updater.check=async()=>{throw Error('offline');};await f.create().tick();assert.equal(f.counts.prompts,0);
});
test('failed verification reports failure and never opens the installer',async t=>{
  const f=fixture(t);f.choice=0;f.options.updater.download=async()=>({status:'error',error:'checksum'});
  await f.create().tick();assert.equal(f.counts.opened,0);assert.equal(f.counts.errors,1);
});
test('overlapping checks show one dialog; locking during network suppresses it',async t=>{
  const f=fixture(t);let resolve;
  f.options.updater.check=()=>new Promise(r=>{resolve=r;});const r=f.create();const first=r.tick();await r.tick();
  f.allowed=false;resolve({status:'available',version:'0.3.0'});await first;assert.equal(f.counts.prompts,0);
});
