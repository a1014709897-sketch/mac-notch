"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { readQuota } = require("../src/main/quotas");
test("Codex reads subscription auth locally and sends it only to its usage endpoint", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "notch-auth-test-"));
  const old = process.env.CODEX_HOME;
  process.env.CODEX_HOME = dir;
  t.after(() => {
    if (old === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = old;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.writeFileSync(
    path.join(dir, "auth.json"),
    JSON.stringify({
      tokens: { access_token: "fixture-token", account_id: "fixture-account" },
    }),
  );
  let called = 0;
  const fetch = async (url, options) => {
    called++;
    assert.equal(url, "https://chatgpt.com/backend-api/wham/usage");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.authorization, "Bearer fixture-token");
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          rate_limit: { primary_window: { used_percent: 12 } },
        }),
    };
  };
  const q = await readQuota("codex", fetch);
  assert.equal(q.windows[0].remaining, 88);
  assert.equal(called, 1);
  assert.equal(q.access_token, undefined);
});
test("Claude website auth discovers organization; HTTP errors are surfaced without response body", async () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    return {
      ok: true,
      text: async () =>
        JSON.stringify(
          url.endsWith("/organizations")
            ? [{ uuid: "test-org", capabilities: ["chat"] }]
            : { five_hour: { utilization: 4 } },
        ),
    };
  };
  assert.equal(
    (await readQuota("claude", fetch, "sk-ant-fixture")).windows[0].remaining,
    96,
  );
  assert.equal(urls[1], "https://claude.ai/api/organizations/test-org/usage");
  await assert.rejects(
    readQuota(
      "claude",
      async () => ({ ok: false, status: 429 }),
      "sk-ant-fixture",
    ),
    /请求过多/,
  );
});

test("expired legacy Claude cookie falls back to CLI OAuth and expired OAuth gives CLI guidance", async (t) => {
  const old = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = "fixture-oauth";
  t.after(() => {
    if (old === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = old;
  });
  const targets = [];
  const q = await readQuota(
    "claude",
    async (url, options) => {
      targets.push(url);
      if (url.includes("claude.ai")) return { ok: false, status: 401 };
      assert.equal(options.headers.authorization, "Bearer fixture-oauth");
      return {
        ok: true,
        text: async () => JSON.stringify({ five_hour: { utilization: 12 } }),
      };
    },
    "sk-ant-expired",
  );
  assert.equal(q.windows[0].remaining, 88);
  assert.equal(targets.length, 2);
  await assert.rejects(
    readQuota("claude", async () => ({ ok: false, status: 401 })),
    /Claude Code CLI/,
  );
});
