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
  shell,
  dialog,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createToolLauncher } = require("./tool-launcher");
const launchTool = createToolLauncher({
  showMessageBox: (options) => dialog.showMessageBox(options),
});
const { TaskState, PROVIDERS } = require("./state");
const { readActivity } = require("./activity");
const { readQuota, remaining } = require("./quotas");
const { NotificationQueue, sessionURL } = require("./notifications");
const notifications = new NotificationQueue();
const { createUpdater } = require("./updates");
let updater;
const { contentLayout, contentKey, layout, expandedLayout, notificationLayout } = require("./layout");
const { Worker } = require("node:worker_threads");
const { summarize } = require("./usage");
const { createStore } = require("./store");
const {
  readMacNotchScreens,
} = require("../vendor/token-monitor/src/electron/notch/screen");
const {
  frontmostTool,
  createVisitAttention,
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
  baseGeometry,
  geometry,
  locked = false,
  busy = false,
  quotalock = false,
  lastRender = "",
  attentionTimer,
  notificationTimer,
  scanTimer,
  quotaTimer,
  usageWorker,
  fallbackTray,
  expanded = false,
  currentDisplay;
let usage = { ...summarize([]), loading: true };
let compactFrame = null, ignoringPointer = null;
let boundsMode = "compact", collapseSequence = 0, collapseMotion = null, collapseTimeout;
const { compactHostBounds, containsPoint } = require("./layout");
const enabled = () => PROVIDERS.filter((p) => store.public().providers[p]);
const state = new TaskState(),
  readState = createTaskReadState(),
  visitAttention = createVisitAttention(),
  trays = new Map();
let quotas = {
  claude: { provider: "claude", windows: [], error: "尚未刷新" },
  codex: { provider: "codex", windows: [], error: "尚未刷新" },
};
const file = (name) => path.join(__dirname, "../renderer", name);
function payload() {
  return {
    tasks: state.snapshot().filter((t) => enabled().includes(t.provider)),
    quotas,
    remainingQuota: Object.fromEntries(PROVIDERS.map(p => [p, remaining(quotas[p])])),
    settings: store.public(),
    geometry,
    frame: notch && !notch.isDestroyed() ? notch.getBounds() : null,
    collapse: collapseMotion,
    expanded,
    notification: expanded || locked ? null : notifications.current,
    usage,
    update: updater?.snapshot(),
    version: app.getVersion(),
    demo,
  };
}
function syncPointerRegion() {
  if (!geometry || !notch || notch.isDestroyed() || app.isQuitting) return;
  const interactive = expanded ? expandedLayout(currentDisplay, geometry)
    : notifications.current && !locked ? notificationLayout(currentDisplay, geometry) : geometry;
  const ignore = locked || !enabled().length || !containsPoint(interactive, screen.getCursorScreenPoint());
  if (ignore !== ignoringPointer) {
    ignoringPointer = ignore;
    notch.setIgnoreMouseEvents(ignore, {forward: true});
  }
}
function render() {
  if (!notch || notch.isDestroyed()) return;
  syncPointerRegion();
  const data = payload(),
    encoded = JSON.stringify(data);
  if (encoded !== lastRender) {
    lastRender = encoded;
    notch.webContents.send("state", data);
    if (panel && !panel.isDestroyed()) panel.webContents.send("state", data);
  }
}
function position() {
  compactFrame = null;
  cancelCollapse();
  boundsMode = "compact";
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
  baseGeometry = layout(
    display,
    native.screens?.find((s) => String(s.displayId) === String(display.id)),
  );
  geometry = geometry?.left !== undefined ? contentLayout(baseGeometry, geometry) : baseGeometry;
  applyBounds();
  lastRender = "";
  render();
}
function cancelCollapse() {
  clearTimeout(collapseTimeout);
  collapseMotion = null;
}
function finishCollapse(id) {
  if (collapseMotion?.id !== id || !notch || notch.isDestroyed()) return;
  compactFrame = notch.getBounds();
  cancelCollapse();
  applyBounds();
  render();
}
function applyBounds() {
  if (!geometry || !notch || notch.isDestroyed() || app.isQuitting) return;
  const mode = expanded ? "expanded" : notifications.current && !locked ? "notification" : "compact";
  if (mode !== "compact") compactFrame = null;
  const bounds = mode === "expanded" ? expandedLayout(currentDisplay, geometry)
    : mode === "notification" ? notificationLayout(currentDisplay, geometry) : compactHostBounds(compactFrame, geometry);
  if (mode === "compact" && compactFrame) compactFrame = bounds;
  const current = notch.getBounds();
  // Keep one native canvas through the fold and after completion. Moving or
  // resizing it at the final frame races Chromium paint with AppKit placement.
  const canFold = mode === "compact" && !locked && enabled().length &&
    current.y === bounds.y && current.height > bounds.height;
  if (collapseMotion && !canFold) cancelCollapse();
  if (!collapseMotion && ["notification", "expanded"].includes(boundsMode) && canFold) {
    collapseMotion = { id: ++collapseSequence, from: current, fromMode: boundsMode };
    const id = collapseMotion.id;
    collapseTimeout = setTimeout(() => finishCollapse(id), 600);
  }
  boundsMode = mode;
  if (collapseMotion) {
    // The next task state can be wider than the card (e.g. both idle quotas).
    // Retain enough transparent host space for both outlines during the fold.
    const left = Math.min(current.x, bounds.x);
    const right = Math.max(current.x + current.width, bounds.x + bounds.width);
    if (left !== current.x || right - left !== current.width)
      notch.setBounds({ x: left, y: current.y, width: right - left, height: current.height });
    return;
  }
  if (["x", "y", "width", "height"].every(key => current[key] === bounds[key])) return;
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
  if (!notch || notch.isDestroyed() || app.isQuitting) return;
  expanded = value;
  notifications.pause("dashboard", value);
  if (value) { notifications.pause("hover", false); notifications.pause("focus", false); }
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
let lastNotification = "";
function notificationForeground() {
  return demo || smoke ? null : frontmostTool();
}
function syncNotification(foreground) {
  // Read current focus at the presentation boundary, before resizing the notch.
  if ((notifications.current || notifications.pending.length) &&
      (!(demo || smoke) || foreground === undefined))
    foreground = notificationForeground();
  notifications.tick(Date.now(), foreground);
  const key = JSON.stringify([notifications.current, expanded, locked]);
  if (key === lastNotification) return;
  lastNotification = key;
  applyBounds();
  render();
}
function acknowledgeVisits(foreground, now = Date.now()) {
  const completed = state.completed();
  for (const task of [...readState(completed, foreground), ...visitAttention(completed, foreground, now)])
    state.acknowledge(task.provider, task.id);
  notifications.observe([...state.sessions.values()], now, foreground);
  syncNotification(foreground);
  render();
}
async function openNotification(key) {
  const item = notifications.current;
  if (!item || item.key !== key) return;
  if (item.preview) { notifications.dismiss(key); syncNotification(); return; }
  const url = sessionURL(item.desktopId, item.provider);
  // Smoke exercises the actual IPC without navigating the user's real Claude app.
  if (smoke) {
    notch.webContents.send("notification:opened", { key, url });
    notifications.dismiss(key); applyBounds(); render(); return;
  }
  if (!url) {
    if (await openTool(item.provider)) {
      notifications.dismiss(key); applyBounds(); render();
    }
    return;
  }
  if (await launchTool(item.provider, url)) {
    // A successful open request is not proof that this particular task was read.
    notifications.dismiss(key); applyBounds(); render();
  }
}
async function openTool(provider) {
  const completedAtClick = state.completed();
  if (await launchTool(provider)) {
    // Wait for foreground confirmation; match only the selected Claude session.
    readState.didActivate(provider, completedAtClick);
    render();
    return true;
  }
  return false;
}
function menu(provider) {
  return Menu.buildFromTemplate([
    {
      label: `打开 ${provider === "claude" ? "Claude" : "Codex"}`,
      click: () => openTool(provider),
    },
    { label: "用量与额度", click: togglePanel },
    { label: "刷新额度", click: () => refreshQuotas() },
    { type: "separator" },
    { label: "退出 Mac Notch", click: () => app.quit() },
  ]);
}
function syncProviders({ refilterUsage = true } = {}) {
  for (const tray of trays.values()) tray.destroy();
  trays.clear();
  fallbackTray?.destroy();
  fallbackTray = null;
  for (const provider of [...enabled()].reverse().filter(p => store.public().menuBar[p])) {
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
  notifications.retain(enabled());
  applyBounds();
  for (const [key, row] of state.sessions)
    if (!enabled().includes(row.provider)) state.sessions.delete(key);
  if (!enabled().length) {
    const image = nativeImage
      .createFromPath(path.join(__dirname, "../../assets/codex.png"))
      .resize({ width: 18, height: 18 });
    image.setTemplateImage(true);
    fallbackTray = new Tray(image);
    fallbackTray.setToolTip("Mac Notch · 工具已关闭，请打开应用设置");

    fallbackTray.on("right-click", () =>
      fallbackTray.popUpContextMenu(
        Menu.buildFromTemplate([
                { label: "退出 Mac Notch", click: () => app.quit() },
        ]),
      ),
    );
    setExpanded(false);
    notch.hide();
  } else if (!locked) notch.showInactive();
  if (!refilterUsage) return;
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
const queuedQuotaProviders = new Set();
async function refreshQuotas(providers = enabled()) {
  if (quotalock) {
    for (const provider of providers) queuedQuotaProviders.add(provider);
    return;
  }
  quotalock = true;
  try {
    await Promise.all(
      providers.filter(provider => enabled().includes(provider)).map(async (provider) => {
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
    if (queuedQuotaProviders.size) {
      const queued = [...queuedQuotaProviders];
      queuedQuotaProviders.clear();
      void refreshQuotas(queued);
    }
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
    const foreground = notificationForeground();
    notifications.observe([...state.sessions.values()], Date.now(), foreground);
    syncNotification(foreground);
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
  if (app.isQuitting) return false;
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
  notifications.setEnabled(store.public().notifications);
  notifications.setWaitingEnabled(store.public().assistanceNotifications);
  transport = session.fromPartition("mac-notch-network");
  await transport.setProxy(
    store.public().proxy
      ? {
          proxyRules: store.public().proxy,
          proxyBypassRules: "<local>;localhost;127.0.0.1",
        }
      : { mode: "system" },
  );
  const updateArch = process.arch === "arm64" || (process.platform === "darwin" && app.runningUnderARM64Translation) ? "arm64" : "x64";
  updater = createUpdater({ version: app.getVersion(), arch: updateArch,
    fetch: (...args) => transport.fetch(...args), directory: path.join(app.getPath("userData"), "updates"),
    openPath: file => shell.openPath(file), onChange: () => render() });
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
    height: 720,
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
  ipcMain.on("notch:pointer", event => {
    if (notch && !notch.isDestroyed() && event.sender === notch.webContents) syncPointerRegion();
  });
  ipcMain.handle("notch:collapse-finished", (event, id) => {
    if (notch && !notch.isDestroyed() && !app.isQuitting && event.sender === notch.webContents) finishCollapse(id);
  });
  ipcMain.handle("notch:measure", (event, measurement) => {
    if (!notch || notch.isDestroyed() || app.isQuitting) return null;
    if (event.sender !== notch.webContents || !baseGeometry || !measurement) return null;
    const { left, right, single, key } = measurement;
    if (![left, right].every(n => Number.isInteger(n) && n >= 0 && n <= 1024) ||
        typeof single !== "boolean" || (!smoke && key !== contentKey(payload()))) return null;
    geometry = contentLayout(baseGeometry, { left, right, single });
    applyBounds();
    syncPointerRegion();
    return { geometry, frame: notch.getBounds(), collapse: collapseMotion };
  });
  for (const action of ["dismiss", "open", "hover", "focus"]) {
    ipcMain.on(`notification:${action}`, (event, key, value) => {
      if (app.isQuitting || !notch || notch.isDestroyed() || event.sender !== notch.webContents || key !== notifications.current?.key) return;
      if (action === "open") return openNotification(key);
      if (action === "dismiss") notifications.dismiss(key);
      else notifications.pause(action, value === true);
      applyBounds(); render();
    });
  }
  ipcMain.on("tool:open", (event, provider) => {
    if (own(event)) openTool(provider);
  });
  ipcMain.on("panel:toggle", (event) => {
    if (own(event)) togglePanel();
  });
  ipcMain.on("gesture", (event, gesture) => {
    if (app.isQuitting || !notch || notch.isDestroyed() || event.sender !== notch.webContents || !["double", "right"].includes(gesture)) return;
    const settingsGesture = store.public().swapGestures ? "double" : "right";
    if (gesture === settingsGesture) showSettings(); else togglePanel();
  });
  ipcMain.on("notification:preview", (event, kind) => {
    if (event.sender !== panel.webContents || !["waiting", "ended"].includes(kind)) return;
    setExpanded(false);
    notifications.pending.unshift({ key: `preview:${Date.now()}`, preview: true, kind,
      duration: kind === "waiting" ? 8000 : 5000, provider: "codex", createdAt: Date.now(),
      title: "Mac Notch 体验优化",
      description: kind === "waiting" ? "请选择接下来执行的方案。" : "已整理好结果，可以回到会话查看。" });
    syncNotification();
  });
  for (const operation of ["check", "download", "open"])
    ipcMain.handle(`update:${operation}`, event => event.sender === panel.webContents ? updater[operation]() : null);
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
    const before = store.public();
    const loginChanged = typeof value?.startAtLogin === "boolean" && value.startAtLogin !== before.startAtLogin;
    let loginApplied = false;
    try {
      if (loginChanged && app.isPackaged && !isolated) {
        app.setLoginItemSettings({ openAtLogin: value.startAtLogin });
        loginApplied = true;
      }
      // Renderer may change only user-facing preferences. Legacy encrypted credentials
      // and proxy settings remain compatible, but are no longer editable here.
      const result = store.update({
        providers: value?.providers,
        startAtLogin: value?.startAtLogin,
        idleQuota: value?.idleQuota,
        notifications: value?.notifications,
        assistanceNotifications: value?.assistanceNotifications,
        swapGestures: value?.swapGestures,
        menuBar: value?.menuBar,
        setupComplete: value?.setupComplete,
      });
      if (before.notifications !== result.notifications) {
        notifications.setEnabled(result.notifications, [...state.sessions.values()]);
        syncNotification();
      }
      if (before.assistanceNotifications !== result.assistanceNotifications) {
        notifications.setWaitingEnabled(result.assistanceNotifications, [...state.sessions.values()]);
        syncNotification();
      }
      const providersChanged = PROVIDERS.some(p => before.providers[p] !== result.providers[p]);
      const menuChanged = PROVIDERS.some(p => before.menuBar[p] !== result.menuBar[p]);
      if (providersChanged || menuChanged) syncProviders({ refilterUsage: providersChanged });
      lastRender = "";
      render();
      const newlyEnabled = PROVIDERS.filter(p => !before.providers[p] && result.providers[p]);
      if (newlyEnabled.length) {
        for (const provider of newlyEnabled) quotas[provider].retryAfter = 0;
        void refreshQuotas(newlyEnabled);
        void scan();
      }
      return { ok: true, settings: result };
    } catch (e) {
      if (loginApplied) {
        try { app.setLoginItemSettings({ openAtLogin: before.startAtLogin }); } catch {}
      }
      return { ok: false, error: e.message, settings: store.public() };
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
    showSettings();
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
    cancelCollapse();
    visitAttention([], null);
    notifications.clear();
    notifications.pause("lock", true);
    notch.hide();
    panel.hide();
  });
  powerMonitor.on("unlock-screen", () => {
    locked = false;
    notifications.pause("lock", false);
    position();
    if (enabled().length) notch.showInactive();
    scan();
  });
  notificationTimer = setInterval(syncNotification, 100);
  if (!smoke) scanTimer = setInterval(scan, 2000);
  quotaTimer = setInterval(refreshQuotas, 120000);
  attentionTimer = setInterval(() => {
    if (locked || demo || smoke) return;
    acknowledgeVisits(frontmostTool());
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
          notifications,
          syncNotification,
          acknowledgeVisits,
          state,
          store,
          syncProviders,
          app,
        }),
      1000,
    );
});
app.on("before-quit", () => {
  app.isQuitting = true;
  cancelCollapse();
  clearInterval(scanTimer);
  clearInterval(quotaTimer);
  clearInterval(attentionTimer);
  clearInterval(notificationTimer);
  updater?.dispose();
  usageWorker?.terminate();
});
app.on("window-all-closed", () => {});
app.on("second-instance", () => {
  if (panel) showSettings();
});

app.on("activate", () => { if (panel) showSettings(); });
