"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createToolLauncher } = require("../src/main/tool-launcher");

test("synchronous EPERM becomes a plain-language notice, not an uncaught exception", async () => {
  const notices = [];
  const open = createToolLauncher({
    execute() { throw Object.assign(new Error("spawn EPERM /private/session-secret"), { code: "EPERM" }); },
    showMessageBox: async options => notices.push(options),
  });
  assert.equal(await open("claude"), false);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].message, "暂时没能打开 Claude");
  assert.match(notices[0].detail, /手动打开 Claude/);
  assert.doesNotMatch(JSON.stringify(notices), /EPERM|private|session-secret|请先安装|权限/);
});

test("asynchronous failure and timeout are contained; a later successful attempt still works", async () => {
  let failure = true, notices = 0;
  const open = createToolLauncher({
    execute(file, args, options, callback) {
      assert.equal(options.timeout, 10000);
      setImmediate(() => callback(failure ? Object.assign(new Error("timeout"), { killed: true }) : null));
    },
    showMessageBox: async () => { notices++; },
  });
  assert.equal(await open("codex"), false);
  failure = false;
  assert.equal(await open("codex"), true);
  assert.equal(notices, 1);
});

test("repeated clicks neither duplicate pending launches nor stack dialogs across tools", async () => {
  let finishDialog, calls = 0, notices = 0, clock = 0;
  const open = createToolLauncher({
    execute() { calls++; throw new Error("denied"); },
    showMessageBox: () => { notices++; return new Promise(resolve => { finishDialog = resolve; }); },
    now: () => clock,
  });
  const first = open("claude");
  await Promise.resolve();
  assert.equal(await open("claude"), false);
  clock = 60000;
  assert.equal(await open("codex"), false);
  assert.equal(calls, 2);
  assert.equal(notices, 1);
  finishDialog(); await first;
});

test("30-second notice cooldown suppresses noise without blocking launch attempts", async () => {
  let clock = 0, calls = 0, notices = 0;
  const open = createToolLauncher({
    execute() { calls++; throw new Error("denied"); },
    showMessageBox: async () => { notices++; }, now: () => clock,
  });
  await open("claude"); clock = 29999; await open("codex");
  assert.equal(notices, 1);
  clock = 30000; await open("claude");
  assert.equal(notices, 2); assert.equal(calls, 3);
});

test("dialog failure is contained and does not block future launches", async () => {
  let failing = true;
  const open = createToolLauncher({
    execute(file, args, options, callback) { callback(failing ? new Error("denied") : null); },
    showMessageBox() { throw new Error("app closing"); },
  });
  assert.equal(await open("claude"), false);
  failing = false;
  assert.equal(await open("claude"), true);
});

test("successful app and session launches use fixed bundles, with no notice; unknown tools are ignored", async () => {
  const calls = [];
  const open = createToolLauncher({
    execute(file, args, options, callback) { calls.push([file, args]); callback(null); },
    showMessageBox() { assert.fail("successful launch must be silent"); },
  });
  assert.equal(await open("claude"), true);
  assert.equal(await open("codex", "codex://threads/test-session"), true);
  for (const provider of ["unknown", "toString", "__proto__"]) assert.equal(await open(provider), false);
  assert.deepEqual(calls, [
    ["/usr/bin/open", ["-b", "com.anthropic.claudefordesktop"]],
    ["/usr/bin/open", ["-b", "com.openai.codex", "codex://threads/test-session"]],
  ]);
});

// Exercise the production handlers with controlled launch results and task state.
const source = fs.readFileSync(require.resolve("../src/main/index"), "utf8");
function handlers(launchTool, url) {
  const dismissed = [], activated = [], completed = [{ id: "original-task" }];
  const context = vm.createContext({
    launchTool, smoke: false, sessionURL: () => url,
    notifications: { current: { key: "original-notification", provider: "claude" }, dismiss: key => dismissed.push(key) },
    state: { completed: () => completed }, readState: { didActivate: (...args) => activated.push(args) },
    applyBounds() {}, render() {},
  });
  vm.runInContext(source.slice(source.indexOf("async function openNotification("), source.indexOf("function menu(")), context);
  return { context, dismissed, activated, completed };
}

test("failed notification opens preserve reminders and never mark tasks as visited", async () => {
  for (const url of [null, "claude://session/test"]) {
    const open = createToolLauncher({ execute() { throw new Error("EPERM"); }, showMessageBox: async () => {} });
    const h = handlers(open, url);
    await h.context.openNotification("original-notification");
    assert.deepEqual(h.dismissed, []); assert.deepEqual(h.activated, []);
    assert.equal(await h.context.openTool("claude"), false);
    assert.deepEqual(h.activated, []);
  }
});

test("successful notification opens dismiss only the clicked notification and preserve visit semantics", async () => {
  for (const url of [null, "claude://session/test"]) {
    let finish;
    const h = handlers(() => new Promise(resolve => { finish = resolve; }), url);
    const opening = h.context.openNotification("original-notification");
    h.context.notifications.current = { key: "new-notification", provider: "codex" };
    finish(true); await opening;
    assert.deepEqual(h.dismissed, ["original-notification"]);
    assert.equal(h.activated.length, url ? 0 : 1);
    if (!url) assert.equal(h.activated[0][1], h.completed);
  }
});

test('WorkBuddy launch uses the installed official bundle identifier', async () => {
  let args;
  const open = createToolLauncher({execute(_file,value,_options,callback){args=value;callback(null);}});
  assert.equal(await open('workbuddy'),true);
  assert.deepEqual(args,['-b','com.tencent.workbuddy.mac']);
});
