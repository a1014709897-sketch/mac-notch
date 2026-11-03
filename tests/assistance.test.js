'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { TaskState } = require('../src/main/state');
const { NotificationQueue } = require('../src/main/notifications');
const row = (state, extra = {}) => ({ provider: 'codex', id: 'session', state, ...extra });
function harness() {
  const state = new TaskState(), queue = new NotificationQueue();
  return { state, queue, scan(rows, at, foreground = null) {
    state.update(rows, at); queue.observe([...state.sessions.values()], at, foreground); return queue.tick(at, foreground);
  } };
}
test('startup waiting is a baseline, new questions alert once, dismissing does not answer', () => {
  const h = harness();
  assert.equal(h.scan([row('waiting', { waitingIds: ['a'] })], 1000), null);
  assert.equal(h.scan([row('waiting', { waitingIds: ['a'] })], 2000), null);
  const notice = h.scan([row('waiting', { waitingIds: ['a', 'b'], notification: {title: '发布方案确认'} })], 3000);
  assert.equal(notice.title, '发布方案确认');
  assert.equal(notice.kind, 'waiting'); assert.equal(notice.duration, 8000);
  h.queue.dismiss(notice.key);
  assert.equal(h.state.snapshot()[1].state, 'waiting');
  assert.equal(h.scan([row('waiting', { waitingIds: ['a', 'b'] })], 4000), null);
  h.scan([row('running')], 5000);
  assert.equal(h.scan([row('waiting', { waitingIds: ['c'] })], 6000).kind, 'waiting');
});
test('partial replies withdraw only their notification; a resolved queued question never appears', () => {
  const h = harness(); h.scan([row('running')], 1000);
  h.scan([row('waiting', { waitingIds: ['a', 'b'] })], 2000);
  const next = h.scan([row('waiting', { waitingIds: ['b'] })], 2500);
  assert.ok(next.key.endsWith(':b')); assert.equal(h.state.snapshot()[1].state, 'waiting');
  assert.equal(h.scan([row('running')], 3000), null);
  assert.equal(h.queue.pending.length, 0);
});
test('waiting notifications have an independent switch, no replay, and foreground suppression', () => {
  const h = harness(); h.queue.setEnabled(false); h.scan([row('running')], 1000);
  assert.equal(h.scan([row('waiting')], 2000).kind, 'waiting');
  h.queue.setWaitingEnabled(false, [...h.state.sessions.values()], 2500);
  assert.equal(h.queue.current, null);
  h.queue.setWaitingEnabled(true, [...h.state.sessions.values()], 3000);
  assert.equal(h.scan([row('waiting')], 3500), null);
  h.scan([row('running')], 4000);
  assert.equal(h.scan([row('waiting')], 5000, 'codex'), null);
  assert.equal(h.scan([row('waiting')], 5500), null);
  h.scan([row('running')], 6000);
  assert.equal(h.scan([row('waiting')], 7000).kind, 'waiting');
});
test('assistance sorts ahead of pending completions, and completion preference does not clear it', () => {
  const h = harness(); h.scan([row('running'), row('running', { id: 'done' })], 1000);
  const notice = h.scan([row('waiting'), row('ended', { id: 'done' })], 2000);
  assert.equal(notice.kind, 'waiting'); assert.equal(h.queue.pending[0].kind, 'ended');
  h.queue.setEnabled(false, [...h.state.sessions.values()], 2100);
  assert.equal(h.queue.current.kind, 'waiting'); assert.equal(h.queue.pending.length, 0);
});
