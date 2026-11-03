"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
let failed = false,
  count = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(f);
    else if (f.endsWith(".js")) {
      const r = spawnSync(process.execPath, ["--check", f], {
        encoding: "utf8",
      });
      count++;
      if (r.status) {
        console.error(r.stderr);
        failed = true;
      }
    }
  }
}
walk("src");
walk("scripts");
console.log(`Syntax checked ${count} JavaScript files`);
process.exitCode = failed ? 1 : 0;
