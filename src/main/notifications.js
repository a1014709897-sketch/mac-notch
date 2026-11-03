"use strict";
const { notificationText } = require("./notification-text");
const DURATION = 5000;
function clean(value, limit) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
    : "";
}
function claudeNotification(data) {
  const summary = data.postTurnSummary;
  const current = summary && data.lastAssistantUuid &&
    (data.postTurnSummaryFor || summary.summarizes_uuid) === data.lastAssistantUuid;
  return {
    desktopId: /^local_[A-Za-z0-9-]{1,64}$/.test(data.sessionId) ? data.sessionId : null,
    title: clean(data.title, 160) || "任务已完成",
    description: current ? notificationText(summary.status_detail || summary.description) : "",
  };
}
function codexNotification(id, title, description) {
  return { desktopId: id, title: clean(title, 160) || "任务已完成",
    description: notificationText(description) };
}
function sessionURL(desktopId, provider = "claude") {
  if (provider === "codex") return typeof desktopId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(desktopId)
    ? `codex://threads/${desktopId}` : null;
  if (provider !== "claude") return null;
  return typeof desktopId === "string" && /^local_[A-Za-z0-9-]{1,64}$/.test(desktopId)
    ? `claude://claude.ai/claude-code-desktop/${encodeURIComponent(desktopId)}` : null;
}
// Presentation state is deliberately separate from task acknowledgement.
class NotificationQueue {
  constructor() {
    this.enabled = true;
    this.seen = new Map();
    this.pending = [];
    this.current = null;
    this.pauses = new Set();
  }
  setEnabled(value, rows = [], now = Date.now()) {
    // Consume completions seen while disabled, including a delayed Claude summary.
    if (!this.enabled || value === false)
      for (const row of rows)
        if (row.state === "ended") this.seen.set(`${row.provider}:${row.id}:${row.completedAt}`, now);
    this.enabled = value !== false;
    if (!this.enabled) this.clear();
  }
  observe(rows, now = Date.now(), foreground = null) {
    this.suppressForeground(foreground);
    const eligible = rows.filter(r => ["claude", "codex"].includes(r.provider) && r.state === "ended" && !r.acknowledged);
    const keys = new Set(eligible.map(r => `${r.provider}:${r.id}:${r.completedAt}`));
    this.pending = this.pending.filter(n => keys.has(n.key));
    if (this.current && !keys.has(this.current.key)) this.dismiss(this.current.key);
    for (const row of eligible) {
      const key = `${row.provider}:${row.id}:${row.completedAt}`;
      if (this.seen.has(key) || now - row.completedAt > 60000) continue;
      // A completion already visible in its app needs no popup, including when
      // Claude's summary arrives later. Consume presentation only, not task state.
      if (!this.enabled || row.provider === foreground) {
        this.seen.set(key, now);
        continue;
      }
      // Give Claude's asynchronous post-turn summary two scan cycles to arrive.
      if (row.provider === "claude" && !row.notification?.description && now - row.completedAt < 4000) continue;
      this.seen.set(key, now);
      this.pending.push({ key, provider: row.provider, sessionId: row.id,
        desktopId: row.notification?.desktopId || null,
        title: row.notification?.title || "任务已完成",
        description: row.notification?.description || "本轮处理已结束。", createdAt: now });
    }
    this.pending = this.pending.slice(-20);
    for (const [key, time] of this.seen) if (now - time > 86400000) this.seen.delete(key);
  }
  pause(reason, value, now = Date.now()) {
    const wasPaused = this.pauses.size > 0;
    if (value) this.pauses.add(reason); else this.pauses.delete(reason);
    if (!this.current) return;
    if (!wasPaused && this.pauses.size) {
      this.current.remaining = Math.max(0, this.current.expiresAt - now);
      this.current.expiresAt = null;
    } else if (wasPaused && !this.pauses.size) this.current.expiresAt = now + this.current.remaining;
  }
  dismiss(key) {
    if (this.current?.key !== key) return false;
    this.current = null;
    this.pauses.delete("hover");
    this.pauses.delete("focus");
    return true;
  }
  suppressForeground(foreground) {
    if (!["claude", "codex"].includes(foreground)) return;
    this.pending = this.pending.filter(item => item.provider !== foreground);
    if (this.current?.provider === foreground) this.dismiss(this.current.key);
  }
  tick(now = Date.now(), foreground = null) {
    // Recheck immediately before presenting: the user may have switched apps
    // after observe(), or while this item waited behind another notification.
    this.suppressForeground(foreground);
    if (this.current?.expiresAt !== null && this.current && now >= this.current.expiresAt)
      this.dismiss(this.current.key);
    this.pending = this.pending.filter(n => now - n.createdAt < 60000);
    if (this.enabled && !this.current && !this.pauses.size && this.pending.length)
      this.current = { ...this.pending.shift(), remaining: DURATION, expiresAt: now + DURATION };
    return this.current;
  }
  retain(providers) {
    this.pending = this.pending.filter(item => providers.includes(item.provider));
    if (this.current && !providers.includes(this.current.provider)) this.dismiss(this.current.key);
  }
  clear() { this.pending = []; this.current = null; this.pauses.delete("hover"); this.pauses.delete("focus"); }
}
module.exports = { NotificationQueue, claudeNotification, codexNotification, sessionURL, DURATION };
