"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const exec = promisify(execFile);
function percent(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, 100 - value))
    : null;
}
function claudeWindows(data) {
  return [
    ["five_hour", "5 小时"],
    ["seven_day", "每周"],
    ["seven_day_sonnet", "Sonnet 每周"],
  ].flatMap(([key, label]) =>
    data[key] && percent(data[key].utilization) !== null
      ? [
          {
            label,
            remaining: percent(data[key].utilization),
            resetAt: data[key].resets_at || null,
          },
        ]
      : [],
  );
}
function codexWindows(data) {
  const limit = data.rate_limit || data.rateLimit || {};
  return [
    ["primary_window", "会话"],
    ["secondary_window", "每周"],
  ].flatMap(([key, label]) => {
    const w = limit[key];
    return w && percent(w.used_percent) !== null
      ? [
          {
            label,
            remaining: percent(w.used_percent),
            resetAt: w.reset_at
              ? new Date(w.reset_at * 1000).toISOString()
              : null,
          },
        ]
      : [];
  });
}
function remaining(quota) {
  return quota?.windows?.length
    ? Math.round(Math.min(...quota.windows.map((w) => w.remaining)))
    : null;
}
async function request(fetch, url, headers) {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const e = new Error(
      response.status === 401 || response.status === 403
        ? "登录已失效，请在对应客户端重新登录"
        : response.status === 429
          ? "请求过多，稍后重试"
          : `额度请求失败（${response.status}）`,
    );
    e.status = response.status;
    throw e;
  }
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) throw new Error("额度响应过大");
  return JSON.parse(text);
}
async function readClaudeToken() {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN)
    return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  try {
    const d = JSON.parse(
      fs.readFileSync(
        path.join(
          process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"),
          ".credentials.json",
        ),
        "utf8",
      ),
    );
    if (d.claudeAiOauth?.accessToken) return d.claudeAiOauth.accessToken;
  } catch {}
  try {
    const { stdout } = await exec(
      "/usr/bin/security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { timeout: 10000, maxBuffer: 262144 },
    );
    return JSON.parse(stdout).claudeAiOauth?.accessToken;
  } catch {
    return null;
  }
}
async function readQuota(provider, fetch, cookie) {
  let data, windows;
  if (provider === "codex") {
    let auth;
    try {
      auth = JSON.parse(
        fs.readFileSync(
          path.join(
            process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
            "auth.json",
          ),
          "utf8",
        ),
      );
    } catch {
      throw new Error("未找到 Codex 登录，请先登录官方客户端");
    }
    const token = auth.tokens?.access_token;
    if (!token) throw new Error("需要 Codex 订阅登录；API Key 不提供此额度");
    const headers = { authorization: `Bearer ${token}` };
    if (auth.tokens.account_id)
      headers["ChatGPT-Account-Id"] = auth.tokens.account_id;
    data = await request(
      fetch,
      "https://chatgpt.com/backend-api/wham/usage",
      headers,
    );
    windows = codexWindows(data);
  } else if (cookie) {
    const headers = { cookie: `sessionKey=${cookie}` };
    const orgs = await request(
      fetch,
      "https://claude.ai/api/organizations",
      headers,
    );
    const org = Array.isArray(orgs)
      ? orgs.find((o) => o.capabilities?.includes("chat")) || orgs[0]
      : null;
    if (!org?.uuid) throw new Error("未找到 Claude 订阅组织");
    data = await request(
      fetch,
      `https://claude.ai/api/organizations/${encodeURIComponent(org.uuid)}/usage`,
      headers,
    );
    windows = claudeWindows(data);
  } else {
    const token = await readClaudeToken();
    if (!token)
      throw new Error(
        "未找到 Claude Code 登录；可在设置中填写 Claude 网页 sessionKey",
      );
    data = await request(fetch, "https://api.anthropic.com/api/oauth/usage", {
      authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    });
    windows = claudeWindows(data);
  }
  if (!windows.length) throw new Error("服务返回了未识别的额度格式");
  return { provider, windows, updatedAt: Date.now(), error: null };
}
module.exports = { readQuota, remaining, claudeWindows, codexWindows };
