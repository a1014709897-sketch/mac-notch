'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
// Mac Notch activity rows already carry Codex's native session ID.
function createTaskReadState(home = os.homedir(), resolveCodex = id => id, codexRoot = process.env.CODEX_HOME || path.join(home,'.codex')) {
  let previousUnread = new Map();
  const focus = new Map();
  return (tasks, foreground) => {
    const read = [];
    try {
      const data = JSON.parse(fs.readFileSync(path.join(codexRoot,'.codex-global-state.json'),'utf8'));
      const groups = data['electron-thread-read-state-v1']?.unreadByIdentity;
      if (groups && typeof groups === 'object') {
        const current = new Map();
        for (const [identity, hosts] of Object.entries(groups)) {
          for (const [host, ids] of Object.entries(hosts || {})) {
            if (host.startsWith('local:') && Array.isArray(ids)) current.set(`${identity}/${host}`,new Set(ids));
          }
        }
        if (foreground === 'codex') for (const task of tasks.filter(task => task.provider === 'codex')) {
          const id = resolveCodex(task.id);
          if (id && [...current].some(([key, ids]) => previousUnread.get(key)?.has(id) && !ids.has(id))) read.push(task);
        }
        previousUnread = current;
      }
    } catch (_) { /* Missing/partial files never acknowledge tasks. */ }
    try {
      const root=path.join(home,'Library/Application Support/Claude/claude-code-sessions');
      for (const account of fs.readdirSync(root,{withFileTypes:true})) {
        if (!account.isDirectory()) continue;
        for (const org of fs.readdirSync(path.join(root,account.name),{withFileTypes:true})) {
          if (!org.isDirectory()) continue;
          const dir=path.join(root,account.name,org.name);
          for (const file of fs.readdirSync(dir)) {
            if (!/^local_.*\.json$/.test(file)) continue;
            try {
              const name=path.join(dir,file); if (fs.statSync(name).size>2*1024*1024) continue;
              const d=JSON.parse(fs.readFileSync(name,'utf8'));
              const at=Number(d.lastFocusedAt); if (!d.cliSessionId || !Number.isFinite(at)) continue;
              const before=focus.get(d.cliSessionId); focus.set(d.cliSessionId,at);
              const task=tasks.find(task=>task.provider==='claude' && task.id===d.cliSessionId);
              if (task && foreground==='claude' && before !== undefined && at>before && at>=task.completedAt) read.push(task);
            } catch (_) { /* Ignore incomplete metadata. */ }
          }
        }
      }
    } catch (_) { /* No reliable focus evidence. */ }
    return read;
  };
}
module.exports={createTaskReadState};
