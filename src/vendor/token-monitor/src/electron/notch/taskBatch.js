'use strict';
// A batch starts with observed live sessions. Old completed chats do not join it.
function createTaskBatches() {
  const batches = new Map();
  const completedAt = new Map();
  const update = rows => {
    const result = new Map();
    for (const provider of ['claude', 'codex']) {
      const current = new Map();
      for (const row of rows.filter(row => row.provider === provider && row.id)) {
        const priority = { waiting: 3, running: 2, ended: 1 };
        if (!current.has(row.id) || priority[row.state] > priority[current.get(row.id)]) current.set(row.id, row.state);
      }
      const live = [...current].filter(([, state]) => state === 'running' || state === 'waiting');
      let batch = batches.get(provider);
      if (live.length && (!batch || [...batch.values()].every(state => state === 'ended'))) {
        batch = new Map(); batches.set(provider, batch);
      }
      if (!batch) continue;
      for (const [id, state] of live) batch.set(id, state);
      for (const [id, state] of batch) {
        if (current.has(id)) batch.set(id, current.get(id));
        else if (state !== 'ended') batch.set(id, 'unknown');
      }
      for (const [id, state] of batch) {
        const key = provider + ':' + id;
        if (state === 'ended' && !completedAt.has(key)) completedAt.set(key, Date.now());
        if (state !== 'ended') completedAt.delete(key);
      }
      const states = [...batch.values()];
      const done = states.filter(state => state === 'ended').length;
      const running = states.filter(state => state === 'running').length;
      const waiting = states.filter(state => state === 'waiting').length;
      result.set(provider, { total: states.length, done, running, waiting,
        state: waiting ? 'waiting' : done === states.length ? 'ended' : 'running' });
    }
    return result;
  };
  update.acknowledge = (provider, sessionId) => {
    const batch = batches.get(provider);
    if (!batch) return;
    for (const [id, state] of batch) if (state === 'ended' && id === sessionId) batch.delete(id);
  };
  update.completed = () => [...batches].flatMap(([provider,batch]) => [...batch]
    .filter(([,state])=>state==='ended').map(([id])=>({provider,id,completedAt:completedAt.get(provider+':'+id)})));
  update.inspect = provider => {
    const values=[...(batches.get(provider)?.values() || [])];
    return {total:values.length,done:values.filter(state=>state==='ended').length};
  };
  update.clear = provider => batches.delete(provider);
  return update;
}
module.exports = { createTaskBatches };
