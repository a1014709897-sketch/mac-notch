"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  parserState,
  consume,
  summarize,
  buckets,
} = require("../src/main/usage");
const { estimate } = require("../src/main/pricing");
const now = new Date(2026, 10, 2, 12).getTime(),
  ts = new Date(now).toISOString();
const codex = (total, last = total) => ({
  timestamp: ts,
  type: "event_msg",
  payload: {
    type: "token_count",
    info: {
      total_token_usage: {
        input_tokens: total,
        cached_input_tokens: total / 2,
        output_tokens: 10,
        total_tokens: total + 10,
      },
      last_token_usage: {
        input_tokens: last,
        cached_input_tokens: last / 2,
        output_tokens: 10,
      },
    },
  },
});
test("Codex cumulative records are deltas; first inherited total and repeated counts do not inflate usage", () => {
  const s = parserState();
  consume(
    s,
    { type: "turn_context", payload: { model: "gpt-6-astra" } },
    "codex",
  );
  consume(s, codex(10000, 100), "codex");
  consume(s, codex(10000, 100), "codex");
  consume(s, codex(10200, 200), "codex");
  const u = summarize([s], ["codex"], now);
  assert.equal(u.today.tokens, 310);
  assert.equal(u.today.unpricedTokens, 0);
});
test("Codex native request IDs supersede mirrored counters and deduplicate forked logs", () => {
  const s = parserState();
  consume(s, codex(100), "codex");
  consume(
    s,
    {
      timestamp: ts,
      type: "token_usage_record",
      payload: {
        response_id: "r1",
        usage: {
          input_tokens: 100,
          cached_input_tokens: 70,
          output_tokens: 20,
          reasoning_output_tokens: 10,
        },
      },
    },
    "codex",
  );
  assert.equal(summarize([s, s], ["codex"], now).today.tokens, 120);
  assert.equal(summarize([s], ["claude"], now).today.tokens, 0);
});
test("Claude assistant fragments share an ID; cache creation/read and reasoning are counted once", () => {
  const s = parserState();
  const r = {
    timestamp: ts,
    type: "assistant",
    message: {
      id: "m1",
      model: "claude-opus-5-5",
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 20,
        output_tokens: 5,
      },
    },
  };
  consume(s, r, "claude");
  r.message.usage.output_tokens = 15;
  consume(s, r, "claude");
  const u = summarize([s, s], ["claude"], now);
  assert.equal(u.today.tokens, 75);
  assert.ok(Math.abs(u.today.cost - 0.000446) < 1e-12);
});
test("Seven local calendar days include empty days, exclude future and older events", () => {
  const s = parserState();
  const add = (offset, id) =>
    consume(
      s,
      {
        timestamp: new Date(now + offset).toISOString(),
        type: "assistant",
        message: { id, usage: { input_tokens: 1 } },
      },
      "claude",
    );
  add(0, "today");
  add(-7 * 864e5, "old");
  add(1000, "future");
  const u = summarize([s], ["claude"], now);
  assert.equal(u.days.length, 7);
  assert.equal(
    u.days.reduce((n, d) => n + d.tokens, 0),
    1,
  );
  assert.equal(u.today.date, "2026-11-02");
});
test("Unknown prices are unpriced, not zero-cost; 1h Claude cache uses its own rate", () => {
  const u = buckets(
    {
      input_tokens: 10,
      cache_creation_input_tokens: 100,
      cache_creation: { ephemeral_1h_input_tokens: 100 },
      output_tokens: 5,
    },
    "claude",
  );
  assert.equal(estimate("not-a-known-model", u).unpricedTokens, 115);
  assert.ok(Math.abs(estimate("claude-opus-5-5", u).cost - 0.00094) < 1e-12);
});

test("a later Claude fragment in another file supersedes the copied partial usage", () => {
  const a = parserState(),
    b = parserState();
  const row = (output) => ({
    timestamp: ts,
    type: "assistant",
    message: {
      id: "shared",
      usage: { input_tokens: 100, output_tokens: output },
    },
  });
  consume(a, row(1), "claude");
  consume(b, row(50), "claude");
  assert.equal(summarize([a, b], ["claude"], now).today.tokens, 150);
});

test('calendar periods include a cross-month Monday week, hourly day and no future usage', () => {
  const s=parserState(); const now=new Date(2026,4,1,12).getTime();
  for(const [date,id] of [[new Date(2026,3,26,12),'previous-week'],[new Date(2026,3,27,12),'monday'],[new Date(2026,3,30,12),'previous-month'],[new Date(2026,4,1,10),'today'],[new Date(2026,4,1,13),'future']]) {
    consume(s,{timestamp:date.toISOString(),type:'assistant',message:{id,usage:{input_tokens:10}}},'claude');
  }
  const u=summarize([s],['claude'],now);
  assert.equal(u.periods.day.bins.length,24);
  assert.equal(u.periods.day.total.tokens,10);
  assert.equal(u.periods.day.bins[10].tokens,10);
  assert.equal(u.periods.week.total.tokens,30);
  assert.equal(u.periods.week.bins[0].date,'2026-04-27');
  assert.equal(u.periods.month.total.tokens,10);
  assert.equal(u.periods.month.bins.length,1);
  assert.equal(summarize([s],['codex'],now).periods.week.total.tokens,0);
});
