"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("an observed unanswered question survives a quiet transcript and abort never becomes success", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mac-notch-activity-"));
  const previous = { CODEX_HOME: process.env.CODEX_HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR };
  process.env.CODEX_HOME = root;
  process.env.CLAUDE_CONFIG_DIR = path.join(root, "claude");
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const now = Date.now(), date = new Date(now);
  const dir = path.join(root, "sessions", String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0"));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "rollout-test.jsonl");
  const append = payload => fs.appendFileSync(file, JSON.stringify({ type: "response_item", payload }) + "\n");
  append({ type: "task_started", turn_id: "turn-1" });
  append({ type: "function_call", name: "request_user_input_async", call_id: "question", arguments: '{"questions":[{}]}' });
  append({ type: "function_call_output", call_id: "question", output: '{"accepted":true}' });
  const { readActivity } = require("../src/main/activity");
  const codex = async time => (await readActivity(time)).find(r => r.provider === "codex");
  assert.equal((await codex(now)).state, "waiting");
  fs.utimesSync(file, new Date(now - 3600000), new Date(now - 3600000));
  assert.equal((await codex(now + 6000)).state, "waiting");
  append({ type: "turn_aborted" });
  assert.equal((await codex(now + 8000)).state, "idle");
});
