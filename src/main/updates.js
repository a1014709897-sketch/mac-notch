"use strict";
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const REPO = 'a1014709897-sketch/mac-notch';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=100`;
function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value || '');
  return match ? { numbers: match.slice(1, 4).map(Number), pre: match[4]?.split('.') || [] } : null;
}
function compareVersions(a, b) {
  a = versionParts(a); b = versionParts(b);
  if (!a || !b) throw new Error('版本号格式不正确');
  for (let i = 0; i < 3; i++) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] - b.numbers[i];
  if (!a.pre.length || !b.pre.length) return Number(!a.pre.length) - Number(!b.pre.length);
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    if (a.pre[i] === b.pre[i]) continue;
    if (a.pre[i] === undefined || b.pre[i] === undefined) return a.pre[i] === undefined ? -1 : 1;
    const an = /^\d+$/.test(a.pre[i]), bn = /^\d+$/.test(b.pre[i]);
    if (an && bn) return Number(a.pre[i]) - Number(b.pre[i]);
    if (an !== bn) return an ? -1 : 1;
    return a.pre[i] < b.pre[i] ? -1 : 1;
  }
  return 0;
}
function assetURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || !url.pathname.startsWith(`/${REPO}/releases/download/`)) throw new Error('更新附件地址不属于 Mac Notch');
  return url.href;
}
function selectRelease(releases, current, arch) {
  const currentRelease = releases.find(r => versionParts(r.tag_name) && compareVersions(r.tag_name, current) === 0);
  const preview = currentRelease?.prerelease === true || versionParts(current)?.pre.length > 0;
  const newer = releases.filter(r => !r.draft && (!r.prerelease || preview) && versionParts(r.tag_name) && compareVersions(r.tag_name, current) > 0)
    .sort((a, b) => compareVersions(b.tag_name, a.tag_name));
  if (!newer.length) return null;
  const release = newer[0], version = release.tag_name.replace(/^v/, '');
  const asset = release.assets?.find(a => a.name === `Mac-Notch-${version}-${arch}.dmg` && a.state === 'uploaded');
  if (!asset) throw new Error(`新版 ${version} 暂未提供本机架构的安装包`);
  assetURL(asset.browser_download_url);
  return { release, asset, version };
}
function createUpdater({ version, arch, fetch, directory, openPath, onChange = () => {} }) {
  let state = { status: 'idle', current: version }, selected, downloaded, busy = false, controller;
  const emit = patch => { state = { ...state, ...patch }; onChange({ ...state }); };
  async function request(url, timeout = 20000) {
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]) });
    if (!response.ok) throw new Error(`更新服务暂不可用（HTTP ${response.status}），请稍后重试`);
    return response;
  }
  return {
    snapshot: () => ({ ...state }),
    async check() {
      if (busy) return { ...state };
      busy = true; controller = new AbortController(); selected = null; downloaded = null;
      emit({ status: 'checking', error: '', version: null, notes: '', progress: 0 });
      try {
        const releases = await (await request(API)).json();
        if (!Array.isArray(releases)) throw new Error('更新服务返回的数据不正确');
        selected = selectRelease(releases, version, arch);
        emit(selected ? { status: 'available', version: selected.version, notes: String(selected.release.body || '').slice(0, 6000) }
          : { status: 'current' });
      } catch (error) { emit({ status: 'error', error: error.message }); }
      finally { busy = false; }
      return { ...state };
    },
    async download() {
      if (busy || !selected) return { ...state };
      busy = true; controller = new AbortController();
      emit({ status: 'downloading', error: '', progress: 0 });
      let temporary;
      try {
        const { asset, release } = selected;
        let digest = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest || '')?.[1]?.toLowerCase();
        if (!digest) {
          const checksums = release.assets.find(a => a.name === 'SHA256SUMS.txt');
          if (!checksums) throw new Error('新版缺少校验信息，暂不能下载');
          const response = await request(assetURL(checksums.browser_download_url));
          const body = await response.text();
          if (body.length > 65536) throw new Error('校验清单无效');
          const line = body.split(/\r?\n/).map(line => /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line)).find(m => m?.[2] === asset.name);
          if (!line) throw new Error('安装包缺少对应校验信息');
          digest = line[1].toLowerCase();
        }
        if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 2 * 1024 ** 3) throw new Error('安装包大小无效');
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const destination = path.join(directory, asset.name);
        temporary = destination + '.partial';
        const response = await request(assetURL(asset.browser_download_url), 600000);
        const hash = createHash('sha256'); let received = 0, last = 0;
        const meter = new Transform({ transform(chunk, encoding, callback) {
          received += chunk.length;
          if (received > asset.size) return callback(new Error('安装包大小与发布信息不一致'));
          hash.update(chunk);
          if (Date.now() - last > 200) { last = Date.now(); emit({ progress: Math.floor(received / asset.size * 100) }); }
          callback(null, chunk);
        } });
        await pipeline(Readable.from(response.body), meter, fs.createWriteStream(temporary, { mode: 0o600 }), { signal: controller.signal });
        if (received !== asset.size || hash.digest('hex') !== digest) throw new Error('安装包校验失败，请重新下载');
        fs.renameSync(temporary, destination); downloaded = destination;
        emit({ status: 'downloaded', progress: 100 });
      } catch (error) {
        if (temporary) fs.rmSync(temporary, { force: true });
        emit({ status: 'error', error: error.message });
      } finally { busy = false; }
      return { ...state };
    },
    async open() {
      if (!downloaded || state.status !== 'downloaded') return false;
      const error = await openPath(downloaded);
      if (error) { emit({ status: 'error', error }); return false; }
      return true;
    },
    dispose() { controller?.abort(); }
  };
}
module.exports = { createUpdater, compareVersions, selectRelease, assetURL };
