"use strict";
const $ = (id) => document.getElementById(id);
const fields = {
  claude: ["providers", "claude"],
  codex: ["providers", "codex"],
  "idle-quota": ["idleQuota"],
  "menu-claude": ["menuBar", "claude"],
  "menu-codex": ["menuBar", "codex"],
  login: ["startAtLogin"],
  notifications: ["notifications"],
};
let settings, queue = Promise.resolve(), revision = 0;
const pending = new Map(), errors = new Map();
const valueAt = (data, keys) => keys.reduce((value, key) => value?.[key], data);
function syncControls() {
  for (const [id, keys] of Object.entries(fields))
    if (!pending.has(id)) $(id).checked = valueAt(settings, keys) === true;
}
function render(data) {
  settings = data.settings;
  syncControls();
  $("version").textContent = `v${data.version}`;
}
for (const [id, keys] of Object.entries(fields)) {
  $(id).onchange = () => {
    const checked = $(id).checked, version = ++revision;
    const patch = keys.length === 2
      ? { [keys[0]]: { [keys[1]]: checked } }
      : { [keys[0]]: checked };
    pending.set(id, version);
    errors.delete(id);
    $("notice").textContent = [...errors.values()].join("；");
    // Serialize partial updates: rapid clicks keep their order and never write
    // an old snapshot of another switch back over the user's latest choice.
    queue = queue.then(async () => {
      try {
        const result = await macNotch.save({ ...patch, setupComplete: true });
        if (result.settings) settings = result.settings;
        if (!result.ok) throw new Error(result.error || "设置未能保存，请重试");
      } catch (error) {
        if (pending.get(id) === version)
          errors.set(id, `修改未生效：${error.message}`);
      } finally {
        if (pending.get(id) === version) pending.delete(id);
        syncControls();
        $("notice").textContent = [...errors.values()].join("；");
      }
    });
  };
}
$("settings").onsubmit = (event) => event.preventDefault();
$("quit").onclick = () => macNotch.quit();
macNotch.onNotice((text) => ($("notice").textContent = text));
macNotch.onState(render);
macNotch.get().then(render);
