"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("macNotch", {
  get: () => ipcRenderer.invoke("state:get"),
  onState: (callback) =>
    ipcRenderer.on("state", (_event, state) => callback(state)),
  onNotice: (callback) =>
    ipcRenderer.on("notice", (_event, text) => callback(text)),
  notification: (action, key, value) => {
    if (["open", "dismiss", "hover", "focus"].includes(action))
      ipcRenderer.send(`notification:${action}`, key, value);
  },
  open: (provider) => ipcRenderer.send("tool:open", provider),
  panel: () => ipcRenderer.send("panel:toggle"),
  closeSettings: () => ipcRenderer.send("settings:close"),
  collapse: () => ipcRenderer.send("panel:close"),
  refresh: () => ipcRenderer.send("quota:refresh"),
  save: (value) => ipcRenderer.invoke("settings:save", value),
  quit: () => ipcRenderer.send("app:quit"),
  demo: (state) => ipcRenderer.send("demo:set", state),
});
