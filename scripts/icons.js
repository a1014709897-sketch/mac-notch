"use strict";
// Build-time SVG rasterization using the project's pinned Electron renderer.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  const w = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true },
  });
  await w.loadURL("about:blank");
  for (const name of (process.argv.includes("--workbuddy") ? ["workbuddy"] : ["claude", "codex", "workbuddy", "app"])) {
    const svg = fs
      .readFileSync(path.join(__dirname, "../assets", name + ".svg"), "utf8")
      .replace(/width="1em"/, 'width="64"')
      .replace(/height="1em"/, 'height="64"');
    const size = name === "app" ? 512 : 64;
    const data = await w.webContents.executeJavaScript(
      `new Promise(resolve=>{const image=new Image();image.onload=()=>{const c=document.createElement('canvas');c.width=c.height=${size};c.getContext('2d').drawImage(image,0,0,${size},${size});resolve(c.toDataURL('image/png').split(',')[1]);};image.src=${JSON.stringify("data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"))};})`,
    );
    fs.writeFileSync(
      path.join(__dirname, "../assets", name + ".png"),
      Buffer.from(data, "base64"),
    );
  }
  w.destroy();
  app.quit();
});
