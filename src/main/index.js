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
const { layout } = require("./layout");
const { createStore } = require("./store");
const {
  readMacNotchScreens,
} = require("../vendor/token-monitor/src/electron/notch/screen");
const {
  frontmostTool,
  createTaskAttention,
} = require("../vendor/token-monitor/src/electron/notch/taskAttention");
const demo = process.argv.includes("--demo");
const smoke = process.argv.includes("--smoke");
app.setName("Mac Notch");
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
  quotaTimer;
const state = new TaskState(),
  attention = createTaskAttention(),
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
    tasks: state.snapshot(),
    quotas,
    settings: store.public(),
    geometry,
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
  const display =
    screen
      .getAllDisplays()
      .find((d) => String(d.id) === String(native.mainDisplayId)) ||
    screen.getPrimaryDisplay();
  geometry = layout(
    display,
    native.screens?.find((s) => String(s.displayId) === String(display.id)),
  );
  notch.setBounds({
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
  });
  if (panel?.isVisible()) positionPanel();
  lastRender = "";
  render();
}
function positionPanel() {
  const display = screen.getDisplayMatching(notch.getBounds());
  const work = display.workArea;
  panel.setBounds({
    x: Math.max(
      work.x,
      Math.min(
        geometry.x + geometry.width / 2 - 180,
        work.x + work.width - 360,
      ),
    ),
    y: geometry.y + geometry.height + 8,
    width: 360,
    height: 590,
  });
}
function togglePanel() {
  if (panel.isVisible()) {
    panel.hide();
    return;
  }
  positionPanel();
  panel.show();
  panel.webContents.send("state", payload());
}
function openTool(provider) {
  if (!bundles[provider]) return;
  execFile("/usr/bin/open", ["-b", bundles[provider]], (error) => {
    if (error) {
      positionPanel();
      panel.show();
      panel.webContents.send(
        "notice",
        `未能打开 ${provider}，请先安装官方客户端`,
      );
      return;
    }
    state.acknowledge(provider);
    render();
  });
}
function menu(provider) {
  return Menu.buildFromTemplate([
    {
      label: `打开 ${provider === "claude" ? "Claude" : "Codex"}`,
      click: () => openTool(provider),
    },
    { label: "额度与设置", click: togglePanel },
    { label: "刷新额度", click: () => refreshQuotas() },
    { type: "separator" },
    { label: "退出 Mac Notch", click: () => app.quit() },
  ]);
}
function updateTray(provider) {
  const tray = trays.get(provider),
    q = quotas[provider],
    value = remaining(q);
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
      PROVIDERS.map(async (provider) => {
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
    if (!demo && !smoke) state.update(await readActivity());
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
    width: 360,
    height: 590,
    show: false,
    frame: false,
    resizable: false,
    backgroundColor: "#11151c",
    webPreferences,
  });
  protect(panel);
  panel.on("blur", () => panel.hide());
  panel.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      panel.hide();
    }
  });
  // Create in reverse order because macOS inserts newer status items on the left.
  for (const provider of [...PROVIDERS].reverse()) {
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
  ipcMain.handle("state:get", (event) => (own(event) ? payload() : null));
  ipcMain.on("tool:open", (event, provider) => {
    if (own(event)) openTool(provider);
  });
  ipcMain.on("panel:toggle", (event) => {
    if (own(event)) togglePanel();
  });
  ipcMain.on("quota:refresh", (event) => {
    if (own(event)) refreshQuotas();
  });
  ipcMain.on("app:quit", (event) => {
    if (own(event)) app.quit();
  });
  ipcMain.handle("settings:save", async (event, value) => {
    if (!own(event)) return { ok: false };
    try {
      const result = store.update(value || {});
      await transport.setProxy(
        result.proxy
          ? {
              proxyRules: result.proxy,
              proxyBypassRules: "<local>;localhost;127.0.0.1",
            }
          : { mode: "system" },
      );
      if (app.isPackaged)
        app.setLoginItemSettings({ openAtLogin: result.startAtLogin });
      for (const q of Object.values(quotas)) q.retryAfter = 0;
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
  notch.showInactive();
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
    notch.showInactive();
    scan();
  });
  scanTimer = setInterval(scan, 2000);
  quotaTimer = setInterval(refreshQuotas, 120000);
  attentionTimer = setInterval(() => {
    if (locked || demo || smoke) return;
    const tasks = state.snapshot().map((t) => ({ ...t, taskState: t.state }));
    for (const provider of attention(tasks, frontmostTool(), Date.now()))
      state.acknowledge(provider);
    render();
  }, 300);
  if (smoke) {
    setTimeout(async () => {
      const results = [];
      const cases = [
        ["idle", "idle"],
        ["idle", "running"],
        ["idle", "waiting"],
        ["idle", "ended"],
        ["running", "running"],
        ["waiting", "running"],
      ];
      for (const states of cases) {
        notch.webContents.send("state", {
          ...payload(),
          tasks: PROVIDERS.map((provider, i) => ({
            provider,
            state: states[i],
            count: 1,
          })),
        });
        await new Promise((resolve) => setTimeout(resolve, 375));
        const result = await notch.webContents.executeJavaScript(
          `({count:document.querySelectorAll('button.tool').length,width:innerWidth,height:innerHeight,overflow:document.body.scrollWidth>innerWidth,dots:document.querySelectorAll('.dots i').length,question:document.querySelectorAll('.question').length,check:document.querySelectorAll('.check').length,regions:[...document.querySelectorAll('.logo,.status')].filter(n=>getComputedStyle(n).display!=='none').map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};})})`,
        );
        result.states = states;
        results.push(result);
        if (process.env.MAC_NOTCH_SMOKE_OUTPUT) {
          fs.mkdirSync(process.env.MAC_NOTCH_SMOKE_OUTPUT, { recursive: true });
          fs.writeFileSync(
            path.join(
              process.env.MAC_NOTCH_SMOKE_OUTPUT,
              states.join("-") + ".png",
            ),
            (await notch.webContents.capturePage()).toPNG(),
          );
        }
      }
      const iconsLoaded = [...trays.values()].length === 2 && PROVIDERS.every(provider=>!nativeImage.createFromPath(path.join(__dirname,'../../assets',`${provider}.png`)).isEmpty());
      const panelCheck = await panel.webContents.executeJavaScript(`({quotaCards:document.querySelectorAll('#quotas article').length,bodyWidth:document.body.scrollWidth,windowWidth:innerWidth})`);
      if(process.env.MAC_NOTCH_SMOKE_OUTPUT) fs.writeFileSync(path.join(process.env.MAC_NOTCH_SMOKE_OUTPUT,'quotas.png'),(await panel.webContents.capturePage()).toPNG());
      const ok = iconsLoaded && panelCheck.quotaCards===2 && panelCheck.bodyWidth<=panelCheck.windowWidth && results.every(
        (r) =>
          !r.overflow &&
          r.width === results[0].width &&
          r.height === results[0].height &&
          (!geometry.hardware || r.regions.every(region=>region.right<=(geometry.width-geometry.gap)/2+1 || region.left>=(geometry.width+geometry.gap)/2-1)) &&
          r.dots === r.states.filter((s) => s === "running").length * 3 &&
          r.question === r.states.filter((s) => s === "waiting").length &&
          r.check === r.states.filter((s) => s === "ended").length,
      );
      console.log("SMOKE", JSON.stringify({ ok, iconsLoaded, panelCheck, results }));
      app.exit(ok ? 0 : 1);
    }, 1000);
  }
});
app.on("before-quit", () => {
  app.isQuitting = true;
  clearInterval(scanTimer);
  clearInterval(quotaTimer);
  clearInterval(attentionTimer);
});
app.on("window-all-closed", () => {});
app.on("second-instance", () => {
  if (panel) togglePanel();
});
