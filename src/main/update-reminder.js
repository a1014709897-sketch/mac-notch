'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DAY = 24 * 60 * 60 * 1000;
function createUpdateReminder({ updater, file, prompt, showSettings, showError, canPrompt = () => true, now = Date.now }) {
  let preferences = {}, busy = false, disposed = false;
  try { preferences = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (!preferences || typeof preferences !== 'object') preferences = {};
  function save(next) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
    preferences = next;
  }
  return {
    async tick() {
      if (disposed || busy || !canPrompt() || ['checking', 'downloading', 'downloaded'].includes(updater.snapshot().status)) return;
      busy = true;
      try {
        const result = await updater.check();
        if (disposed || !canPrompt() || result.status !== 'available' || !result.version) return;
        if (preferences.skippedVersion === result.version ||
          (preferences.remindedVersion === result.version && now() - preferences.remindedAt < DAY)) return;
        // Persist before opening the dialog so restart cannot replay a dismissed reminder.
        save({ ...preferences, remindedVersion: result.version, remindedAt: now() });
        const choice = await prompt(result);
        if (disposed) return;
        if (choice === 2) { save({ ...preferences, skippedVersion: result.version }); return; }
        if (choice !== 0) return;
        showSettings();
        // A manual check may have selected another release while the dialog was open.
        if (updater.snapshot().version !== result.version) return;
        const download = await updater.download();
        if (disposed) return;
        if (download.status === 'downloaded') {
          if (!await updater.open()) await showError(updater.snapshot().error || '无法打开安装包，请在设置中重试。');
        } else if (download.status === 'error') await showError(download.error);
      } catch {
        // Background network / preference failures must not interrupt normal use.
      } finally { busy = false; }
    },
    dispose() { disposed = true; }
  };
}
module.exports = { createUpdateReminder };
