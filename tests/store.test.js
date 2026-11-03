"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { createStore } = require("../src/main/store");
test("settings DTO omits secrets and refuses unavailable encryption or credential-bearing proxy URLs", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mac-notch-store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const s = createStore(dir, { isEncryptionAvailable: () => false });
  assert.throws(() => s.update({ claudeCookie: "sk-ant-secret" }));
  assert.throws(() => s.update({ proxy: "http://u:pass@host:80" }));
  assert.equal(s.public().claudeCookie, undefined);
  s.update({ proxy: "http://127.0.0.1:7890" });
  assert.equal(s.public().proxy, "http://127.0.0.1:7890");
  assert.throws(() =>
    s.update({ startAtLogin: true, proxy: "http://user:password@host:80" }),
  );
  assert.equal(s.public().startAtLogin, false);
});
