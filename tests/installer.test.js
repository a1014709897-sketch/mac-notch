"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const installer = path.resolve(__dirname, "../site/install.sh");

function harness(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mac-notch-installer-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home"), bin = path.join(root, "bin"), tmp = path.join(root, "tmp");
  for (const dir of [home, bin, tmp]) fs.mkdirSync(dir);
  const writeCommand = (name, contents) => fs.writeFileSync(path.join(bin, name), `#!/bin/bash\nset -e\n${contents}\n`, { mode: 0o755 });
  writeCommand("uname", `echo ${options.platform || "Darwin"}`);
  writeCommand("sw_vers", `echo ${options.version || "13.0"}`);
  writeCommand("sysctl", `echo ${options.arm64 ?? "1"}`);
  writeCommand("id", `echo ${options.uid ?? "501"}`);
  writeCommand("curl", `touch "$TEST_ROOT/network-used"\nif [ "${options.networkFailure || false}" = true ]; then exit 22; fi\nwhile [ "$#" -gt 0 ]; do\n if [ "$1" = --output ]; then shift; printf 'release fixture' > "$1"; exit 0; fi\n shift\ndone\nexit 1`);
  writeCommand("shasum", `echo '${options.badHash ? "incorrect" : "41ffe28d1c021395d03f850dfb61cbe055ee762f62d040a9f3fc27f663918c37"}  fixture.zip'`);
  writeCommand("ditto", `touch "$TEST_ROOT/extraction-used"\nif [ "$1" = -x ]; then\n mkdir -p "$4/Mac Notch.app/Contents"\n cat > "$4/Mac Notch.app/Contents/Info.plist" <<'PLIST'\n<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${options.badBundle ? "unexpected.app" : "io.github.a1014709897-sketch.macnotch"}</string><key>CFBundleShortVersionString</key><string>0.2.0</string></dict></plist>\nPLIST\nelse\n cp -R "$1" "$2"\nfi`);
  writeCommand("codesign", `touch "$TEST_ROOT/signature-checked"\nexit ${options.badSignature ? "1" : "0"}`);
  const dest = path.join(home, "Applications/Mac Notch.app");
  if (options.existing) {
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "keep.txt"), "existing application");
  }
  const run = (...args) => spawnSync("bash", [installer, ...args], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: home, TMPDIR: tmp, TEST_ROOT: root }, encoding: "utf8",
  });
  return { root, home, tmp, dest, run };
}

test("installer rejects unsupported systems before accessing the network", t => {
  for (const options of [{ platform: "Linux" }, { version: "12.7" }, { version: "unknown" }, { arm64: "0" }, { uid: "0" }]) {
    const h = harness(t, options), result = h.run();
    assert.notEqual(result.status, 0, JSON.stringify(options));
    assert.equal(fs.existsSync(path.join(h.root, "network-used")), false);
    assert.equal(fs.existsSync(h.dest), false);
  }
});
test("installer documents verification mode and rejects unknown options", t => {
  const h = harness(t);
  assert.match(h.run("--help").stdout, /verify-only/);
  assert.notEqual(h.run("--unrecognized").status, 0);
  assert.notEqual(h.run("--verify-only", "extra").status, 0);
  assert.equal(fs.existsSync(path.join(h.root, "network-used")), false);
});
test("installer preserves an existing app without downloading or replacing it", t => {
  const h = harness(t, { existing: true }), result = h.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nothing was replaced/);
  assert.equal(fs.readFileSync(path.join(h.dest, "keep.txt"), "utf8"), "existing application");
  assert.equal(fs.existsSync(path.join(h.root, "network-used")), false);
});
test("installer stops on download failure and cleans temporary files", t => {
  const h = harness(t, { networkFailure: true });
  assert.notEqual(h.run().status, 0);
  assert.equal(fs.existsSync(h.dest), false);
  assert.deepEqual(fs.readdirSync(h.tmp), []);
});
test("installer refuses checksum mismatch before extracting an archive", t => {
  const h = harness(t, { badHash: true }), result = h.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA-256 mismatch/);
  assert.equal(fs.existsSync(path.join(h.root, "extraction-used")), false);
  assert.equal(fs.existsSync(h.dest), false);
  assert.deepEqual(fs.readdirSync(h.tmp), []);
});
test("installer rejects unexpected bundle identity", { skip: process.platform !== "darwin" }, t => {
  const h = harness(t, { badBundle: true }), result = h.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected application identity/);
  assert.equal(fs.existsSync(h.dest), false);
});
test("installer rejects an invalid signature before installing", { skip: process.platform !== "darwin" }, t => {
  const h = harness(t, { badSignature: true });
  assert.notEqual(h.run().status, 0);
  assert.equal(fs.existsSync(h.dest), false);
});
test("installer installs a verified fixture only into the isolated user Applications directory", { skip: process.platform !== "darwin" }, t => {
  const h = harness(t), result = h.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.existsSync(path.join(h.dest, "Contents/Info.plist")), true);
  assert.equal(fs.existsSync(path.join(h.root, "signature-checked")), true);
  assert.deepEqual(fs.readdirSync(h.tmp), []);
  assert.deepEqual(fs.readdirSync(path.join(h.home, "Applications")), ["Mac Notch.app"]);
});
test("verify-only checks the fixture without installing or replacing an app", { skip: process.platform !== "darwin" }, t => {
  const h = harness(t), result = h.run("--verify-only");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no application installed or launched/);
  assert.equal(fs.existsSync(path.join(h.root, "signature-checked")), true);
  assert.equal(fs.existsSync(h.dest), false);
});
