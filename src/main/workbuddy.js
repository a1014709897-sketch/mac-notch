"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { isUserPromptRecord, assistantStatus, cleanTitle } = require("../vendor/token-monitor/src/shared/providers/codebuddy/transcript");
const { notificationText } = require("./notification-text");

function applyRecord(state, row) {
  if (row.type === "custom-title" || row.type === "ai-title") {
    const title = cleanTitle(row.customTitle ?? row.aiTitle);
    if (title) state[row.type === "custom-title" ? "customTitle" : "title"] = title;
  }
  if (isUserPromptRecord(row)) {
    state.turn = row.id || row.timestamp;
    state.state = "running";
    state.description = "";
    state.pending = {};
  } else if (row.type === "function_call") {
    state.state = "running";
    // Only the explicit interactive tool is a request for human input.
    if (row.name === "AskUserQuestion" && row.callId) {
      let args = row.arguments;
      try { if (typeof args === "string") args = JSON.parse(args); } catch { args = null; }
      state.pending[row.callId] = notificationText((args?.questions || []).map(q => q.question).filter(Boolean).join("；"));
    }
  } else if (row.type === "function_call_result" && row.callId) {
    delete state.pending[row.callId];
  } else if (assistantStatus(row)) {
    state.state = assistantStatus(row) === "completed" ? "ended" : "idle";
    state.pending = {};
    state.description = notificationText(typeof row.content === "string" ? row.content :
      (row.content || []).filter(p => p.type === "output_text").map(p => p.text).join("\n"));
  }
}
function createWorkbuddyReader({ home = os.homedir() } = {}) {
  const cache = new Map();
  return async function read(now = Date.now()) {
    const files = [];
    function discover(dir, depth = 0) {
      if (depth > 3 || files.length >= 256) return;
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) discover(file, depth + 1);
          else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            const stat = fs.statSync(file);
            if (now - stat.mtimeMs < 10 * 60000 || Object.keys(cache.get(file)?.state.pending || {}).length) files.push([file, stat]);
          }
          if (files.length >= 256) break;
        }
      } catch { /* Missing/rotating project directories are normal. */ }
    }
    for (const name of [".workbuddy", ".workbuddy-ai"]) discover(path.join(home, name, "projects"));
    const rows = new Map();
    for (const [file, stat] of files) {
      try {
        let cached = cache.get(file);
        if (!cached || cached.ino !== stat.ino || stat.size < cached.offset || (stat.size === cached.offset && stat.mtimeMs !== cached.mtime))
          cached = { ino: stat.ino, offset: 0, state: { pending: {}, state: "idle" } };
        if (stat.size > cached.offset) {
          let buffer = Buffer.alloc(0), dropped = false;
          for await (const chunk of fs.createReadStream(file, { start: cached.offset, end: stat.size - 1, highWaterMark: 65536 })) {
            buffer = Buffer.concat([buffer, chunk]);
            let index;
            while ((index = buffer.indexOf(10)) >= 0) {
              const line = buffer.subarray(0, index); cached.offset += index + 1;
              if (!dropped && line.length <= 1024 * 1024) {
                try { applyRecord(cached.state, JSON.parse(line.toString("utf8"))); } catch {}
              }
              dropped = false; buffer = buffer.subarray(index + 1);
            }
            if (buffer.length > 1024 * 1024) { cached.offset += buffer.length; buffer = Buffer.alloc(0); dropped = true; }
          }
          // Partial final records are retried on the next scan.
        }
        cached.mtime = stat.mtimeMs; cache.set(file, cached);
        const s = cached.state, id = path.basename(file, ".jsonl");
        const row = { provider: "workbuddy", id, turn: s.turn,
          state: Object.keys(s.pending).length ? "waiting" : s.state,
          waitingIds: Object.keys(s.pending), waitingPrompts: { ...s.pending },
          notification: { title: s.customTitle || s.title || "WorkBuddy 会话", description: s.description || "", desktopId: null } };
        // The same session may exist in both old and new homes; take the newest.
        if (!rows.has(id) || rows.get(id).mtime < stat.mtimeMs) rows.set(id, { row, mtime: stat.mtimeMs });
      } catch { /* A failed read must not turn cached activity into completion. */ }
    }
    const retained = new Set(files.map(([file]) => file));
    for (const file of cache.keys()) if (!retained.has(file)) cache.delete(file);
    return [...rows.values()].map(item => item.row);
  };
}
module.exports = { createWorkbuddyReader, readWorkbuddyActivity: createWorkbuddyReader(), applyRecord };
