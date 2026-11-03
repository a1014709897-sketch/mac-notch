"use strict";
// Only numeric usage metadata leaves the worker. Message contents are discarded.
const crypto = require("node:crypto");
const { estimate } = require("./pricing");
const n = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
function dayKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function buckets(raw = {}, provider) {
  const read = n(raw.cache_read_input_tokens ?? raw.cached_input_tokens);
  const write = n(
    raw.cache_creation_input_tokens ?? raw.cache_write_input_tokens,
  );
  return {
    input:
      provider === "codex"
        ? Math.max(0, n(raw.input_tokens) - read - write)
        : n(raw.input_tokens),
    read,
    write,
    writeHour: Math.min(
      write,
      n(raw.cache_creation?.ephemeral_1h_input_tokens),
    ),
    output: n(raw.output_tokens), // Reasoning is already included in output.
  };
}
function parserState() {
  return {
    model: "unknown",
    previous: null,
    nativeStart: null,
    native: {},
    legacy: {},
  };
}
function consume(state, row, provider) {
  const p = row.payload || {},
    at = Date.parse(row.timestamp);
  if (row.type === "turn_context") state.model = p.model || "unknown";
  if (!Number.isFinite(at)) return;
  let raw,
    id,
    target = state.native,
    model = state.model;
  if (provider === "claude") {
    if (row.type !== "assistant" || !row.message?.usage || !row.message.id)
      return;
    raw = row.message.usage;
    model = row.message.model || "unknown";
    id = hash(`claude:${row.requestId || ""}:${row.message.id}`);
  } else if (row.type === "token_usage_record" && p.usage && p.response_id) {
    raw = p.usage;
    id = hash(`codex:${p.response_id}`);
    state.nativeStart = Math.min(state.nativeStart ?? at, at);
  } else if (
    row.type === "event_msg" &&
    p.type === "token_count" &&
    p.info?.total_token_usage
  ) {
    const total = p.info.total_token_usage,
      previous = state.previous;
    state.previous = total;
    if (previous && n(total.total_tokens) === n(previous.total_tokens)) return;
    // The first total may include a fork's inherited history. Count only this request.
    raw = p.info.last_token_usage;
    if (previous && n(total.total_tokens) > n(previous.total_tokens)) {
      raw = Object.fromEntries(
        Object.keys(total).map((k) => [
          k,
          Math.max(0, n(total[k]) - n(previous[k])),
        ]),
      );
    }
    if (!raw) return;
    target = state.legacy;
    id = hash(
      `codex-legacy:${row.timestamp}:${model}:${JSON.stringify(total)}`,
    );
  } else return;
  const usage = buckets(raw, provider);
  const tokens = usage.input + usage.read + usage.write + usage.output;
  if (!tokens) return;
  target[id] = { at, provider, tokens, ...estimate(model, usage), model };
}
function rowsFrom(state) {
  // New Codex versions emit both formats for the same requests. Prefer response IDs.
  return [
    ...Object.entries(state.native),
    ...Object.entries(state.legacy).filter(
      ([, row]) =>
        state.nativeStart === null || row.at < state.nativeStart - 1000,
    ),
  ];
}
function summarize(states, enabled = ["claude", "codex"], now = Date.now()) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return {
      date: dayKey(d),
      tokens: 0,
      cost: 0,
      unpricedTokens: 0,
      claude: 0,
      codex: 0,
    };
  });
  const lookup = new Map(days.map((d) => [d.date, d])),
    unique = new Map();
  for (const state of states)
    for (const [id, row] of rowsFrom(state)) {
      if (!enabled.includes(row.provider) || row.at > now) continue;
      const old = unique.get(id);
      if (
        !old ||
        row.tokens > old.tokens ||
        (row.tokens === old.tokens && row.at > old.at)
      )
        unique.set(id, row);
    }
  for (const row of unique.values()) {
    const day = lookup.get(dayKey(row.at));
    if (!day) continue;
    day.tokens += row.tokens;
    day[row.provider] += row.tokens;
    day.cost += row.cost;
    day.unpricedTokens += row.unpricedTokens;
  }
  return { days, today: days[6], updatedAt: now, loading: false };
}
module.exports = { dayKey, buckets, parserState, consume, rowsFrom, summarize };
