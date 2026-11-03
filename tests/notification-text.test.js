"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { notificationText } = require("../src/main/notification-text");
const { claudeNotification, codexNotification } = require("../src/main/notifications");
test("notification removes Markdown while preserving readable labels and code", () => {
  assert.equal(notificationText('## **修复完成**\n- [x] 已更新 `src/main.js`\n> 查看 [说明](https://example.com/a_(b))。'), '修复完成 已更新 src/main.js 查看 说明。');
  assert.equal(notificationText('~~旧方案~~，*新版*与 __说明__，`user_name` 和 plain_name。'), '旧方案，新版与 说明，user_name 和 plain_name。');
  assert.equal(notificationText('```js\nconst value = 1;\n```\n![预览](image.png)'), 'const value = 1; 预览');
  assert.equal(notificationText('[结果][ref]\n[ref]: https://example.com\n---'), '结果');
});
test("plain prose, operators and identifiers retain their meaning", () => {
  assert.equal(notificationText('3 * 4 = 12，a_b_c，C++，#123'), '3 * 4 = 12，a_b_c，C++，#123');
  assert.equal(notificationText('A &amp; B\n已完成'), 'A & B 已完成');
  assert.equal(notificationText(null), '');
  assert.equal(notificationText('😀'.repeat(500)).length, 800);
});
test("both providers convert their descriptions before the preview limit", () => {
  const markdown = '**完成**，查看 [说明](https://example.com)。';
  assert.equal(codexNotification('id', 'title', markdown).description, '完成，查看 说明。');
  assert.equal(claudeNotification({lastAssistantUuid:'a',postTurnSummaryFor:'a',postTurnSummary:{status_detail:markdown}}).description, '完成，查看 说明。');
});
