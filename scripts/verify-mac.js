"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const arch = process.argv[2];
if (!["arm64", "x64"].includes(arch)) throw new Error("Usage: node scripts/verify-mac.js arm64|x64 [--runtime]");
const app = path.resolve(arch === "arm64" ? "dist/mac-arm64/Mac Notch.app" : "dist/mac/Mac Notch.app");
const executable = path.join(app, "Contents/MacOS/Mac Notch");
const native = path.join(app, `Contents/Resources/app.asar.unpacked/node_modules/@koromix/koffi-darwin-${arch}/darwin_${arch}/koffi.node`);
if (!fs.existsSync(native)) throw new Error(`Missing ${arch} Koffi binary; install dependencies for the target CPU before packaging`);
for (const file of [executable, native]) execFileSync("/usr/bin/lipo", ["-verify_arch", arch === "x64" ? "x86_64" : "arm64", file]);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
if (process.argv.includes("--runtime")) {
  const koffi = path.join(app, "Contents/Resources/app.asar/node_modules/koffi");
  const code = `const k=require(${JSON.stringify(koffi)}); const pid=k.load('/usr/lib/libSystem.B.dylib').func('getpid','int',[])(); if(process.arch!==${JSON.stringify(arch)}||pid!==process.pid)process.exit(1); console.log('Native FFI runtime verified: '+process.arch);`;
  execFileSync(executable, ["-e", code], {env:{...process.env,ELECTRON_RUN_AS_NODE:"1"},stdio:"inherit"});
}
console.log(`Verified ${arch}: Electron and Koffi architecture, signature integrity`);
