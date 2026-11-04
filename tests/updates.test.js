'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), {createHash} = require('node:crypto');
const {createUpdater, selectRelease, compareVersions, assetURL} = require('../src/main/updates');
const bytes = Buffer.from('fixture installer');
const digest = createHash('sha256').update(bytes).digest('hex');
const url = 'https://github.com/a1014709897-sketch/mac-notch/releases/download/v0.3.0/';
const release = () => ({ tag_name:'v0.3.0', draft:false, prerelease:false, body:'Improvements', assets:[{
  name:'Mac-Notch-0.3.0-arm64.dmg', state:'uploaded', browser_download_url:url+'Mac-Notch-0.3.0-arm64.dmg', size:bytes.length,digest:'sha256:'+digest
}] });
test('semantic ordering, channels, drafts, missing architecture and source validation', () => {
  assert.ok(compareVersions('0.10.0','0.9.0')>0);
  assert.ok(compareVersions('0.3.0-beta.10','0.3.0-beta.2')>0);
  assert.ok(compareVersions('0.3.0','0.3.0-beta.10')>0);
  const preview={...release(),prerelease:true};
  assert.equal(selectRelease([preview],'0.2.1','arm64'),null);
  assert.equal(selectRelease([{tag_name:'v0.2.1',prerelease:true},preview],'0.2.1','arm64').version,'0.3.0');
  assert.equal(selectRelease([{...release(),draft:true}],'0.2.1','arm64'),null);
  assert.throws(()=>selectRelease([release()],'0.2.1','x64'),/架构/);
  assert.equal(selectRelease([release()],'0.4.0','arm64'),null);
  assert.throws(()=>assetURL('https://example.org/installer.dmg'));
});
test('verified download opens only the completed installer; failed checksum removes partial file', async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-notch-update-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  let opened, corrupt=false;
  const updater=createUpdater({version:'0.2.1',arch:'arm64',directory,openPath:async file=>{opened=file;return '';},
    fetch:async target=> target.includes('api.github.com') ? new Response(JSON.stringify([release()])) : new Response(corrupt?Buffer.from('bad'):bytes)});
  assert.equal(await updater.open(),false);
  assert.equal((await updater.check()).status,'available');
  assert.equal((await updater.download()).status,'downloaded');
  assert.equal(await updater.open(),true); assert.deepEqual(fs.readFileSync(opened),bytes);
  corrupt=true;await updater.check();assert.equal((await updater.download()).status,'error');
  assert.equal(await updater.open(),false);assert.ok(!fs.readdirSync(directory).some(n=>n.endsWith('.partial')));
});
test('offline and checksum failures remain failures, never latest or downloaded', async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-notch-update-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const offline=createUpdater({version:'0.2.1',arch:'arm64',directory,fetch:async()=>new Response('',{status:503})});
  assert.equal((await offline.check()).status,'error');
  const r=release();delete r.assets[0].digest;
  r.assets.push({name:'SHA256SUMS.txt',browser_download_url:url+'SHA256SUMS.txt'});
  const updater=createUpdater({version:'0.2.1',arch:'arm64',directory,
    fetch:async target=>new Response(target.includes('api.github.com')?JSON.stringify([r]):target.endsWith('.txt')?`${digest}  Mac-Notch-0.3.0-arm64.dmg\n`:bytes)});
  await updater.check();assert.equal((await updater.download()).status,'downloaded');
});

test('startup bounds legacy cache and clears interrupted downloads without touching unrelated files', t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-notch-update-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const names=['Mac-Notch-0.9.0-arm64.dmg','Mac-Notch-0.10.0-arm64.dmg','Mac-Notch-0.11.0-x64.dmg.partial','notes.txt','other.dmg'];
  for (const name of names) fs.writeFileSync(path.join(directory,name),bytes);
  fs.mkdirSync(path.join(directory,'Mac-Notch-0.1.0-arm64.dmg'));
  createUpdater({version:'0.2.1',arch:'arm64',directory});
  assert.deepEqual(fs.readdirSync(directory).sort(),['Mac-Notch-0.1.0-arm64.dmg','Mac-Notch-0.10.0-arm64.dmg','notes.txt','other.dmg'].sort());
});
test('failed upgrade keeps previous installer; successful upgrade and retry retain only one', async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mac-notch-update-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const old='Mac-Notch-0.2.2-arm64.dmg', next='Mac-Notch-0.3.0-arm64.dmg';
  fs.writeFileSync(path.join(directory,old),bytes);
  let corrupt=true;
  const updater=createUpdater({version:'0.2.1',arch:'arm64',directory,
    fetch:async target=>new Response(target.includes('api.github.com')?JSON.stringify([release()]):corrupt?Buffer.from('bad'):bytes)});
  await updater.check();
  assert.equal((await updater.download()).status,'error');
  assert.deepEqual(fs.readdirSync(directory),[old]);
  corrupt=false;
  assert.equal((await updater.download()).status,'downloaded');
  assert.deepEqual(fs.readdirSync(directory),[next]);
  await updater.check();await updater.download();
  assert.deepEqual(fs.readdirSync(directory),[next]);
});
