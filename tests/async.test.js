"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  readCodexSessionState,
} = require("../src/vendor/token-monitor/src/shared/providers/codex/sessionContext");
test("asynchronous assistance tracks delivery and exact answers; new instructions supersede old questions", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mac-notch-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "rollout.jsonl"),
    cache = new Map();
  const append = (p) =>
    fs.appendFileSync(
      file,
      JSON.stringify({ type: "response_item", payload: p }) + "\n",
    );
  const read = () => readCodexSessionState(file, { cache });
  append({ type: "task_started" });
  append({
    type: "function_call",
    name: "request_user_input_async",
    call_id: "q",
    arguments: JSON.stringify({
      questions: [{ title: "one" }, { title: "two" }],
    }),
  });
  assert.equal(read().waitingForInput, false);
  append({
    type: "function_call_output",
    call_id: "q",
    output: '{"accepted":true}',
  });
  assert.equal(read().waitingForInput, true);
  append({ type: "task_complete" });
  assert.equal(read().waitingForInput, true);
  const reply = (index) => ({
    type: "message",
    role: "user",
    content: [
      {
        type: "input_text",
        text:
          "<send_user_message_question_reply>\n" +
          JSON.stringify([
            {
              questionItemId: JSON.stringify([
                "request_user_input_async",
                "q",
                index,
              ]),
              answer: "ok",
            },
          ]) +
          "\n</send_user_message_question_reply>",
      },
    ],
  });
  append(reply(0));
  assert.equal(read().waitingForInput, true);
  append(reply(1));
  assert.equal(read().waitingForInput, false);
  append({
    type: "function_call",
    name: "request_user_input_async",
    call_id: "old",
    arguments: '{"questions":[{}]}',
  });
  append({
    type: "function_call_output",
    call_id: "old",
    output: '{"accepted":true}',
  });
  assert.equal(read().waitingForInput, true);
  append({
    type: "message",
    role: "user",
    content: [
      {
        type: "input_text",
        text: "<external_codex_apps_open_page>{}</external_codex_apps_open_page>",
      },
    ],
  });
  assert.equal(read().waitingForInput, true);
  append({
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: "Use a new design instead." }],
  });
  assert.equal(read().waitingForInput, false);
  append({ type: "turn_aborted" });
  assert.equal(read().turnAborted, true);
  assert.equal(read().waitingForInput, false);
  append({ type: "task_started" });
  assert.equal(read().turnAborted, false);
});
