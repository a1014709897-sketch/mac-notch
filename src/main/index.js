"use strict";
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  screen,
  safeStorage,
  session,
  powerMonitor,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { TaskState, PROVIDERS } = require("./state");
const { readActivity } = require("./activity");
const { readQuota, remaining } = require("./quotas");
const { layout, expandedLayout } = require("./layout");
const { Worker } = require("node:worker_threads");
const { summarize } = require("./usage");
const { createStore } = require("./store");
const {
  readMacNotchScreens,
} = require("../vendor/token-monitor/src/electron/notch/screen");
const {
  frontmostTool,
} = require("../vendor/token-monitor/src/electron/notch/taskAttention");
const {
  createTaskReadState,
} = require("../vendor/token-monitor/src/electron/notch/taskReadState");
const demo = process.argv.includes("--demo");
const smoke = process.argv.includes("--smoke");
const isolated = demo || smoke || process.argv.includes("--preview");
app.setName("Mac Notch");
// Preview and smoke never touch a real profile or contend with its instance lock.
if (isolated)
  app.setPath(
    "userData",
    fs.mkdtempSync(
      path.join(require("node:os").tmpdir(), "mac-notch-preview-"),
    ),
  );
if (process.platform !== "darwin") {
  console.error("Mac Notch v0.1 supports macOS only.");
  app.exit(1);
}
if (!app.requestSingleInstanceLock()) app.exit(0);
let notch,
  panel,
  store,
  transport,
  geometry,
  locked = false,
  busy = false,
  quotalock = false,
  lastRender = "",
  attentionTimer,
  scanTimer,
  quotaTimer,
  usageWorker,
  fallbackTray,
  expanded = false,
  currentDisplay;
let usage = { ...summarize([]), loading: true };
const enabled = () => PROVIDERS.filter((p) => store.public().providers[p]);
const state = new TaskState(),
  readState = createTaskReadState(),
  trays = new Map();
let quotas = {
  claude: { provider: "claude", windows: [], error: "尚未刷新" },
  codex: { provider: "codex", windows: [], error: "尚未刷新" },
};
const bundles = {
  claude: "com.anthropic.claudefordesktop",
  codex: "com.openai.codex",
};
const file = (name) => path.join(__dirname, "../renderer", name);
function payload() {
  return {
    tasks: state.snapshot().filter((t) => enabled().includes(t.provider)),
    quotas,
    settings: store.public(),
    geometry,
    expanded,
    usage,
    version: app.getVersion(),
    demo,
  };
}
function render() {
  if (!notch || notch.isDestroyed()) return;
  const data = payload(),
    encoded = JSON.stringify(data);
  if (encoded !== lastRender) {
    lastRender = encoded;
    notch.webContents.send("state", data);
    if (panel && !panel.isDestroyed()) panel.webContents.send("state", data);
  }
}
function position() {
  const native = readMacNotchScreens({ refresh: true });
  const displays = screen.getAllDisplays();
  const notched = native.screens?.find(
    (s) =>
      s.safeTop > 0 &&
      displays.some((d) => d.internal && String(d.id) === String(s.displayId)),
  );
  const display =
    displays.find(
      (d) =>
        String(d.id) === String(notched?.displayId || native.mainDisplayId),
    ) || screen.getPrimaryDisplay();
  currentDisplay = display;
  geometry = layout(
    display,
    native.screens?.find((s) => String(s.displayId) === String(display.id)),
  );
  applyBounds();
  lastRender = "";
  render();
}
function applyBounds() {
  if (!geometry) return;
  const bounds = expanded ? expandedLayout(currentDisplay, geometry) : geometry;
  notch.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
}
function togglePanel() {
  setExpanded(!expanded);
}
function setExpanded(value) {
  expanded = value;
  notch.setFocusable(expanded);
  applyBounds();
  render();
  if (expanded) {
    notch.show();
    notch.focus();
  } else if (!enabled().length) notch.hide();
}
function showSettings() {
  setExpanded(false);
  panel.center();
  panel.show();
  panel.focus();
  panel.webContents.send("state", payload());
}
function openTool(provider) {
  if (!bundles[provider]) return;
  execFile("/usr/bin/open", ["-b", bundles[provider]], (error) => {
    if (error) {
      showSettings();
      panel.webContents.send(
        "notice",
        `未能打开 ${provider}，请先安装官方客户端`,
      );
      return;
    }
    // Activation alone cannot tell which completed conversation was viewed.
    render();
  });
}
function menu(provider) {
  return Menu.buildFromTemplate([
    {
      label: `打开 ${provider === "claude" ? "Claude" : "Codex"}`,
      click: () => openTool(provider),
    },
    { label: "用量与额度", click: togglePanel },
    { label: "设置工具", click: showSettings },
    { label: "刷新额度", click: () => refreshQuotas() },
    { type: "separator" },
    { label: "退出 Mac Notch", click: () => app.quit() },
  ]);
}
function syncProviders() {
  for (const tray of trays.values()) tray.destroy();
  trays.clear();
  fallbackTray?.destroy();
  fallbackTray = null;
  for (const provider of [...enabled()].reverse()) {
    const image = nativeImage
      .createFromPath(path.join(__dirname, "../../assets", `${provider}.png`))
      .resize({ width: 20, height: 20 });
    image.setTemplateImage(false);
    const tray = new Tray(image);
    trays.set(provider, tray);
    tray.on("click", togglePanel);
    tray.on("right-click", () => tray.popUpContextMenu(menu(provider)));
    updateTray(provider);
  }
  for (const [key, row] of state.sessions)
    if (!enabled().includes(row.provider)) state.sessions.delete(key);
  if (!enabled().length) {
    const image = nativeImage
      .createFromPath(path.join(__dirname, "../../assets/codex.png"))
      .resize({ width: 18, height: 18 });
    image.setTemplateImage(true);
    fallbackTray = new Tray(image);
    fallbackTray.setToolTip("Mac Notch · 工具已关闭，点此设置");
    fallbackTray.on("click", showSettings);
    fallbackTray.on("right-click", () =>
      fallbackTray.popUpContextMenu(
        Menu.buildFromTemplate([
          { label: "设置工具", click: showSettings },
          { label: "退出 Mac Notch", click: () => app.quit() },
        ]),
      ),
    );
    setExpanded(false);
    notch.hide();
  } else if (!locked) notch.showInactive();
  usageWorker?.postMessage({ enabled: enabled() });
  // Do not display the previous provider's totals while the worker refilters.
  usage = { ...summarize([]), loading: !(demo || smoke) };
  if (demo || smoke) {
    usage.days.forEach((d, i) => {
      d.claude = enabled().includes("claude") ? (i + 1) * 234567 : 0;
      d.codex = enabled().includes("codex") ? (7 - i) * 456789 : 0;
      d.tokens = d.claude + d.codex;
      d.cost = (d.tokens * 1.3) / 1e6;
    });
    usage.today = usage.days[6];
  }
}
function updateTray(provider) {
  const tray = trays.get(provider),
    q = quotas[provider],
    value = remaining(q);
  if (!tray) return;
  tray.setTitle(value === null ? "—" : `${value}%`, {
    fontType: "monospacedDigit",
  });
  tray.setToolTip(
    `${provider === "claude" ? "Claude" : "Codex"} · ${q.error || "剩余额度（最紧张窗口）"}${q.stale ? " · 缓存值" : ""}`,
  );
}
async function refreshQuotas() {
  if (quotalock) return;
  quotalock = true;
  try {
    await Promise.all(
      enabled().map(async (provider) => {
        if (demo || smoke)
          quotas[provider] = {
            provider,
            windows: [
              {
                label: "会话",
                remaining: provider === "claude" ? 97 : 84,
                resetAt: new Date(Date.now() + 3600000).toISOString(),
              },
            ],
            updatedAt: Date.now(),
          };
        else if (Date.now() < (quotas[provider].retryAfter || 0)) return;
        else
          try {
            quotas[provider] = await readQuota(
              provider,
              transport.fetch.bind(transport),
              store.cookie(),
            );
          } catch (e) {
            quotas[provider] = {
              ...quotas[provider],
              error: e.message.startsWith("net::")
                ? "网络连接失败，请检查代理"
                : e.message,
              stale: quotas[provider].windows.length > 0,
              retryAfter: Date.now() + (e.status === 429 ? 300000 : 120000),
            };
          }
        updateTray(provider);
      }),
    );
    render();
  } finally {
    quotalock = false;
  }
}
async function scan() {
  if (busy || locked) return;
  busy = true;
  try {
    if (!demo && !smoke)
      state.update(
        (await readActivity(Date.now(), enabled())).filter((r) =>
          enabled().includes(r.provider),
        ),
      );
    render();
  } catch {
    /* Keep bounded previous observations; never log transcript data. */ state.update(
      [],
    );
  } finally {
    busy = false;
  }
}
function own(event) {
  return [notch, panel].some(
    (w) => w && !w.isDestroyed() && w.webContents === event.sender,
  );
}
function protect(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}
app.whenReady().then(async () => {
  app.dock.hide();
  store = createStore(app.getPath("userData"), safeStorage);
  transport = session.fromPartition("mac-notch-network");
  await transport.setProxy(
    store.public().proxy
      ? {
          proxyRules: store.public().proxy,
          proxyBypassRules: "<local>;localhost;127.0.0.1",
        }
      : { mode: "system" },
  );
  const webPreferences = {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
  notch = new BrowserWindow({
    width: 320,
    height: 32,
    show: false,
    frame: false,
    type: "panel",
    enableLargerThanScreen: true,
    roundedCorners: false,
    acceptFirstMouse: true,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences,
  });
  notch.setAlwaysOnTop(true, "screen-saver");
  notch.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  protect(notch);
  panel = new BrowserWindow({
    width: 400,
    height: 560,
    show: false,
    titleBarStyle: "hiddenInset",
    title: "Mac Notch · 设置",
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: "#141719",
    webPreferences,
  });
  protect(panel);
  notch.on("blur", () => {
    if (expanded && !smoke) setExpanded(false);
  });
  notch.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      setExpanded(false);
    }
  });
  panel.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      panel.hide();
    }
  });
  ipcMain.handle("state:get", (event) => (own(event) ? payload() : null));
  ipcMain.on("tool:open", (event, provider) => {
    if (own(event)) openTool(provider);
  });
  ipcMain.on("panel:toggle", (event) => {
    if (own(event)) togglePanel();
  });
  ipcMain.on("settings:open", (event) => {
    if (own(event)) showSettings();
  });
  ipcMain.on("settings:close", (event) => {
    if (own(event)) panel.hide();
  });
  ipcMain.on("panel:close", (event) => {
    if (own(event)) setExpanded(false);
  });
  ipcMain.on("quota:refresh", (event) => {
    if (own(event)) {
      for (const q of Object.values(quotas)) q.retryAfter = 0;
      refreshQuotas();
      usageWorker?.postMessage({ enabled: enabled() });
    }
  });
  ipcMain.on("app:quit", (event) => {
    if (own(event)) app.quit();
  });
  ipcMain.handle("settings:save", async (event, value) => {
    if (!own(event)) return { ok: false };
    try {
      // Renderer may change only user-facing preferences. Legacy encrypted credentials
      // and proxy settings remain compatible, but are no longer editable here.
      const result = store.update({
        providers: value?.providers,
        startAtLogin: value?.startAtLogin,
        setupComplete: value?.setupComplete,
      });
      await transport.setProxy(
        result.proxy
          ? {
              proxyRules: result.proxy,
              proxyBypassRules: "<local>;localhost;127.0.0.1",
            }
          : { mode: "system" },
      );
      if (app.isPackaged && !isolated)
        app.setLoginItemSettings({ openAtLogin: result.startAtLogin });
      for (const q of Object.values(quotas)) q.retryAfter = 0;
      syncProviders();
      lastRender = "";
      render();
      refreshQuotas();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.on("demo:set", (event, value) => {
    if (
      !own(event) ||
      !demo ||
      !["idle", "running", "waiting", "ended"].includes(value)
    )
      return;
    if (value === "idle") {
      state.sessions.clear();
    } else state.update([{ provider: "codex", id: "demo", state: "running" }]);
    if (value !== "idle")
      state.update([{ provider: "codex", id: "demo", state: value }]);
    render();
  });
  await Promise.all([
    notch.loadFile(file("notch.html")),
    panel.loadFile(file("panel.html")),
  ]);
  position();
  syncProviders();
  if (!demo && !smoke) {
    usageWorker = new Worker(path.join(__dirname, "usage-worker.js"), {
      workerData: { enabled: enabled() },
    });
    usageWorker.on("message", (value) => {
      usage = { ...usage, ...value };
      render();
    });
    usageWorker.on("error", () => {
      usage = {
        ...usage,
        loading: false,
        error: "本机用量读取失败，请重新打开 Mac Notch",
      };
      render();
    });
    if (!store.public().setupComplete) showSettings();
  } else {
    usage = { ...summarize([]), loading: false };
    usage.days.forEach((d, i) => {
      d.claude = (i + 1) * 234567;
      d.codex = (7 - i) * 456789;
      d.tokens = d.claude + d.codex;
      d.cost = (d.tokens * 1.3) / 1e6;
    });
    usage.today = usage.days[6];
    render();
  }
  await scan();
  refreshQuotas();
  screen.on("display-metrics-changed", position);
  screen.on("display-added", position);
  screen.on("display-removed", position);
  powerMonitor.on("lock-screen", () => {
    locked = true;
    notch.hide();
    panel.hide();
  });
  powerMonitor.on("unlock-screen", () => {
    locked = false;
    position();
    if (enabled().length) notch.showInactive();
    scan();
  });
  scanTimer = setInterval(scan, 2000);
  quotaTimer = setInterval(refreshQuotas, 120000);
  attentionTimer = setInterval(() => {
    if (locked || demo || smoke) return;
    for (const task of readState(state.completed(), frontmostTool()))
      state.acknowledge(task.provider, task.id);
    render();
  }, 1000);
  if (smoke)
    setTimeout(
      () =>
        require("./smoke")({
          notch,
          panel,
          trays,
          geometry,
          payload,
          togglePanel,
          store,
          syncProviders,
          app,
        }),
      1000,
    );
});
app.on("before-quit", () => {
  app.isQuitting = true;
  clearInterval(scanTimer);
  clearInterval(quotaTimer);
  clearInterval(attentionTimer);
  usageWorker?.terminate();
});
app.on("window-all-closed", () => {});
app.on("second-instance", () => {
  if (panel) showSettings();
});
