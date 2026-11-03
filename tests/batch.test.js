"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTaskBatches,
} = require("../src/vendor/token-monitor/src/electron/notch/taskBatch");
test("batch counts live session identities, retains completions, prioritizes help and resets", () => {
  const update = createTaskBatches();
  const row = (id, state) => ({ id, state, provider: "codex" });
  const read = (rows) => update(rows).get("codex");
  assert.equal(read([row("old", "ended")]), undefined);
  let b = read([
    row("a", "running"),
    row("b", "running"),
    row("c", "running"),
    row("a", "running"),
    row("old", "ended"),
  ]);
  assert.equal(b.total, 3);
  assert.equal(b.done, 0);
  b = read([row("a", "ended"), row("b", "running"), row("c", "running")]);
  assert.equal(b.done, 1);
  assert.equal(b.state, "running");
  b = read([row("b", "waiting"), row("c", "running")]);
  assert.equal(b.done, 1);
  assert.equal(b.state, "waiting");
  assert.equal(b.running, 1);
  b = read([row("b", "ended"), row("c", "running")]);
  assert.equal(b.done, 2);
  b = read([]);
  assert.equal(b.done, 2);
  assert.notEqual(b.state, "ended");
  b = read([row("c", "ended")]);
  assert.equal(b.state, "ended");
  assert.equal(b.done, 3);
  b = read([row("d", "running")]);
  assert.equal(b.total, 1);
  assert.equal(b.done, 0);
});

test("Claude and Codex batches progress independently, including assistance", () => {
  const update = createTaskBatches();
  const row = (provider, id, state) => ({ provider, id, state });
  let batches = update([
    row("claude", "a", "running"),
    row("claude", "b", "running"),
    row("codex", "a", "running"),
    row("codex", "b", "running"),
    row("codex", "c", "running"),
  ]);
  assert.equal(batches.get("claude").total, 2);
  assert.equal(batches.get("codex").total, 3);
  batches = update([
    row("claude", "a", "ended"),
    row("claude", "b", "waiting"),
    row("codex", "a", "running"),
    row("codex", "b", "ended"),
    row("codex", "c", "running"),
  ]);
  assert.deepEqual(
    [batches.get("claude").done, batches.get("claude").state],
    [1, "waiting"],
  );
  assert.deepEqual(
    [batches.get("codex").done, batches.get("codex").state],
    [1, "running"],
  );
  batches = update([
    row("claude", "b", "ended"),
    row("codex", "a", "running"),
    row("codex", "c", "running"),
  ]);
  assert.equal(batches.get("claude").state, "ended");
  assert.equal(batches.get("codex").state, "running");
});

test("acknowledging partial completion removes only completed members and they do not reappear", () => {
  const update = createTaskBatches();
  const row = (id, state) => ({ provider: "claude", id, state });
  update([row("a", "running"), row("b", "running")]);
  assert.equal(
    update([row("a", "ended"), row("b", "running")]).get("claude").done,
    1,
  );
  update.acknowledge("claude", "a");
  let batch = update([row("a", "ended"), row("b", "running")]).get("claude");
  assert.equal(batch.total, 1);
  assert.equal(batch.done, 0);
  assert.equal(batch.running, 1);
  batch = update([row("a", "ended"), row("b", "waiting")]).get("claude");
  update.acknowledge("claude", "a");
  assert.equal(update([row("b", "waiting")]).get("claude").waiting, 1);
  assert.equal(update([row("b", "ended")]).get("claude").state, "ended");
});
