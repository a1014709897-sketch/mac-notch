'use strict';
// Shares production dialog content; preview never checks, downloads or installs updates.
const { app, dialog, nativeImage } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { updateDialogOptions } = require('../src/main/update-dialog');
app.setName('Mac Notch 更新预览');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-notch-update-preview-'));
app.setPath('userData', profile);
app.whenReady().then(async () => {
  app.dock.setIcon(nativeImage.createFromPath(path.resolve(__dirname, '../assets/app.png')));
  const notes = process.argv[2] ? fs.readFileSync(path.resolve(process.argv[2]), 'utf8') :
    '【效果预览 · 文案待确认】\n\n更新不用再惦记着。\nMac Notch 会主动提醒你发现新版本，点击即可下载。\n\n• 自动检查新版，不用再进设置查找。\n• 支持稍后提醒，也可以跳过当前版本。\n\n这是预览，点击按钮不会下载或安装。';
  await dialog.showMessageBox({ ...updateDialogOptions({version:'0.2.9',notes}, require('../package.json').version),
    icon: nativeImage.createFromPath(path.resolve(__dirname, '../assets/app.png')) });
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => fs.rmSync(profile, {recursive:true,force:true}));
