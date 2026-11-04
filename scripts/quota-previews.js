"use strict";
// Render demonstration images from the production idle notch DOM/CSS.
const { app, BrowserWindow, ipcMain } = require('electron');
const { contentLayout } = require('../src/main/layout');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-notch-quota-images-'));
app.setPath('userData', path.join(directory, 'profile'));

const preload = path.join(directory, 'preload.js');
fs.writeFileSync(preload, `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('macNotch',{get:()=>new Promise(()=>{}),onState(){},pointer(){},notification(){},gesture(){},measure:value=>ipcRenderer.invoke("notch:measure",value)});`);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 360, height: 114, frame: false, transparent: true,
    webPreferences: { preload, contextIsolation: true, sandbox: true } });
  ipcMain.handle('notch:measure', (_event, measurement) => {
    const frame=win.getBounds();
    const geometry=contentLayout({x:frame.x,y:frame.y,width:frame.width,height:32,gap:0,hardware:false,centerX:frame.x+frame.width/2},measurement);
    return {geometry,frame};
  });
  win.webContents.setBackgroundThrottling(false);
  await win.loadFile(path.resolve('src/renderer/notch.html'));
  await new Promise(resolve => setTimeout(resolve, 400));
  await win.webContents.insertCSS('* { animation: none !important; }');
  win.setSize(360, 48);
  for (const enabled of [false, true]) {
    await win.webContents.executeJavaScript(`render(${JSON.stringify({ tasks: [{ provider: 'claude', state: 'idle' }, { provider: 'codex', state: 'idle' }], settings: {idleQuota: enabled}, remainingQuota: {claude:72,codex:59}, geometry: {height:32}, expanded:false, notification:null })})`);
    await new Promise(resolve => setTimeout(resolve, 250));
    fs.writeFileSync(path.resolve(`assets/idle-quota-${enabled ? 'on' : 'off'}.png`), (await win.webContents.capturePage()).toPNG());
  }
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
