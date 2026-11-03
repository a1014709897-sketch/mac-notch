"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { TaskState } = require("../src/main/state");
const { layout } = require("../src/main/layout");
const {
  remaining,
  claudeWindows,
  codexWindows,
} = require("../src/main/quotas");
const row = (state, extra = {}) => ({
  provider: "codex",
  id: "a",
  state,
  ...extra,
});
test("startup history is not completion; real completion persists until acknowledged", () => {
  const s = new TaskState();
  s.update([row("ended")], 100);
  assert.equal(s.snapshot()[1].state, "idle");
  s.update([row("running")], 200);
  s.update([row("ended")], 300);
  s.update([], 1000);
  assert.equal(s.snapshot()[1].state, "ended");
  s.acknowledge("codex", "a");
  assert.equal(s.snapshot()[1].state, "idle");
  s.update([row("ended")], 2000);
  assert.equal(s.snapshot()[1].state, "idle");
  s.update([row("running", { turn: "new" })], 3000);
  assert.equal(s.snapshot()[1].state, "running");
});
test("answered waiting resumes; missing evidence expires instead of becoming success", () => {
  const s = new TaskState();
  s.update([row("waiting")], 100);
  s.acknowledge("codex", "a");
  assert.equal(s.snapshot()[1].state, "waiting");
  s.update([row("running")], 200);
  assert.equal(s.snapshot()[1].state, "running");
  s.update([], 30201);
  assert.equal(s.snapshot()[1].state, "idle");
});
test("multiple sessions prioritize waiting and acknowledgement does not hide new running work", () => {
  const s = new TaskState();
  s.update(
    [
      row("running"),
      row("waiting", { id: "b" }),
      { provider: "claude", id: "c", state: "running" },
    ],
    100,
  );
  assert.deepEqual(
    s.snapshot().map((r) => r.state),
    ["running", "waiting"],
  );
  s.update([row("ended"), row("running", { id: "b" })], 200);
  s.acknowledge("codex", "a");
  assert.equal(s.snapshot()[1].state, "running");
});
test("physical camera gap determines geometry, not content or state", () => {
  const d = { bounds: { x: 0, y: 0, width: 1728, height: 1117 } };
  const native = {
    frame: { origin: { x: 0, y: 0 }, size: { width: 1728 } },
    safeTop: 32,
    left: { origin: { x: 0 }, size: { width: 771.5 } },
    right: { origin: { x: 956.5 } },
  };
  const g = layout(d, native);
  assert.equal(g.gap, 185);
  assert.equal(g.width, 305);
  assert.equal(g.height, 32);
  assert.equal(layout(d, null).width, 264);
});
test("remaining quota is not token usage and zero remains a valid value", () => {
  assert.deepEqual(
    claudeWindows({ five_hour: { utilization: 100 } })[0].remaining,
    0,
  );
  assert.equal(
    remaining({
      windows: codexWindows({
        rate_limit: {
          primary_window: { used_percent: 3 },
          secondary_window: { used_percent: 16 },
        },
      }),
    }),
    84,
  );
  assert.equal(remaining({ windows: [] }), null);
  assert.deepEqual(claudeWindows({ five_hour: { utilization: "bad" } }), []);
});

test("batch progress survives partial completion and acknowledgement, then resets for new work", () => {
  const s = new TaskState();
  const r = (id, state, provider = "codex") => ({ provider, id, state });
  s.update([r("a", "running"), r("b", "running"), r("c", "running")], 100);
  assert.deepEqual(s.snapshot()[1].progress, { done: 0, total: 3 });
  s.update([r("a", "ended"), r("b", "waiting"), r("c", "running")], 200);
  assert.deepEqual(s.snapshot()[1].progress, { done: 1, total: 3 });
  assert.equal(s.snapshot()[1].animating, true);
  assert.equal(s.snapshot()[1].state, "waiting");
  s.acknowledge("codex");
  assert.deepEqual(s.snapshot()[1].progress, { done: 1, total: 3 });
  s.acknowledge("codex", "a");
  assert.deepEqual(s.snapshot()[1].progress, { done: 0, total: 2 });
  assert.equal(s.snapshot()[1].state, "waiting");
  s.update([r("a", "ended"), r("b", "ended"), r("c", "ended")], 300);
  assert.deepEqual(s.snapshot()[1].progress, { done: 2, total: 2 });
  assert.equal(s.snapshot()[1].state, "ended");
  s.update([r("d", "running")], 400);
  assert.equal(s.snapshot()[1].progress, null);
  assert.equal(s.snapshot()[1].count, 1);
});

test("all displays attach at top; expanded surface stays below its own camera header", () => {
  const { expandedLayout } = require("../src/main/layout");
  const d = {
    bounds: { x: -1920, y: -1080, width: 1920, height: 1080 },
    workArea: { x: -1920, y: -1056, width: 1920, height: 1056 },
  };
  const g = layout(d, null),
    e = expandedLayout(d, g);
  assert.equal(g.y, -1080);
  assert.equal(e.y, g.y);
  assert.ok(e.height > g.height);
  assert.ok(e.width <= d.bounds.width);
});
