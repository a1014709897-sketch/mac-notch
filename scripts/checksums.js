"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

async function main() {
  const files = fs.readdirSync("dist").filter(name => /^Mac-Notch-.*\.(dmg|zip)$/.test(name)).sort();
  if (!files.length) throw new Error("No release artifacts found in dist");
  const lines = [];
  for (const name of files) {
    const hash = createHash("sha256");
    for await (const chunk of fs.createReadStream(path.join("dist", name))) hash.update(chunk);
    lines.push(`${hash.digest("hex")}  ${name}`);
  }
  fs.writeFileSync("dist/SHA256SUMS.txt", lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
