'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
// Mac Notch activity rows already carry Codex's native session ID.
function createTaskReadState(home = os.homedir(), resolveCodex = id => id, codexRoot = process.env.CODEX_HOME || path.join(home,'.codex')) {
  let previousUnread = new Map();
  const focus = new Map();
  let activation = null;
  const readState = (tasks, foreground) => {
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
    const candidates = [];
    let metadataComplete = true;
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
              const name=path.join(dir,file); if (fs.statSync(name).size>2*1024*1024) { metadataComplete=false; continue; }
              const d=JSON.parse(fs.readFileSync(name,'utf8'));
              const at=Number(d.lastFocusedAt); if (!d.cliSessionId || !Number.isFinite(at)) continue;
              if (!d.isArchived && at > 0) candidates.push({ id: d.cliSessionId, at });
              const before=focus.get(d.cliSessionId); focus.set(d.cliSessionId,at);
              const task=tasks.find(task=>task.provider==='claude' && task.id===d.cliSessionId);
              if (task && foreground==='claude' && before !== undefined && at>before && at>=task.completedAt) read.push(task);
            } catch (_) { metadataComplete = false; /* Ignore incomplete metadata. */ }
          }
        }
      }
    } catch (_) { metadataComplete = false; /* No reliable focus evidence. */ }
    if (activation && Date.now() > activation.expires) activation = null;
    if (activation && foreground === "claude") {
      // Reopening the selected conversation need not advance lastFocusedAt.
      // Only an explicit successful notch activation enables this fallback.
      candidates.sort((a, b) => b.at - a.at);
      const latest = candidates[0];
      if (metadataComplete && latest && (!candidates[1] || latest.at > candidates[1].at)) {
        const task = tasks.find(task => task.provider === "claude" && task.id === latest.id
          && activation.tasks.some(clicked => clicked.id === task.id && clicked.completedAt === task.completedAt));
        if (task && !read.includes(task)) read.push(task);
      }
      activation = null;
    }
    return read;
  };
  readState.didActivate = (provider, tasks) => {
    if (provider === "claude") activation = {
      tasks: tasks.filter(task => task.provider === provider).map(task => ({ ...task })),
      expires: Date.now() + 5000,
    };
  };
  return readState;
}
module.exports={createTaskReadState};
