"use strict";
// Standard API USD / million tokens, checked 2026-11-02. This is not a subscription bill.
// https://developers.openai.com/api/docs/pricing
// https://platform.claude.com/docs/en/about-claude/pricing
const rates = {
  "gpt-6-astra": [10, 1, 12.5, 25, 50],
  "gpt-6.1-sol": [2, 0.1, 2.5, 5, 10],
  "gpt-6.1-terra": [1, 0.05, 1.25, 2.5, 5],
  "gpt-6-luna": [0.1, 0.01, 0.125, 0.25, 0.5],
  "gpt-5.6-sol": [4, 0.4, 5, 10, 20],
  "gpt-5.3-codex": [1.75, 0.175, null, null, 14],
  "claude-opus-5-5": [4, 0.2, 5, 8, 20],
  "claude-sonnet-5-5": [2, 0.1, 2.5, 4, 10],
  "claude-opus-5": [5, 0.5, 6.25, 10, 25],
  "claude-opus-4-8": [5, 0.5, 6.25, 10, 25],
  "claude-opus-4-7": [5, 0.5, 6.25, 10, 25],
  "claude-opus-4-6": [5, 0.5, 6.25, 10, 25],
  "claude-opus-4-5": [5, 0.5, 6.25, 10, 25],
  "claude-opus-4-1": [15, 1.5, 18.75, 30, 75],
  "claude-opus-4": [15, 1.5, 18.75, 30, 75],
  "claude-sonnet-5": [2, 0.2, 2.5, 4, 10],
  "claude-sonnet-4-6": [3, 0.3, 3.75, 6, 15],
  "claude-sonnet-4-5": [3, 0.3, 3.75, 6, 15],
  "claude-sonnet-4": [3, 0.3, 3.75, 6, 15],
  "claude-haiku-4-5": [1, 0.1, 1.25, 2, 5],
};
function estimate(model, u) {
  const key = String(model)
    .toLowerCase()
    .replace(/-\d{8}$/, "");
  const rate = rates[key],
    counts = [u.input, u.read, u.write - u.writeHour, u.writeHour, u.output];
  let cost = 0,
    unpricedTokens = 0;
  counts.forEach((tokens, i) => {
    if (Number.isFinite(rate?.[i])) cost += (tokens * rate[i]) / 1e6;
    else unpricedTokens += tokens;
  });
  return { cost, unpricedTokens };
}
module.exports = { estimate };
