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

test("provider preferences persist independently and migrate existing settings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mac-notch-providers-"));
  try {
    fs.writeFileSync(
      path.join(dir, "settings.json"),
      JSON.stringify({ startAtLogin: true, proxy: "http://127.0.0.1:7890" }),
    );
    const store = createStore(dir, {});
    assert.deepEqual(store.public().providers, { claude: true, codex: true });
    assert.equal(store.public().setupComplete, false);
    store.update({ providers: { claude: false }, setupComplete: true });
    assert.deepEqual(createStore(dir, {}).public().providers, {
      claude: false,
      codex: true,
    });
    assert.equal(store.public().proxy, "http://127.0.0.1:7890");
    assert.equal(store.public().setupComplete, true);
    store.update({ providers: { codex: false } });
    assert.deepEqual(store.public().providers, { claude: false, codex: false });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
