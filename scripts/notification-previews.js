"use strict";
// Render demonstration images from the production notification DOM/CSS.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-notch-notification-images-'));
app.setPath('userData', path.join(directory, 'profile'));

const preload = path.join(directory, 'preload.js');
fs.writeFileSync(preload, `const {contextBridge}=require('electron');contextBridge.exposeInMainWorld('macNotch',{get:()=>new Promise(()=>{}),onState(){},notification(){},gesture(){}});`);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 360, height: 114, frame: false, transparent: true,
    webPreferences: { preload, contextIsolation: true, sandbox: true } });
  await win.loadFile(path.resolve('src/renderer/notch.html'));
  await win.webContents.insertCSS('* { animation: none !important; }');
  for (const kind of ['waiting', 'ended']) {
    const notification = { key: 'preview', provider: 'codex', kind, duration: kind === 'waiting' ? 8000 : 5000,
      remaining: kind === 'waiting' ? 8000 : 5000, expiresAt: null,
      title: 'Mac Notch 体验优化',
      description: kind === 'waiting' ? '请选择接下来执行的方案。' : '已整理好结果，可以回到会话查看。' };
    await win.webContents.executeJavaScript(`render(${JSON.stringify({ tasks: [{ provider: 'codex', state: kind }], settings: {}, geometry: {height:32}, expanded:false, notification })})`);
    await new Promise(resolve => setTimeout(resolve, 150));
    fs.writeFileSync(path.resolve(`assets/notification-${kind}.png`), (await win.webContents.capturePage()).toPNG());
  }
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
