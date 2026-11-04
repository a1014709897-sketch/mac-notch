"use strict";
const { createWorkbuddyLocalAuth } = require("../vendor/token-monitor/src/electron/providers/workbuddy/localAuth");
const { fetchWorkbuddyLimits } = require("../vendor/token-monitor/src/shared/providers/workbuddy/limits");
let managedAccounts;
function setWorkbuddyAccounts(service) { managedAccounts = service; }
function projectWorkbuddyQuota(result, now = Date.now()) {
  const rows = Array.isArray(result) ? result : [result];
  const windows = rows.flatMap(row => (row.windows || []).filter(w => !w.additional && (!w.metric || w.metric === "percent" || w.metric === "credits"))
    .flatMap(w => {
      const remaining = Number.isFinite(w.remainingPercent) ? w.remainingPercent : Number.isFinite(w.usedPercent) ? 100 - w.usedPercent : null;
      return remaining === null ? [] : [{ label: w.label || "订阅额度", remaining: Math.max(0, Math.min(100, remaining)), resetAt: w.resetAt || null }];
    }));
  if (!windows.length) {
    if (rows.some(row => row.actionRequired === "appSessionEncrypted"))
      throw new Error("WorkBuddy 本机登录已加密，请在设置中完成网页授权");
    if (rows.some(row => row.status === "unauthorized")) throw new Error("WorkBuddy 登录已失效，请在设置中重新登录");
    if (rows.some(row => row.status === "notConfigured")) throw new Error("未找到可用的 WorkBuddy 登录，请在设置中完成网页授权");
    throw new Error("暂未获取 WorkBuddy 订阅额度，请稍后刷新");
  }
  const stale = rows.some(row => row.status !== "ok");
  return { provider: "workbuddy", windows, updatedAt: now, stale, error: stale ? "部分账号额度暂不可用" : null };
}
async function readWorkbuddyQuota(fetch) {
  const auth = createWorkbuddyLocalAuth({ fetch, env: {} });
  const result = await fetchWorkbuddyLimits({ workbuddyDesktopSessionEnabled: true,
    workbuddyDesktopSessionSupported: process.platform === "darwin", workbuddyLocalSessions: auth.getSessionInfos(),
    workbuddyLocalSessionsComplete: true, workbuddyManagedAccounts: managedAccounts?.accounts() || [] }, { env: {}, fetch, workbuddyFetch: auth.request, resolveWorkbuddyManagedCredential: managedAccounts?.resolveCredential });
  return projectWorkbuddyQuota(result);
}
module.exports = { readWorkbuddyQuota, projectWorkbuddyQuota, setWorkbuddyAccounts };
