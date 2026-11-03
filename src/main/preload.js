"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("macNotch", {
  pointer: () => ipcRenderer.send("notch:pointer"),
  measure: value => ipcRenderer.invoke("notch:measure", value),
  finishCollapse: id => ipcRenderer.invoke("notch:collapse-finished", id),
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
  gesture: value => ipcRenderer.send("gesture", value),
  previewNotification: kind => ipcRenderer.send("notification:preview", kind),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  openUpdate: () => ipcRenderer.invoke("update:open"),
  panel: () => ipcRenderer.send("panel:toggle"),
  closeSettings: () => ipcRenderer.send("settings:close"),
  collapse: () => ipcRenderer.send("panel:close"),
  refresh: () => ipcRenderer.send("quota:refresh"),
  save: (value) => ipcRenderer.invoke("settings:save", value),
  quit: () => ipcRenderer.send("app:quit"),
  demo: (state) => ipcRenderer.send("demo:set", state),
});
