'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { claudeNotification } = require('../../../../../main/notifications');

// Desktop's registry idle is not proof of success. A completed-turn increment
// for the same observed user turn is; read metadata only, never conversation text.
function createDesktopCompletionReader(root = path.join(os.homedir(), 'Library/Application Support/Claude/claude-code-sessions')) {
  const seen = new Map();
  let lastRead = 0, cached = [];
  return function read(now = Date.now()) {
    if (now - lastRead < 2000) return cached;
    lastRead = now;
    const result = [];
    try {
      for (const account of fs.readdirSync(root, { withFileTypes: true })) {
        if (!account.isDirectory()) continue;
        const accountRoot = path.join(root, account.name);
        for (const org of fs.readdirSync(accountRoot, { withFileTypes: true })) {
          if (!org.isDirectory()) continue;
          const orgRoot = path.join(accountRoot, org.name);
          for (const file of fs.readdirSync(orgRoot, { withFileTypes: true })) {
            if (!file.isFile() || !/^local_.*\.json$/.test(file.name)) continue;
            try {
              const name = path.join(orgRoot, file.name);
              if (fs.statSync(name).size > 2 * 1024 * 1024) continue;
              const d = JSON.parse(fs.readFileSync(name, 'utf8'));
              if (!d.cliSessionId || d.isArchived) continue;
              const turn = Number(d.latestUserFrameAt), count = Number(d.completedTurns || 0);
              if (!Number.isFinite(turn) || !Number.isFinite(count)) continue;
              const old = seen.get(d.cliSessionId);
              const complete = Boolean(old && old.turn === turn && (old.complete || count > old.count)
                && !d.interruptedAwaitingPerson);
              seen.set(d.cliSessionId, { turn, count, complete });
              if (complete) result.push({ client: 'claude', sessionId: d.cliSessionId,
                notification: claudeNotification(d), turnEnded: true, lastUsedAt: new Date(now).toISOString() });
            } catch (_) { /* Partial writes do not manufacture completion. */ }
          }
        }
      }
    } catch (_) { /* Missing metadata does not mean success. */ }
    cached = result;
    return result;
  };
}
module.exports = { createDesktopCompletionReader };
