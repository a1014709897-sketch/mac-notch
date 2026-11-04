"use strict";
// Production DOM/CSS + native BrowserWindow, with synthetic content and screen geometry.
// No account reads, settings writes, or daily-app replacement.
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { layout, contentLayout, expandedLayout, notificationLayout } = require('../src/main/layout');
const output = process.env.MAC_NOTCH_LAYOUT_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'mac-notch-layout-'));
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'mac-notch-layout-profile-')));
app.whenReady().then(async()=>{
  const display=screen.getPrimaryDisplay();
  let base, geometry, current, hostOverride;
  const win=new BrowserWindow({show:false,width:320,height:32,frame:false,transparent:true,type:'panel',
    enableLargerThanScreen:true,roundedCorners:false,hasShadow:false,focusable:false,
    webPreferences:{preload:path.resolve('src/main/preload.js'),contextIsolation:true,sandbox:true}});
  win.webContents.setBackgroundThrottling(false);
  const errors=[];
  win.webContents.on('console-message',(_event,...args)=>{if(args[0]===3) errors.push(args[1]);});
  ipcMain.handle('state:get',()=>new Promise(()=>{}));
  ipcMain.handle('notch:measure',(_event,measurement)=>{
    geometry=contentLayout(base,measurement);
    const g=hostOverride || (current.expanded ? expandedLayout(display,geometry) : current.notification ? notificationLayout(display,geometry) : geometry);
    win.setBounds({x:g.x,y:g.y,width:g.width,height:g.height});
    return {geometry,frame:win.getBounds()};
  });
  await win.loadFile(path.resolve('src/renderer/notch.html'));
  await win.webContents.insertCSS('* { animation: none !important; }');
  if(process.env.MAC_NOTCH_LAYOUT_HIDDEN !== '1') win.showInactive();
  const records=[];
  const task=(provider,state='idle',progress)=>({provider,state,progress});
  const cases=[];
  for(const provider of ['claude','codex']) {
    for(const value of [100,28,8,null,0]) cases.push({name:`${provider}-${value}`,tasks:[task(provider)],values:{[provider]:value}});
    cases.push({name:`${provider}-off`,tasks:[task(provider)],off:true});
    for(const state of ['running','waiting','ended']) cases.push({name:`${provider}-${state}`,tasks:[task(provider,state)]});
    cases.push({name:`${provider}-batch`,tasks:[task(provider,'running',{done:1,total:3})]});
    cases.push({name:`${provider}-large`,tasks:[task(provider,'running',{done:123,total:1280})]});
  }
  for(const values of [{claude:8,codex:100},{claude:28,codex:100},{claude:100,codex:100},{claude:100,codex:8},{claude:0,codex:null}])
    cases.push({name:`dual-${values.claude}-${values.codex}`,tasks:[task('claude'),task('codex')],values});
  cases.push({name:'dual-off',tasks:[task('claude'),task('codex')],off:true},
    {name:'dual-running',tasks:[task('claude','running'),task('codex','running')]},
    {name:'dual-mixed',tasks:[task('claude','waiting'),task('codex','running',{done:99,total:128})]},
    {name:'claude-idle-codex-running',tasks:[task('claude'),task('codex','running')]},
    {name:'expanded',tasks:[task('claude'),task('codex')],expanded:true},
    {name:'notification',tasks:[task('codex','ended')],notification:{key:'layout-preview',provider:'codex',title:'布局验证',description:'合成测试内容',kind:'ended',remaining:5000,expiresAt:null}},
    {name:'notification-waiting',tasks:[task('codex','waiting')],notification:{key:'waiting-preview',provider:'codex',title:'检查本地刘海栏宽度',description:'协助通知测试：图标与正文左侧对齐。',kind:'waiting',remaining:8000,expiresAt:null}},
    {name:'return-waiting',tasks:[task('codex','waiting')]},
    {name:'notification-claude',tasks:[task('claude','waiting')],notification:{key:'claude-preview',provider:'claude',title:'布局验证',description:'合成测试内容',kind:'waiting',remaining:8000,expiresAt:null}},
    {name:'notification-asymmetric',tasks:[task('claude','running',{done:1234,total:12800}),task('codex','waiting')],notification:{key:'asymmetric-preview',provider:'codex',title:'布局验证',description:'合成测试内容',kind:'waiting',remaining:8000,expiresAt:null}},
    {name:'return-compact',tasks:[task('codex')],values:{codex:8}},
    {name:'all-disabled',tasks:[],off:true});
  for(const idle of ['claude','codex']) for(const state of ['running','waiting','ended']) for(const off of [false,true]) {
    cases.push({name:`retain-${idle}-idle-${state}-${off?'no-quota':'quota'}`,off,
      tasks:[task('claude',idle==='claude'?'idle':state),task('codex',idle==='codex'?'idle':state)]});
  }
  const opened=[];ipcMain.on('tool:open',(_event,provider)=>opened.push(provider));
  for(const gap of [0,185,200]) {
    const {x,y,width}=display.bounds;
    const native=gap ? {safeTop:32,frame:{origin:{x:0,y:0},size:{width}},left:{origin:{x:0},size:{width:(width-gap)/2}},right:{origin:{x:(width+gap)/2}}} : null;
    base=layout(display,native);
    for(const fixture of cases) {
      current={tasks:fixture.tasks,geometry:base,settings:{idleQuota:!fixture.off},remainingQuota:fixture.values||{claude:28,codex:8},quotas:{claude:{stale:true},codex:{stale:true}},expanded:!!fixture.expanded,notification:fixture.notification||null};
      await win.webContents.executeJavaScript(`render(${JSON.stringify(current)})`);
      await new Promise(resolve=>setTimeout(resolve,70));
      const measured=await win.webContents.executeJavaScript(`(() => {
        const root=document.querySelector('#notch'), r=root.getBoundingClientRect();
        const nodes=[...root.querySelectorAll('.logo,.status,.idle-quota')].filter(n=>getComputedStyle(n).display!=='none');
        const regions=nodes.map(n=>{const b=n.getBoundingClientRect();return {cls:n.className,left:b.left,right:b.right,top:b.top,bottom:b.bottom,text:n.textContent};});
        return {providers:[...root.querySelectorAll('.logo')].map(n=>n.alt),states:[...root.querySelectorAll('.tool')].map(n=>['idle','running','waiting','ended'].find(s=>n.classList.contains('state-'+s))),single:root.classList.contains('single-layout'),width:innerWidth,rootLeft:r.left,rootWidth:r.width,visible:getComputedStyle(root).visibility!=='hidden',regions,sourceLeft:document.querySelector('#notification-source').getBoundingClientRect().left,logoSizes:[...root.querySelectorAll('.logo')].map(n=>getComputedStyle(n).width)};
      })()`);
      assert.deepEqual(measured.providers,fixture.tasks.map(t=>t.provider),fixture.name+' missing enabled shortcut');
      assert.deepEqual(measured.states,fixture.tasks.map(t=>t.state),fixture.name+' independent status');
      assert.equal(measured.single,fixture.tasks.length<=1,fixture.name+' layout follows enabled tools');
      if(fixture.name.startsWith('retain-')) {
        const before=opened.length;
        await win.webContents.executeJavaScript(`[...document.querySelectorAll('#notch .tool')].forEach(n=>n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})))`);
        await new Promise(resolve=>setTimeout(resolve,20));
        assert.deepEqual(opened.slice(before),['claude','codex'],fixture.name+' both shortcuts work');
      }
      const bounds=win.getBounds();
      const globalCamera=base.centerX-base.gap/2;
      const expanded=fixture.expanded||fixture.notification;
      if(fixture.notification) {
        fs.writeFileSync(path.join(output,`${gap}-${fixture.name}.png`),(await win.webContents.capturePage()).toPNG());
        assert.equal(measured.regions[0].left,measured.sourceLeft,fixture.name+' icon/text alignment');
      }
      assert.ok(measured.visible,fixture.name+' hidden');
      assert.equal(measured.rootWidth,fixture.notification ? bounds.width : geometry.width,fixture.name+' root width');
      assert.equal(bounds.x+measured.rootLeft,fixture.notification ? bounds.x : geometry.x,fixture.name+' native position');
      if(!expanded) assert.equal(bounds.width,geometry.width,fixture.name+' native width');
      for(const r of measured.regions) {
        assert.ok(r.left>=0 && r.right<=bounds.width+0.5,fixture.name+' viewport clipping');
        if(gap) assert.ok(bounds.x+r.right<=globalCamera+0.5 || bounds.x+r.left>=globalCamera+gap-0.5,fixture.name+' crosses camera');
      }
      const inset=fixture.notification ? 16 : 28;
      if(measured.regions.length) assert.equal(measured.regions[0].left-measured.rootLeft,inset,fixture.name+' left inset');
      if(geometry.right && measured.regions.length) {
        const rightEdge=Math.max(...measured.regions.map(r=>r.right));
        assert.ok(Math.abs(measured.rootLeft+measured.rootWidth-rightEdge-inset)<1,fixture.name+' right inset');
      }
      assert.ok(measured.logoSizes.every(v=>v==='22px'));
      records.push({gap,name:fixture.name,bounds,geometry,...measured});
      if(['codex-100','codex-28','codex-8','codex-off','dual-8-100','dual-off','dual-mixed'].includes(fixture.name))
        fs.writeFileSync(path.join(output,`${gap}-${fixture.name}.png`),(await win.webContents.capturePage()).toPNG());
    }
    const get=name=>records.find(r=>r.gap===gap&&r.name===name);
    for(const p of ['claude','codex']) {
      assert.ok(get(`${p}-100`).geometry.width>get(`${p}-28`).geometry.width);
      assert.ok(get(`${p}-28`).geometry.width>get(`${p}-8`).geometry.width);
      assert.ok(get(`${p}-8`).geometry.width>get(`${p}-off`).geometry.width);
    }
    assert.ok(get('dual-100-100').geometry.width>get('dual-28-100').geometry.width);
    assert.ok(get('dual-28-100').geometry.width>get('dual-8-100').geometry.width);
    assert.ok(get('dual-8-100').geometry.width>get('dual-off').geometry.width);
    assert.equal(get('return-compact').geometry.width,get('codex-8').geometry.width);
    assert.deepEqual(get('return-waiting').bounds,get('codex-waiting').bounds);
    assert.deepEqual(get('return-waiting').regions,get('codex-waiting').regions);
  }
  // Dock activation can reset a retained wide compact host without changing tasks.
  base=layout(display,null);
  current={tasks:[task('codex')],geometry:base,settings:{idleQuota:true},remainingQuota:{codex:89},quotas:{},expanded:false,notification:null};
  hostOverride={x:Math.round(base.centerX-340),y:base.y,width:680,height:432};
  current.frame=hostOverride;
  await win.webContents.executeJavaScript(`render(${JSON.stringify(current)})`);
  hostOverride=null;
  win.setBounds({x:geometry.x,y:geometry.y,width:geometry.width,height:geometry.height});
  current={...current,geometry,frame:win.getBounds()};
  await win.webContents.executeJavaScript(`render(${JSON.stringify(current)})`);
  const reset=await win.webContents.executeJavaScript(`({left:root.getBoundingClientRect().left,right:root.getBoundingClientRect().right,width:innerWidth})`);
  assert.equal(reset.left,0,'compact host reset must rebase the header');
  assert.ok(reset.right<=reset.width,'compact header must fit after Dock activation');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(records,null,2));
  console.log(JSON.stringify({ok:true,cases:records.length,output,widths:records.filter(r=>['codex-100','codex-28','codex-8','codex-off','dual-8-100','dual-off'].includes(r.name)).map(r=>({gap:r.gap,name:r.name,width:r.geometry.width}))}));
  win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
