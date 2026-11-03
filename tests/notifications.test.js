"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { NotificationQueue, claudeNotification, sessionURL } = require("../src/main/notifications");
const { TaskState } = require("../src/main/state");
const { notificationLayout } = require("../src/main/layout");
const row = (id = "one", completedAt = 1000) => ({ provider: "claude", id, state: "ended", completedAt,
  notification: { title: "方案已生成", description: "布局与说明已整理。", desktopId: "local_abc-123" } });
test("notification expires at five seconds, is deduplicated, and never acknowledges a task", () => {
  const q = new NotificationQueue(), state = new TaskState();
  state.update([{ ...row(), state: "running" }], 900); state.update([row()], 1000);
  q.observe([...state.sessions.values()], 1000); assert.ok(q.tick(1000));
  assert.ok(q.tick(5999)); assert.equal(q.tick(6000), null);
  q.observe([...state.sessions.values()], 6001); assert.equal(q.tick(6001), null);
  assert.equal(state.completed().length, 1);
  state.update([{ ...row(), state: "running" }], 7000); state.update([row()], 8000);
  q.observe([...state.sessions.values()], 8000); assert.ok(q.tick(8000));
});
test("hover and focus pause independently, preserving the remaining time", () => {
  const q = new NotificationQueue(); q.observe([row()], 1000); q.tick(1000);
  q.pause("hover", true, 2000); q.pause("focus", true, 2500);
  assert.equal(q.tick(12000).remaining, 4000);
  q.pause("hover", false, 12000); assert.equal(q.current.expiresAt, null);
  q.pause("focus", false, 13000); assert.ok(q.tick(16999)); assert.equal(q.tick(17000), null);
});
test("queue preserves multiple completions and rejects stale close events", () => {
  const q = new NotificationQueue(); q.observe([row(), row("two")], 1000); q.tick(1000);
  assert.equal(q.dismiss("wrong"), false); q.dismiss(q.current.key); q.tick(1100);
  assert.equal(q.current.sessionId, "two"); assert.equal(q.dismiss("one:1000"), false);
  q.observe([], 1200); assert.equal(q.tick(1200), null);
});
test("dashboard defers notifications; old pending events do not flood after resume", () => {
  const q = new NotificationQueue(); q.pause("dashboard", true, 1000);
  q.observe([row()], 1000); assert.equal(q.tick(1000), null);
  q.pause("dashboard", false, 62000); assert.equal(q.tick(62000), null);
});
test("summary waits briefly, uses current turn only, sanitizes text and constrains URLs", () => {
  const data = { sessionId: "local_abc-123", title: "A\nB", lastAssistantUuid: "new",
    postTurnSummaryFor: "old", postTurnSummary: { status_detail: "old summary" } };
  assert.deepEqual(claudeNotification(data), { desktopId: "local_abc-123", title: "A B", description: "" });
  data.postTurnSummaryFor = "new"; assert.equal(claudeNotification(data).description, "old summary");
  assert.equal(sessionURL("../../bad"), null); assert.equal(sessionURL("local_a?command=x"), null);
  assert.equal(sessionURL("local_abc-123"), "claude://claude.ai/claude-code-desktop/local_abc-123");
  const q = new NotificationQueue(); const pending = { ...row(), notification: { title: "Title" } };
  q.observe([pending], 1000); assert.equal(q.tick(1000), null);
  q.observe([pending], 5000); assert.equal(q.tick(5000).description, "本轮处理已结束。");
});
test("notification geometry leaves the hardware row intact and fits offset displays", () => {
  const g = notificationLayout({ bounds: { x: -1440, y: -100, width: 1440 } },
    { x: -900, y: -100, width: 340, height: 38 });
  assert.equal(g.height, 120); assert.equal(g.y, -100); assert.equal(g.width, 360);
  assert.ok(g.x >= -1440 && g.x + g.width <= 0);
});
test("desktop metadata completion feeds real title and current summary without replaying startup history", t => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const { createDesktopCompletionReader } = require("../src/vendor/token-monitor/src/electron/notch/desktopCompletion");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "notch-notifications-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "account", "org"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "local_test.json");
  const data = { sessionId: "local_test", cliSessionId: "cli-test", latestUserFrameAt: 100,
    completedTurns: 4, title: "真实会话标题", lastAssistantUuid: "answer", postTurnSummaryFor: "answer",
    postTurnSummary: { status_detail: "本轮完成摘要" } };
  const write = () => fs.writeFileSync(file, JSON.stringify(data)); write();
  const read = createDesktopCompletionReader(root);
  assert.deepEqual(read(10000), []);
  data.completedTurns++; write();
  const rows = read(12000); assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].notification, { desktopId: "local_test", title: "真实会话标题", description: "本轮完成摘要" });
  data.latestUserFrameAt = 200; write(); assert.deepEqual(read(14000), []);
  data.completedTurns++; data.interruptedAwaitingPerson = true; write(); assert.deepEqual(read(16000), []);
});
test("Claude and Codex share the queue without colliding; disabling one retains the other", () => {
  const q = new NotificationQueue();
  const claude = row("same"), codex = { ...row("same"), provider: "codex" };
  q.observe([claude, codex], 1000); q.tick(1000);
  assert.equal(q.current.provider, "claude");
  q.retain(["codex"]); q.tick(1100);
  assert.equal(q.current.provider, "codex");
  q.dismiss(q.current.key); q.observe([codex], 1200); assert.equal(q.tick(1200), null);
  const id = "01a1a06a-be28-75b0-a87f-67cb63e99502";
  assert.equal(sessionURL(id, "codex"), `codex://threads/${id}`);
  assert.equal(sessionURL("../new?prompt=bad", "codex"), null);
  assert.equal(sessionURL(id, "other"), null);
});
test("Codex emits immediately even without description; it never uses Claude's summary delay", () => {
  const q = new NotificationQueue();
  q.observe([{ ...row(), provider: "codex", notification: null }], 1000);
  assert.equal(q.tick(1000).provider, "codex");
});
test("Codex completion preview is current-turn text and resets on new work or cancellation", t => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const { readCodexSessionState } = require("../src/vendor/token-monitor/src/shared/providers/codex/sessionContext");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-notice-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "session.jsonl");
  const append = payload => fs.appendFileSync(file, JSON.stringify({ type: "event_msg", payload }) + "\n");
  append({ type: "task_started", turn_id: "one" });
  append({ type: "task_complete", last_agent_message: "修复完成。" });
  assert.equal(readCodexSessionState(file).completionDescription, "修复完成。");
  append({ type: "task_started", turn_id: "two" });
  assert.equal(readCodexSessionState(file).completionDescription, "");
  append({ type: "turn_aborted", last_agent_message: "不应显示" });
  assert.equal(readCodexSessionState(file).completionDescription, "");
});

test("foreground completion is consumed before presentation for either provider, without acknowledging tasks", () => {
  for (const provider of ["claude", "codex"]) {
    const q = new NotificationQueue(), state = new TaskState();
    state.update([{...row(),provider,state:"running"}],900);
    state.update([{...row(),provider}],1000);
    q.observe([...state.sessions.values()],1000,provider);
    assert.equal(q.pending.length,0);
    assert.equal(q.tick(1000,provider),null);
    assert.equal(state.completed().length,1);
    q.observe([...state.sessions.values()],1500,null);
    assert.equal(q.tick(1500,null),null,"switching away must not replay a foreground completion");
    state.update([{...row(),provider,state:"running"}],2000);
    state.update([{...row(),provider}],3000);
    q.observe([...state.sessions.values()],3000,null);
    assert.equal(q.tick(3000,null).provider,provider,"new background completion must still notify");
  }
});
test("foreground suppression is provider-specific and does not clear assistance or running tasks", () => {
  const state = new TaskState(), q = new NotificationQueue();
  state.update(["claude","codex"].flatMap(provider=>[
    {...row("done"),provider,state:"running"},
    {...row("working"),provider,state:"running"},
    {...row("question"),provider,state:"waiting"},
  ]),900);
  state.update(["claude","codex"].map(provider=>({...row("done"),provider})),1000);
  q.observe([...state.sessions.values()],1000,"claude");
  assert.equal(q.tick(1000,"claude").provider,"codex");
  assert.equal(state.sessions.get("claude:working").state,"running");
  assert.equal(state.sessions.get("claude:question").state,"waiting");
  assert.equal(state.completed().length,2);
});
test("switching foreground between observation and display discards queued notices without a single presentation", () => {
  const q=new NotificationQueue(), task={...row(),provider:"codex"};
  q.observe([task],1000);
  assert.equal(q.current,null);assert.equal(q.pending.length,1);
  assert.equal(q.tick(1001,"codex"),null);
  q.observe([task],1500);
  assert.equal(q.tick(1500),null);
});
test("switching to an app dismisses its visible and pending notices but preserves the other app", () => {
  const q=new NotificationQueue();
  const tasks=[row("one"),row("two"),{...row("three"),provider:"codex"}];
  q.observe(tasks,1000);assert.equal(q.tick(1000).provider,"claude");
  assert.equal(q.tick(1100,"claude").provider,"codex");
  q.dismiss(q.current.key);q.observe(tasks,1200,null);
  assert.equal(q.tick(1200),null);
});
test("foreground Claude is suppressed even before a delayed summary exists", () => {
  const q=new NotificationQueue(), task={...row(),notification:{title:"Title"}};
  q.observe([task],1000,"claude");assert.equal(q.tick(1000,"claude"),null);
  q.observe([{...task,notification:{title:"Title",description:"Arrived later"}}],5000,null);
  assert.equal(q.tick(5000),null);
});
test("an item deferred by the dashboard is consumed when its app is visited", () => {
  const q=new NotificationQueue();q.pause("dashboard",true,1000);
  q.observe([row()],1000);assert.equal(q.tick(1000),null);
  assert.equal(q.tick(1500,"claude"),null);
  q.pause("dashboard",false,1600);
  assert.equal(q.tick(1600,null),null);
});

test('notification toggle clears visible and pending cards without replay or task acknowledgement', () => {
  const q = new NotificationQueue();
  const first = row('visible'), pending = row('pending');
  q.observe([first,pending], 1000); assert.ok(q.tick(1000));
  q.setEnabled(false, [first,pending], 1100);
  assert.equal(q.current,null); assert.equal(q.pending.length,0);
  const muted = {...row('muted',1200),notification:{title:'Waiting for summary'}};
  q.observe([first,pending,muted],1200); assert.equal(q.tick(1200),null);
  q.setEnabled(true,[first,pending,muted],1300);
  q.observe([first,pending,{...muted,notification:row().notification}],1400);
  assert.equal(q.tick(1400),null);
  assert.equal(first.acknowledged,undefined);
  q.observe([row('new',1500)],1500);assert.equal(q.tick(1500).sessionId,'new');
});
