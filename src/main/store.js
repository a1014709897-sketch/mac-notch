"use strict";
const fs = require("node:fs");
const path = require("node:path");
function createStore(directory, safeStorage) {
  const file = path.join(directory, "settings.json");
  let data = {
    startAtLogin: false,
    proxy: "",
    claudeCookie: null,
    providers: { claude: true, codex: true },
    setupComplete: false,
    idleQuota: false,
    notifications: true,
    menuBar: { claude: true, codex: true },
  };
  try {
    data = { ...data, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {}
  data.providers = {
    claude: data.providers?.claude !== false,
    codex: data.providers?.codex !== false,
  };
  data.menuBar = { claude: data.menuBar?.claude !== false, codex: data.menuBar?.codex !== false };
  function save(next) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  return {
    public: () => ({
      startAtLogin: data.startAtLogin,
      providers: { ...data.providers },
      idleQuota: data.idleQuota === true,
      notifications: data.notifications !== false,
      menuBar: { ...data.menuBar },
      setupComplete: data.setupComplete === true,
      proxy: data.proxy,
      hasClaudeCookie: Boolean(data.claudeCookie),
    }),
    cookie: () => {
      try {
        return data.claudeCookie
          ? safeStorage.decryptString(Buffer.from(data.claudeCookie, "base64"))
          : null;
      } catch {
        return null;
      }
    },
    update(value) {
      const next = { ...data, providers: { ...data.providers }, menuBar: { ...data.menuBar } };
      if (typeof value.notifications === "boolean") next.notifications = value.notifications;
      if (typeof value.idleQuota === "boolean") next.idleQuota = value.idleQuota;
      for (const provider of ["claude", "codex"])
        if (typeof value.menuBar?.[provider] === "boolean") next.menuBar[provider] = value.menuBar[provider];
      for (const provider of ["claude", "codex"])
        if (typeof value.providers?.[provider] === "boolean")
          next.providers[provider] = value.providers[provider];
      if (value.setupComplete === true) next.setupComplete = true;
      if (typeof value.startAtLogin === "boolean")
        next.startAtLogin = value.startAtLogin;
      if (typeof value.proxy === "string") {
        const p = value.proxy.trim();
        if (p) {
          const url = new URL(p);
          if (
            !["http:", "https:", "socks5:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw new Error(
              "代理仅支持无用户名密码的 HTTP / HTTPS / SOCKS5 地址",
            );
        }
        next.proxy = p;
      }
      if (typeof value.claudeCookie === "string" && value.claudeCookie.trim()) {
        if (!safeStorage.isEncryptionAvailable())
          throw new Error("系统安全存储不可用，未保存凭据");
        const cookie = value.claudeCookie.trim().replace(/^sessionKey=/, "");
        if (!/^sk-ant-[^\s;]+$/.test(cookie))
          throw new Error("sessionKey 格式不正确");
        next.claudeCookie = safeStorage
          .encryptString(cookie)
          .toString("base64");
      }
      if (value.clearCookie === true) next.claudeCookie = null;
      save(next);
      data = next;
      return this.public();
    },
  };
}
module.exports = { createStore };
