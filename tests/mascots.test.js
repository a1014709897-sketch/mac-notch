'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 let now=0,id=0;const timers=new Map(),events={},mediaEvents={};
 const context=()=>new Proxy({getImageData:()=>({data:new Uint8ClampedArray(160*160*4).fill(255)}),
   createLinearGradient:()=>({addColorStop(){}})}, {get:(o,k)=>o[k]||(()=>{})});
 const document={hidden:false,addEventListener:(n,f)=>events[n]=f,createElement:()=>{
   const ctx=context(), animation={currentTime:0,playState:'running',pause(){this.playState='paused'},play(){this.playState='running'}};
   const canvas={isConnected:true,dataset:{},style:{},draws:0,setAttribute(){},getAnimations:()=>[animation],getContext:()=>ctx,animation};
   ctx.clearRect=()=>canvas.draws++;return canvas;
 }};
 const reduced={matches:false,addEventListener:(n,f)=>mediaEvents[n]=f};
 const window={devicePixelRatio:2,addEventListener:(n,f)=>events[n]=f};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/mascots.js'),'utf8'),{
   window,document,matchMedia:()=>reduced,performance:{now:()=>now},Path2D:class{},
   setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id},clearTimeout:id=>timers.delete(id),
 });
 function advance(ms){const end=now+ms;let calls=0;while(true){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++calls>10000)throw Error('timer loop');now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;}
 return {window,document,reduced,timers,advance,events,mediaEvents};
}
test('hidden and reduced-motion mascots stop all wakeups; visible restores animation',()=>{
 const f=fixture(),c=f.window.createNotchMascot({provider:'claude',state:'idle'});f.advance(500);
 const before=c.draws;f.document.hidden=true;f.events.visibilitychange();assert.equal(f.timers.size,0);f.advance(7000);assert.equal(c.draws,before);
 f.document.hidden=false;f.events.visibilitychange();f.advance(600);assert.ok(c.draws>before);
 f.reduced.matches=true;f.mediaEvents.change();assert.equal(f.timers.size,0);
 f.reduced.matches=false;f.mediaEvents.change();assert.ok(f.timers.size>0);
 f.events.pagehide();assert.equal(f.timers.size,0);
});
test('idle plateau parks and resumes at the original seven-second boundary after DOM replacement',()=>{
 const f=fixture();f.window.createNotchMascot({provider:'codex',state:'idle'});f.advance(2000);
 const c=f.window.createNotchMascot({provider:'codex',state:'idle'});f.advance(1);
 assert.equal(c.style.animationDelay,'-2s');assert.equal(c.animation.playState,'paused');
 assert.ok(Math.abs(c.animation.currentTime+880)<1); // hold the 1.12s plateau, accounting for the negative 2s CSS delay
 f.advance(5000);assert.equal(c.animation.playState,'paused');
 assert.ok(Math.abs(c.animation.currentTime-5000)<45);
 f.window.retainNotchMascots([]);assert.equal(f.timers.size,0);
});
test('completed Codex has no repeated texture uploads; DPR changes redraw at physical size',()=>{
 const f=fixture(),c=f.window.createNotchMascot({provider:'codex',state:'ended'});
 assert.equal(c.width,44);const before=c.draws;f.advance(6000);assert.equal(c.draws,before);
 f.window.devicePixelRatio=1;f.events.resize();assert.equal(c.width,22);assert.equal(c.draws,before+1);
});
test('all provider expressions remain drawable and static frames are deduplicated',()=>{
 for(const provider of ['claude','codex','workbuddy'])for(const state of ['idle','running','waiting','ended']){
   const f=fixture(),c=f.window.createNotchMascot({provider,state});f.advance(7000);
   assert.ok(c.draws>=1);assert.ok(c.draws<169,`${provider} ${state} should skip unchanged frames`);
   const multi=f.window.createNotchMascot({provider,state:'running',progress:{total:2}});assert.equal(multi.dataset.pose,'multi');f.advance(1500);assert.ok(multi.draws>1);
 }
});
test('showing a window never replays an already finished completion animation',()=>{
 const f=fixture(),c=f.window.createNotchMascot({provider:'codex',state:'ended'});
 c.animation.playState='finished';f.document.hidden=true;f.events.visibilitychange();
 f.document.hidden=false;f.events.visibilitychange();assert.equal(c.animation.playState,'finished');
});
test('visibility changes before the first binding do not leave an unthrottled animation',()=>{
 const f=fixture(),c=f.window.createNotchMascot({provider:'codex',state:'running'});
 f.document.hidden=true;f.events.visibilitychange();f.document.hidden=false;f.events.visibilitychange();
 f.advance(500);assert.equal(c.animation.playState,'paused');assert.ok(c.animation.currentTime>400);
});
