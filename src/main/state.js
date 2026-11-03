"use strict";
const PROVIDERS = ["claude", "codex"];
// Completion needs a witnessed active turn; disappearance is never success.
class TaskState {
  constructor() {
    this.sessions = new Map();
  }
  update(rows, now = Date.now()) {
    const present = new Set();
    for (const row of rows) {
      const key = `${row.provider}:${row.id}`;
      present.add(key);
      const old = this.sessions.get(key);
      const active = ["running", "waiting"].includes(row.state);
      const fresh =
        active &&
        (!old ||
          old.state === "ended" ||
          old.state === "idle" ||
          (row.turn && old.turn !== row.turn));
      const next = {
        ...old,
        ...row,
        seen: now,
        generation: fresh ? (old?.generation || 0) + 1 : old?.generation || 0,
      };
      if (fresh) {
        next.acknowledged = false;
        next.completedAt = null;
      }
      if (row.state === "ended") {
        if (!old || old.state === "idle") continue;
        next.completedAt = old.completedAt || now;
      }
      this.sessions.set(key, next);
    }
    for (const [key, row] of this.sessions) {
      if (!present.has(key) && row.state !== "ended" && now - row.seen > 30000)
        this.sessions.delete(key);
      if (row.state === "ended" && now - row.completedAt > 24 * 3600000)
        this.sessions.delete(key);
    }
    return this.snapshot();
  }
  snapshot() {
    const rank = { waiting: 3, running: 2, ended: 1 };
    return PROVIDERS.map((provider) => {
      const rows = [...this.sessions.values()].filter(
        (row) =>
          row.provider === provider && !row.acknowledged && rank[row.state],
      );
      rows.sort((a, b) => rank[b.state] - rank[a.state] || b.seen - a.seen);
      return { provider, state: rows[0]?.state || "idle", count: rows.length };
    });
  }
  acknowledge(provider) {
    for (const row of this.sessions.values())
      if (row.provider === provider && row.state === "ended")
        row.acknowledged = true;
  }
}
module.exports = { TaskState, PROVIDERS };
