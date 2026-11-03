"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const exec = promisify(execFile);
const {
  readCodexSessionState,
} = require("../vendor/token-monitor/src/shared/providers/codex/sessionContext");
const {
  createDesktopCompletionReader,
} = require("../vendor/token-monitor/src/electron/notch/desktopCompletion");
const {
  nativeIdForFile,
} = require("../vendor/token-monitor/src/shared/providers/codex/sessionIdentity");
const home = os.homedir();
const claudeRoot = process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
const codexRoot = process.env.CODEX_HOME || path.join(home, ".codex");
const complete = createDesktopCompletionReader();
let candidates = [],
  discovered = 0;
const waitingFiles = new Set();
function json(file, max = 65536) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > max) throw new Error("Invalid metadata");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function codexFiles(now) {
  if (now - discovered < 5000) return candidates;
  discovered = now;
  const files = new Set(waitingFiles);
  // Database discovers historical chats resumed today without scanning transcript contents.
  for (const name of fs.existsSync(codexRoot)
    ? fs.readdirSync(codexRoot).filter((n) => /^state_\d+\.sqlite$/.test(n))
    : []) {
    let db;
    try {
      const { DatabaseSync } = require("node:sqlite");
      db = new DatabaseSync(path.join(codexRoot, name), { readOnly: true });
      for (const row of db
        .prepare(
          "SELECT rollout_path FROM threads WHERE archived = 0 ORDER BY updated_at DESC LIMIT 128",
        )
        .all())
        if (row.rollout_path) files.add(row.rollout_path);
    } catch {
      /* Older client schema falls back to recent folders. */
    } finally {
      db?.close();
    }
  }
  for (let day = 0; day < 3; day++) {
    const d = new Date(now - day * 86400000);
    const dir = path.join(
      codexRoot,
      "sessions",
      String(d.getFullYear()),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    );
    try {
      for (const name of fs.readdirSync(dir))
        if (/\.jsonl$/.test(name)) files.add(path.join(dir, name));
    } catch {}
  }
  let root;
  try {
    root = fs.realpathSync(path.join(codexRoot, "sessions")) + path.sep;
  } catch {
    return (candidates = []);
  }
  candidates = [...files]
    .filter((file) => {
      try {
        const real = fs.realpathSync(file);
        return (
          real.startsWith(root) &&
          (waitingFiles.has(file) || now - fs.statSync(real).mtimeMs < 1800000)
        );
      } catch {
        return false;
      }
    })
    .slice(0, 256);
  return candidates;
}
async function readActivity(now = Date.now(), enabled = ["claude", "codex"]) {
  const rows = [];
  for (const file of enabled.includes("codex") ? codexFiles(now) : []) {
    try {
      const stat = fs.statSync(file);
      if (!waitingFiles.has(file) && now - stat.mtimeMs > 10 * 60000) continue;
      const s = readCodexSessionState(file);
      if (s.waitingForInput) waitingFiles.add(file);
      else waitingFiles.delete(file);
      if (typeof s.turnEnded !== "boolean" && !s.waitingForInput) continue;
      rows.push({
        provider: "codex",
        id: nativeIdForFile(file) || path.basename(file),
        state: s.turnAborted
          ? "idle"
          : s.waitingForInput
            ? "waiting"
            : s.turnEnded
              ? "ended"
              : "running",
        turn: s.taskIdentity,
      });
    } catch {}
  }
  if (!enabled.includes("claude")) return rows;
  const registry = path.join(claudeRoot, "sessions");
  const records = [];
  try {
    for (const name of fs
      .readdirSync(registry)
      .filter((n) => /^\d+\.json$/.test(n))
      .slice(0, 256)) {
      try {
        const r = json(path.join(registry, name));
        if (
          r.pidDomain !== "darwin" ||
          `${r.pid}.json` !== name ||
          !Number.isSafeInteger(r.pid) ||
          r.pid <= 0 ||
          !r.procStart ||
          !r.sessionId
        )
          continue;
        records.push(r);
      } catch {}
    }
  } catch {}
  const starts = new Map();
  if (records.length) {
    try {
      const { stdout } = await exec(
        "/bin/ps",
        ["-p", records.map((r) => r.pid).join(","), "-o", "pid=,lstart="],
        { env: { ...process.env, TZ: "UTC" }, timeout: 2000, maxBuffer: 65536 },
      );
      for (const line of stdout.trim().split("\n")) {
        const m = line.trim().match(/^(\d+)\s+(.+)$/);
        if (m) starts.set(Number(m[1]), Date.parse(m[2] + " UTC"));
      }
    } catch {}
  }
  for (const r of records) {
    if (
      Math.abs((starts.get(r.pid) ?? NaN) - Date.parse(r.procStart + " UTC")) >
        1000 ||
      !Number.isFinite(starts.get(r.pid))
    )
      continue;
    const state =
      r.status === "waiting" || r.tempo === "blocked"
        ? "waiting"
        : r.status === "busy" || r.tempo === "active"
          ? "running"
          : null;
    if (state) rows.push({ provider: "claude", id: r.sessionId, state });
  }
  for (const r of complete(now)) {
    // Never override a newer explicit running or waiting observation.
    if (
      !rows.some((row) => row.provider === "claude" && row.id === r.sessionId)
    )
      rows.push({ provider: "claude", id: r.sessionId, state: "ended" });
  }
  return rows;
}
module.exports = { readActivity, codexFiles };
