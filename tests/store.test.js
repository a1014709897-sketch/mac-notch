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
    assert.deepEqual(store.public().providers, { claude: true, codex: true, workbuddy: false });
    assert.equal(store.public().setupComplete, false);
    store.update({ providers: { claude: false }, setupComplete: true });
    assert.deepEqual(createStore(dir, {}).public().providers, {
      claude: false,
      codex: true,
      workbuddy: false,
    });
    assert.equal(store.public().proxy, "http://127.0.0.1:7890");
    assert.equal(store.public().setupComplete, true);
    store.update({ providers: { codex: false } });
    assert.deepEqual(store.public().providers, { claude: false, codex: false, workbuddy: false });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('display preferences migrate, persist independently, and reject non-booleans', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-notch-display-'));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  const store = createStore(dir, {});
  assert.equal(store.public().idleQuota, true);
  assert.deepEqual(store.public().menuBar, {claude:true,codex:true,workbuddy:true});
  store.update({idleQuota:true, menuBar:{claude:false}});
  const reopened = createStore(dir, {});
  assert.equal(reopened.public().idleQuota, true);
  assert.deepEqual(reopened.public().menuBar, {claude:false,codex:true,workbuddy:true});
  assert.deepEqual(reopened.public().providers, {claude:true,codex:true,workbuddy:false});
  reopened.update({idleQuota:'false',menuBar:{codex:false}});
  assert.equal(reopened.public().idleQuota, true);
  assert.deepEqual(reopened.public().menuBar, {claude:false,codex:false,workbuddy:true});
});

test('notifications default on for new and legacy settings and persist an explicit off', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-notch-notifications-'));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  assert.equal(createStore(dir, {}).public().notifications, true);
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({startAtLogin:true}));
  const store = createStore(dir, {});
  assert.equal(store.public().notifications, true);
  store.update({notifications:false});
  const reopened = createStore(dir, {});
  assert.equal(reopened.public().notifications, false);
  reopened.update({notifications:'true'});
  assert.equal(reopened.public().notifications, false);
  reopened.update({notifications:true});
  assert.equal(createStore(dir, {}).public().notifications, true);
});

test('new defaults preserve old explicit choices, migrate muted notices and persist gestures', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-notch-migration-'));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  assert.equal(createStore(dir, {}).public().idleQuota, true);
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({idleQuota:false,notifications:false}));
  const store = createStore(dir, {});
  assert.equal(store.public().idleQuota, false);
  assert.equal(store.public().assistanceNotifications, false);
  store.update({assistanceNotifications:true,swapGestures:true});
  const saved = createStore(dir, {}).public();
  assert.equal(saved.swapGestures,true); assert.equal(saved.assistanceNotifications,true); assert.equal(saved.notifications,false);
});

test('WorkBuddy is opt-in; a third provider is rejected atomically; pairs and all-off survive reopen', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'notch-provider-limit-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=createStore(dir,{});
  assert.equal(store.public().providers.workbuddy,false);
  assert.throws(()=>store.update({providers:{workbuddy:true}}),/最多.*2/);
  assert.equal(store.public().providers.workbuddy,false);
  for(const providers of [{claude:false,codex:true,workbuddy:true},{claude:true,codex:false,workbuddy:true},{claude:false,codex:false,workbuddy:true},{claude:false,codex:false,workbuddy:false}]) {
    store.update({providers});assert.deepEqual(createStore(dir,{}).public().providers,providers);
  }
  fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({providers:{claude:true,codex:true,workbuddy:true}}));
  assert.deepEqual(createStore(dir,{}).public().providers,{claude:true,codex:true,workbuddy:false});
});
