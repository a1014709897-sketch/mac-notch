"use strict";
const {
  createTaskBatches,
} = require("../vendor/token-monitor/src/electron/notch/taskBatch");
const PROVIDERS = ["claude", "codex"];
// Completion needs a witnessed active turn; disappearance is never success.
class TaskState {
  constructor() {
    this.sessions = new Map();
    this.batches = createTaskBatches();
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
    const visible = [...this.sessions.values()].filter(
      (row) => !row.acknowledged && rank[row.state],
    );
    for (const provider of PROVIDERS)
      if (!visible.some((row) => row.provider === provider))
        this.batches.clear(provider);
    const batches = this.batches(visible);
    return PROVIDERS.map((provider) => {
      const rows = [...this.sessions.values()].filter(
        (row) =>
          row.provider === provider && !row.acknowledged && rank[row.state],
      );
      rows.sort((a, b) => rank[b.state] - rank[a.state] || b.seen - a.seen);
      const batch = batches.get(provider);
      const state = batch?.total > 1 ? batch.state : rows[0]?.state || "idle";
      return {
        provider,
        state,
        count: batch?.total || rows.length,
        animating: batch ? batch.running > 0 : state === "running",
        progress:
          batch?.total > 1 ? { done: batch.done, total: batch.total } : null,
      };
    });
  }
  completed() {
    return [...this.sessions.values()]
      .filter((row) => row.state === "ended" && !row.acknowledged)
      .map(({ provider, id, completedAt }) => ({ provider, id, completedAt }));
  }
  acknowledge(provider, sessionId) {
    if (!sessionId) return;
    this.batches.acknowledge(provider, sessionId);
    for (const row of this.sessions.values())
      if (
        row.provider === provider &&
        row.id === sessionId &&
        row.state === "ended"
      )
        row.acknowledged = true;
  }
}
module.exports = { TaskState, PROVIDERS };
