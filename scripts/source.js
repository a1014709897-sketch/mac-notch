"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawnSync } = require("node:child_process");
const version = require("../package.json").version;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mac-notch-source-"));
const root = path.join(tmp, `Mac-Notch-${version}-source`);
fs.mkdirSync(root);
const entries = [
  "src",
  "assets",
  "scripts",
  "tests",
  "docs",
  "site",
  ".github",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  ".gitignore",
  "package.json",
  "package-lock.json",
];
try {
  for (const name of entries)
    fs.cpSync(name, path.join(root, name), { recursive: true, filter: source => path.basename(source) !== "AGENTS.md" });
  fs.mkdirSync("dist", { recursive: true });
  const output = path.resolve(`dist/Mac-Notch-${version}-source.zip`);
  const result = spawnSync(
    "/usr/bin/ditto",
    ["-c", "-k", "--norsrc", "--noextattr", "--noacl", "--keepParent", root, output],
    { stdio: "inherit" },
  );
  if (result.status) process.exitCode = result.status;
  else console.log(output);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
