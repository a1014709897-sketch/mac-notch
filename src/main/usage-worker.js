"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { parserState, consume, summarize } = require("./usage");
const roots = {
  codex: [
    path.join(
      process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
      "sessions",
    ),
    path.join(
      process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
      "archived_sessions",
    ),
  ],
  claude: ["projects", "transcripts"].map((p) =>
    path.join(
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"),
      p,
    ),
  ),
};
// In-memory incremental cache; no transcript text or credentials written to disk.
const files = new Map();
let enabled = workerData.enabled,
  busy = false;
function discover(dir, cutoff, result, depth = 0) {
  if (depth > 12) return;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = path.join(dir, e.name);
      if (e.isDirectory()) discover(name, cutoff, result, depth + 1);
      else if (e.isFile() && e.name.endsWith(".jsonl")) {
        const stat = fs.statSync(name);
        if (stat.mtimeMs >= cutoff) result.push([name, stat]);
      }
    }
  } catch {
    /* Missing or disappearing logs are normal. */
  }
}
async function read(file, stat, provider) {
  let entry = files.get(file);
  if (!entry || stat.size < entry.offset || entry.ino !== stat.ino) {
    entry = { offset: 0, ino: stat.ino, state: parserState() };
    files.set(file, entry);
  }
  if (stat.size === entry.offset) return;
  let buffer = Buffer.alloc(0),
    position = entry.offset,
    oversized = false;
  const stream = fs.createReadStream(file, {
    start: entry.offset,
    end: stat.size - 1,
    highWaterMark: 256 * 1024,
  });
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
    let index;
    while ((index = buffer.indexOf(10)) >= 0) {
      const line = buffer.subarray(0, index);
      position += index + 1;
      if (!oversized)
        try {
          consume(entry.state, JSON.parse(line.toString("utf8")), provider);
        } catch {}
      oversized = false;
      buffer = buffer.subarray(index + 1);
      entry.offset = position;
    }
    if (buffer.length > 16 * 1024 * 1024) {
      position += buffer.length;
      buffer = Buffer.alloc(0);
      oversized = true;
    }
  }
  // A partial final line is reread next time, never counted until complete.
}
async function scan() {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now(),
      cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);
    const present = new Set();
    let incomplete = false;
    for (const provider of enabled) {
      const candidates = [];
      for (const root of roots[provider])
        discover(root, cutoff.getTime(), candidates);
      for (const [file, stat] of candidates) {
        present.add(file);
        try {
          await read(file, stat, provider);
        } catch {
          incomplete = true;
        }
      }
    }
    for (const file of files.keys()) if (!present.has(file)) files.delete(file);
    const result = summarize(
      [...files.values()].map((f) => f.state),
      enabled,
      now,
    );
    parentPort.postMessage({ ...result, incomplete });
  } catch {
    parentPort.postMessage({
      error: "用量读取暂时失败，请稍后刷新",
      loading: false,
    });
  } finally {
    busy = false;
  }
}
parentPort.on("message", (message) => {
  if (message.enabled) enabled = message.enabled;
  scan();
});
scan();
setInterval(scan, 30000);
