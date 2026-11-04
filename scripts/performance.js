'use strict';
// Run with Electron, never Node. Both revisions use the same isolated demo profile
// defaults; no live task text, account tokens or user settings enter this report.
// NOTCH_PERF_ROOT=/path/to/revision NOTCH_PERF_OUTPUT=/tmp/report.json \
//   node_modules/.bin/electron scripts/performance.js
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(process.env.NOTCH_PERF_ROOT || path.join(__dirname, '..'));
const output = path.resolve(process.env.NOTCH_PERF_OUTPUT || '/tmp/mac-notch-performance.json');
const seconds = Number(process.env.NOTCH_PERF_SECONDS || 21);
if (!Number.isInteger(seconds) || seconds < 7 || seconds > 120) throw new Error('Sample duration must be 7–120 seconds');
process.argv.push('--demo');
require(path.join(root, 'src/main/index.js'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const mean = xs => xs.reduce((a,b) => a+b, 0) / xs.length;
const cpuTime = metrics => metrics.reduce((n, m) => n + m.cpu.cumulativeCPUUsage, 0);
const report = {version:require(path.join(root,'package.json')).version, electron:process.versions.electron,
  arch:process.arch, logicalCPUs:os.cpus().length, seconds, scenarios:[]};
app.whenReady().then(async () => {
  await wait(3000);
  const notch = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/notch.html'));
  if (!notch) throw new Error('Notch window not ready');
  await notch.webContents.executeJavaScript(`macNotch.save({notifications:false,assistanceNotifications:false})`);
  for (const state of (process.env.NOTCH_PERF_STATES || 'idle,running,waiting,ended,hidden').split(',')) {
    if (state === 'hidden') notch.hide();
    else {
      notch.showInactive();
      await notch.webContents.executeJavaScript(`macNotch.demo(${JSON.stringify(state)})`);
    }
    await wait(2000);
    const scene = await notch.webContents.executeJavaScript(`({hidden:document.hidden,dpr:devicePixelRatio,
      tasks:[...document.querySelectorAll('#notch .mascot')].map(c=>({provider:c.alt,pose:c.dataset.pose,width:c.width}))})`);
    let previous = app.getAppMetrics(), at = performance.now();
    const samples = [];
    for (let i=0;i<seconds;i++) {
      await wait(1000);
      const next=app.getAppMetrics(), now=performance.now();
      // CPU seconds / wall seconds avoids platform-dependent normalized percentages.
      const cpu=100*(cpuTime(next)-cpuTime(previous))/((now-at)/1000);
      if (!Number.isFinite(cpu)) throw new Error('Cumulative CPU metric unavailable');
      samples.push({cpu, rssMiB:next.reduce((n,m)=>n+m.memory.workingSetSize/1024,0),
        processes:next.map(m=>({pid:m.pid,type:m.type,cpuSeconds:m.cpu.cumulativeCPUUsage,rssKiB:m.memory.workingSetSize}))});
      previous=next;at=now;
    }
    const result={state,scene,meanCPU:mean(samples.map(s=>s.cpu)),maxCPU:Math.max(...samples.map(s=>s.cpu)),
      meanRSSMiB:mean(samples.map(s=>s.rssMiB)),samples};
    report.scenarios.push(result);
    console.log(JSON.stringify({state,meanCPU:result.meanCPU,meanRSSMiB:result.meanRSSMiB}));
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(report,null,2));
    if(state!=='hidden')fs.writeFileSync(output.replace(/\.json$/,`-${state}.png`),(await notch.webContents.capturePage()).toPNG());
  }
  app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
