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
    ["running", "waiting", "idle"],
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
  assert.equal(g.width, 349);
  assert.equal(g.height, 32);
  assert.deepEqual(layout(d, native, true), g);
  assert.deepEqual(layout(d, null, true), layout(d, null, false));
  assert.equal(layout(d, null).width, 308);
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
  assert.deepEqual(s.snapshot()[1].progress, { done: 2, total: 3 });
  assert.equal(s.snapshot()[1].count, 3);
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

test('content grows independently on either wing while the camera stays anchored', () => {
  const {contentLayout, expandedLayout, notificationLayout}=require('../src/main/layout');
  const base={x:100,y:0,width:341,height:32,gap:185,hardware:true,centerX:270.5};
  const compact=contentLayout(base,{left:22,right:20,single:true});
  const rightGrows=contentLayout(base,{left:22,right:38,single:true});
  const leftGrows=contentLayout(base,{left:55,right:20,single:false});
  assert.equal(rightGrows.width-compact.width,18);
  assert.equal(rightGrows.x,compact.x);
  assert.equal(leftGrows.width-compact.width,33);
  assert.equal(leftGrows.x,compact.x-33);
  for(const g of [compact,rightGrows,leftGrows]) {
    assert.equal(g.x+g.cameraLeft+g.gap/2,base.centerX);
    assert.ok(g.outer+g.left<=g.cameraLeft-5);
    assert.ok(g.outer+g.left+g.spacer>=g.cameraLeft+g.gap+5);
    assert.equal(g.width-(g.outer+g.left+g.spacer+g.right),g.outer);
  }
  const display={bounds:{x:0,y:0,width:1000},workArea:{height:800}};
  assert.equal(expandedLayout(display,compact).x,expandedLayout(display,rightGrows).x);
  assert.equal(notificationLayout(display,compact).x,notificationLayout(display,rightGrows).x);
});
test('no-camera layout has only content, shared margins and actual inter-item gaps',()=>{
  const {contentLayout}=require('../src/main/layout');
  const base=layout({bounds:{x:-1920,y:0,width:1920}},null);
  const off=contentLayout(base,{left:22,right:0,single:true});
  const one=contentLayout(base,{left:22,right:19,single:true});
  const two=contentLayout(base,{left:22,right:27,single:true});
  const three=contentLayout(base,{left:22,right:35,single:true});
  assert.deepEqual([off.width,one.width,two.width,three.width],[78,101,109,117]);
  for(const g of [off,one,two,three]) assert.ok(Math.abs(g.x+g.width/2-base.centerX)<=0.5);
});
