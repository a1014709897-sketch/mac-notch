"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const source = path.resolve(__dirname, "../site");
const output = path.resolve(__dirname, "../.site-dist");
const html = fs.readFileSync(path.join(source, "index.html"), "utf8");
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
for (const [, ref] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  if (/^https:\/\//.test(ref)) continue;
  if (ref.startsWith("#")) {
    if (ref.length > 1 && !ids.has(ref.slice(1))) throw new Error(`Missing anchor: ${ref}`);
  } else if (!ref.startsWith("./") || !fs.existsSync(path.join(source, ref))) {
    throw new Error(`Missing or non-relative site asset: ${ref}`);
  }
}
for (const [command, args] of [[process.execPath, ["--check", path.join(source, "app.js")]], ["bash", ["-n", path.join(source, "install.sh")]]]) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
const command = html.match(/<code id="install-command">([^<]+)<\/code>/)?.[1];
if (command !== "curl -fsSL https://a1014709897-sketch.github.io/mac-notch/install.sh | bash") throw new Error("Unexpected installation command");
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
// Keep a cached script or stylesheet from being mixed with a newer page.
const publishedHtml = html.replace(/\b(href|src)="(\.\/[^"?#]+\.(?:css|js))"/g, (_, attribute, ref) => {
  const version = createHash("sha256").update(fs.readFileSync(path.join(source, ref))).digest("hex").slice(0, 12);
  return `${attribute}="${ref}?v=${version}"`;
});
fs.writeFileSync(path.join(output, "index.html"), publishedHtml);
console.log(`Built GitHub Pages site: ${output}`);
